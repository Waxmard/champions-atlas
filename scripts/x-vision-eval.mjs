import {
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { speciesKey, stable, validateFixture } from './x-vision-fixture.mjs';
import {
  digest,
  digest as hash,
  storeAtomic,
  imageMime,
  maxImageBytes,
  normalizeImageUrl,
} from './x-vision-input.mjs';
import * as gemini from './x-vision-gemini.mjs';
import {
  createEvaluationFetch,
  sanitizeEvaluationValue as safeValue,
} from './x-vision-budget.mjs';
import {
  createVisionRun,
  model,
  promptVersion,
  schemaVersion,
  validateExtraction,
} from './x-vision.mjs';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixturePath = resolve(rootDir, 'test/fixtures/x-vision.json');
const defaultCacheDir = resolve(rootDir, '.cache/catalog');
const sharedQualificationPath = resolve(
  defaultCacheDir,
  'x-vision/qualification.json'
);
const protectedPaths = ['.cache/catalog', 'src', 'scripts', 'test'].map(
  (path) => resolve(rootDir, path)
);
const manifestSources = [
  'scripts/x-vision-eval.mjs',
  'scripts/x-vision-budget.mjs',
  'scripts/x-vision.mjs',
  'scripts/x-vision-gemini.mjs',
  'scripts/x-vision-input.mjs',
  'scripts/x-vision-fixture.mjs',
];

const within = (parent, child) => {
  const path = relative(parent, child);
  return (
    path === '' ||
    (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path))
  );
};

async function canonicalPath(value) {
  let current = resolve(value);
  const suffix = [];
  for (;;) {
    try {
      return resolve(await realpath(current), ...suffix);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      suffix.unshift(basename(current));
      current = parent;
    }
  }
}

async function checkedRunDir(value, requireExisting) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('--run-dir requires a nonempty path');
  let path = await canonicalPath(value);
  const protectedCanonical = await Promise.all(
    protectedPaths.map(canonicalPath)
  );
  const overlaps = (candidate) =>
    protectedCanonical.some(
      (item) => within(item, candidate) || within(candidate, item)
    );
  if (overlaps(path)) throw new Error('run directory overlaps protected paths');
  if (!requireExisting) {
    await mkdir(path, { recursive: true });
    path = await realpath(path);
    if (overlaps(path))
      throw new Error('run directory overlaps protected paths');
  }
  const entries = await readdir(path);
  if (
    entries.some(
      (entry) => !['preflight.json', 'qualification.json'].includes(entry)
    )
  )
    throw new Error(
      entries.includes('paid.started')
        ? 'run directory already contains paid.started'
        : 'run directory contains unexpected entries'
    );
  return path;
}

async function readManifestInputs(sourceCacheDir) {
  const issues = [];
  let fixture;
  let fixtureBytes;
  try {
    fixtureBytes = await readFile(fixturePath);
    fixture = JSON.parse(fixtureBytes.toString('utf8'));
    issues.push(...validateFixture(fixture));
  } catch (error) {
    issues.push('fixture unavailable: ' + error.message);
  }
  const verified = [];
  const byUrl = new Map();
  for (const record of fixture && !issues.length ? fixture.records : []) {
    let postBytes = 0;
    for (const media of record.media) {
      try {
        const url = normalizeImageUrl(media.url);
        if (url !== media.url) throw new Error('image URL is not normalized');
        const bytes = await readFile(
          join(sourceCacheDir, 'x-vision/images', digest(url) + '.bin')
        );
        if (bytes.length > maxImageBytes)
          throw new Error('image exceeds 8 MiB');
        const mime = imageMime(bytes);
        if (!mime) throw new Error('unsupported image signature');
        const sha256 = digest(bytes);
        if (sha256 !== media.sha256)
          throw new Error(`hash mismatch: ${sha256} != ${media.sha256}`);
        postBytes += bytes.length;
        if (postBytes > gemini.maxPostImageBytes)
          throw new Error('post images exceed 12 MiB');
        byUrl.set(url, { bytes, mime, sha256 });
        verified.push({
          postId: record.postId,
          index: media.index,
          url,
          sha256,
          bytes: bytes.length,
          mime,
        });
      } catch (error) {
        issues.push(record.postId + '/' + media.index + ': ' + error.message);
      }
    }
  }
  const sources = {};
  for (const path of manifestSources) {
    try {
      sources[path] = hash(await readFile(resolve(rootDir, path)));
    } catch (error) {
      issues.push('source unavailable (' + path + '): ' + error.message);
    }
  }
  let sharedQualificationSha256 = null;
  try {
    sharedQualificationSha256 = hash(await readFile(sharedQualificationPath));
  } catch (error) {
    if (error.code !== 'ENOENT')
      issues.push('shared qualification unavailable: ' + error.message);
  }
  const fixtureSha256 = fixtureBytes ? hash(fixtureBytes) : null;
  const datasetSha256 = fixture ? hash(stable(fixture)) : null;
  const mediaManifestSha256 = hash(
    stable(
      verified.map(({ postId, index, url, sha256 }) => ({
        postId,
        index,
        url,
        sha256,
      }))
    )
  );
  const manifest = fixtureBytes
    ? {
        fixtureSha256,
        datasetSha256,
        mediaManifestSha256,
        images: verified,
        sources,
        sharedQualificationSha256,
      }
    : null;
  return {
    fixture,
    issues,
    images: { verified, byUrl },
    fixtureSha256,
    manifest,
  };
}

const cosmeticSuffix =
  /-(?:mega[xyz]?|[xyz]|[fm]|hero|eternal|masterpiece|antique|artisan)$/;
const comparisonKey = (pokemon) =>
  speciesKey(pokemon).replace(cosmeticSuffix, '');
const ordered = (values) =>
  [...values].sort((a, b) => a.localeCompare(b, 'en'));
const allocationKey = (allocation) => ({
  ...allocation,
  pokemon: comparisonKey(allocation.pokemon),
});
function compareResult(expected, result) {
  const core = [];
  const optional = [];
  const omitted = [];
  if (result.summaryIndex !== expected.summaryIndex) core.push('summaryIndex');
  if (result.teamId !== null && result.teamId !== expected.teamId)
    core.push('teamId');
  const wanted = new Map(
    expected.members.map((member) => [comparisonKey(member.pokemon), member])
  );
  const actual = new Map(
    result.members.map((member) => [comparisonKey(member.pokemon), member])
  );
  if (
    wanted.size !== actual.size ||
    [...wanted.keys()].some((pokemon) => !actual.has(pokemon))
  )
    core.push('members');
  for (const [pokemon, gold] of wanted) {
    const observed = actual.get(pokemon);
    if (!observed) continue;
    if (observed.itemState !== gold.itemState || observed.item !== gold.item)
      core.push(gold.pokemon + '.item');
    if (
      ordered(observed.moves4.map(speciesKey)).join('|') !==
      ordered(gold.moves4.map(speciesKey)).join('|')
    )
      core.push(gold.pokemon + '.moves4');
    for (const field of ['ability', 'nature']) {
      if (observed[field] === null) {
        if (gold[field] !== null) omitted.push(gold.pokemon + '.' + field);
      } else if (observed[field] !== gold[field]) {
        optional.push(gold.pokemon + '.' + field);
      }
    }
    if (observed.allocation === null) {
      if (gold.allocation !== null) omitted.push(gold.pokemon + '.allocation');
    } else if (gold.allocation === null) {
      optional.push(gold.pokemon + '.allocation');
    } else {
      if (
        stable(allocationKey(observed.allocation)) !==
        stable(allocationKey(gold.allocation))
      )
        optional.push(gold.pokemon + '.allocation');
    }
  }
  return { core, optional, omitted };
}

export function scorePhase(label, records, outcomes) {
  const eligible = records.filter((record) => record.label === 'eligible');
  const negatives = records.length - eligible.length;
  const result = {
    label,
    records: records.length,
    eligible: eligible.length,
    negatives,
    accepted: 0,
    acceptedEligible: 0,
    wholeTeamCorrect: 0,
    unsafeNegativeAdmissions: 0,
    wrongCoreFields: 0,
    fabricatedOptionalFields: 0,
    optionalOmissions: 0,
    refusals: 0,
    errors: 0,
    errorReasons: {},
    cases: [],
  };
  for (const record of records) {
    const outcome = outcomes.get(record.postId);
    const entry = {
      postId: record.postId,
      status: outcome ? outcome.status : 'not-run',
    };
    result.cases.push(entry);
    if (!outcome) {
      result.errors++;
      continue;
    }
    if (outcome.status === 'accepted') result.accepted++;
    if (outcome.status === 'withheld') result.refusals++;
    if (outcome.status === 'error') {
      result.errors++;
      const reason = outcome.reason ?? 'unknown';
      result.errorReasons[reason] = (result.errorReasons[reason] ?? 0) + 1;
    }
    if (record.label === 'negative') {
      if (outcome.status === 'accepted') result.unsafeNegativeAdmissions++;
      continue;
    }
    if (outcome.status !== 'accepted') {
      entry.reason = outcome.reason ?? null;
      continue;
    }
    result.acceptedEligible++;
    try {
      const extraction = validateExtraction(
        outcome.result,
        record.media.length
      );
      const mismatch = compareResult(record.expected, extraction);
      result.wrongCoreFields += mismatch.core.length;
      result.fabricatedOptionalFields += mismatch.optional.length;
      result.optionalOmissions += mismatch.omitted.length;
      if (!mismatch.core.length && !mismatch.optional.length)
        result.wholeTeamCorrect++;
      Object.assign(entry, {
        coreMismatches: mismatch.core,
        optionalMismatches: mismatch.optional,
        optionalOmissions: mismatch.omitted,
      });
    } catch (error) {
      result.wrongCoreFields++;
      entry.validationError = error.message;
    }
  }
  result.eligibleRecall = eligible.length
    ? result.wholeTeamCorrect / eligible.length
    : 0;
  return result;
}

async function writeReport(runDir, report, key = '') {
  await storeAtomic(
    join(runDir, 'qualification.json'),
    JSON.stringify(safeValue(report, key), null, 2) + '\n'
  );
}

export async function preflight({
  runDir,
  sourceCacheDir = defaultCacheDir,
  requireExisting = false,
} = {}) {
  let path;
  try {
    path = await checkedRunDir(runDir, requireExisting);
  } catch (error) {
    return {
      fixture: null,
      issues: [error.message],
      images: { verified: [], byUrl: new Map() },
      runDir: null,
      manifest: null,
      ready: false,
    };
  }
  const result = await readManifestInputs(resolve(sourceCacheDir));
  const preflightPath = join(path, 'preflight.json');
  let saved;
  try {
    saved = JSON.parse(await readFile(preflightPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT')
      result.issues.push('saved preflight is invalid: ' + error.message);
  }
  if (saved) {
    const savedHash = saved.manifest ? hash(stable(saved.manifest)) : null;
    if (
      saved.manifestSha256 !== savedHash ||
      stable(saved.manifest) !== stable(result.manifest)
    )
      result.issues.push('saved preflight manifest mismatch');
    else result.savedManifestSha256 = savedHash;
  } else if (requireExisting) {
    result.issues.push('matching preflight.json is required');
  } else if (!result.issues.length && result.manifest) {
    const record = {
      manifest: result.manifest,
      manifestSha256: hash(stable(result.manifest)),
    };
    try {
      await writeFile(preflightPath, JSON.stringify(record, null, 2) + '\n', {
        flag: 'wx',
      });
      result.savedManifestSha256 = record.manifestSha256;
    } catch (error) {
      if (error.code !== 'EEXIST')
        result.issues.push('cannot save preflight: ' + error.message);
      else result.issues.push('preflight.json appeared during validation');
    }
  }
  result.runDir = path;
  result.sourceCacheDir = resolve(sourceCacheDir);
  result.ready = result.issues.length === 0;
  return result;
}
function baseReport(
  preflightResult,
  { requestCap = 0, runDir = preflightResult.runDir } = {}
) {
  const fixture = preflightResult.fixture;
  return {
    generatedAt: new Date().toISOString(),
    status: preflightResult.issues.length ? 'not-ready' : 'ready',
    passed: false,
    fixtureVersion: fixture?.fixtureVersion ?? null,
    fixtureSha256: preflightResult.fixtureSha256,
    coverageGaps: fixture?.coverageGaps ?? [],
    extractor: {
      model,
      promptVersion,
      schemaVersion,
      maxImageBytes,
      maxPostImageBytes: gemini.maxPostImageBytes,
      maxCallsPerPost: 3,
      outputTokens: { triage: 16384, detail: 32768 },
    },
    preflight: {
      ready: preflightResult.ready,
      issues: preflightResult.issues,
      mediaCount: preflightResult.images.verified.length,
      manifestSha256: preflightResult.savedManifestSha256 ?? null,
    },
    paid: { requestCap },
    phases: [],
    reportPath: runDir ? join(runDir, 'qualification.json') : null,
  };
}

async function evaluatePhase(records, phase, state) {
  const outcomes = new Map();
  const stopped = () =>
    state.signal.aborted ||
    state.guard.snapshot().stopReason ||
    state.productionStopReason ||
    state.runnerFailure;
  const scored = {
    ...scorePhase(phase, records, outcomes),
    evaluatedCount: 0,
    complete: false,
    outcomes: {},
  };
  state.report.phases.push(scored);
  let run;
  for (let index = 0; index < records.length && !stopped(); index++) {
    if (index % 20 === 0)
      run = createVisionRun({
        key: state.key,
        fetchImpl: state.guard.fetchImpl,
        cacheDir: resolve(state.runDir, phase, 'cache'),
        postLimit: Math.min(20, records.length - index),
        callLimit: 60,
      });
    const record = records[index];
    state.context = { phase, postId: record.postId };
    try {
      const post = {
        id: record.postId,
        url: record.postUrl,
        text: '',
        media: record.media.map(({ index, url, sha256 }) => ({
          index,
          original: url,
          sha256,
        })),
      };
      outcomes.set(record.postId, await run.evaluate(post, { fresh: true }));
    } catch (error) {
      state.runnerFailure = scrubString(error.message, state.key);
      outcomes.set(record.postId, {
        status: 'error',
        reason: state.runnerFailure,
      });
    }
    state.productionStopReason ??= run.stats().stopReason;
    Object.assign(scored, scorePhase(phase, records, outcomes), {
      evaluatedCount: outcomes.size,
      complete: outcomes.size === records.length && !stopped(),
      outcomes: Object.fromEntries(outcomes),
    });
    updatePaid(state.report, state.guard.snapshot());
    await writeReport(state.runDir, state.report, state.key);
  }
}

export const costOf = (usage) => ({
  pricePerMillionTokens: gemini.price,
  priceSource: gemini.priceSource,
  usd:
    (usage.promptTokens * gemini.price.input +
      usage.completionTokens * gemini.price.output) /
    1e6,
});

const scrubString = (value, key) => safeValue(String(value ?? ''), key);

function updatePaid(report, snapshot) {
  const usage = snapshot.usage ?? {};
  const known = costOf({
    promptTokens: usage.promptTokenCount ?? 0,
    completionTokens:
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  });
  report.paid = {
    ...report.paid,
    ...snapshot,
    knownCostUsd: known.usd,
    cost: snapshot.totalCostUsd == null ? null : known,
  };
}

async function inspectPreservation(preflightResult) {
  const current = await readManifestInputs(preflightResult.sourceCacheDir);
  let saved;
  try {
    saved = JSON.parse(
      await readFile(join(preflightResult.runDir, 'preflight.json'), 'utf8')
    );
  } catch {
    saved = null;
  }
  const savedMatches =
    Boolean(saved?.manifest) &&
    saved.manifestSha256 === preflightResult.savedManifestSha256 &&
    stable(saved.manifest) === stable(preflightResult.manifest);
  const same =
    !current.issues.length &&
    savedMatches &&
    stable(current.manifest) === stable(preflightResult.manifest) &&
    hash(stable(current.manifest)) === preflightResult.savedManifestSha256;
  return {
    success: same,
    issues: same
      ? []
      : current.issues.length
        ? current.issues
        : ['preflight manifest changed'],
    manifestSha256: current.manifest ? hash(stable(current.manifest)) : null,
  };
}

async function executePaidMode(state) {
  const {
    mode,
    key,
    budgetUsd,
    requestCap,
    preflightResult,
    report,
    signal,
    runDir,
  } = state;
  const remoteFetch = async (input, init) => {
    if (!state.paidStarted) {
      const preservation = await inspectPreservation(preflightResult);
      state.preservationChecks.push(preservation);
      if (!preservation.success) {
        state.preservationIssue = true;
        throw new Error('preflight inputs changed before first paid request');
      }
      if (signal.aborted || init.signal?.aborted)
        throw new Error('request aborted');
      await writeFile(join(runDir, 'paid.started'), 'started\n', {
        flag: 'wx',
      });
      state.paidStarted = true;
    }
    if (signal.aborted || init.signal?.aborted)
      throw new Error('request aborted');
    return fetch(input, init);
  };
  state.guard = createEvaluationFetch({
    key,
    images: preflightResult.images.byUrl,
    remoteFetch,
    requestCap,
    budgetUsd,
    context: () => state.context,
    signal,
  });
  const all = preflightResult.fixture.records;
  const holdout = all.filter((record) => record.split === 'holdout');
  const phases =
    mode.type === 'live'
      ? [
          [
            'calibration',
            all.filter((record) => record.split === 'calibration'),
          ],
          ['holdout-1', holdout],
          ['holdout-2', holdout],
        ]
      : mode.type === 'probe'
        ? [['probe', all.slice(0, mode.count)]]
        : [[mode.split, all.filter((record) => record.split === mode.split)]];
  for (const [phase, records] of phases) {
    await evaluatePhase(records, phase, state);
    await writeReport(runDir, report, key);
  }
}

function finishPaidReport(state, preservation) {
  const { report, mode, signal, guard } = state;
  const snapshot = guard.snapshot();
  updatePaid(report, snapshot);
  report.preservation = {
    ...preservation,
    success: preservation.success && !state.preservationIssue,
    checks: state.preservationChecks,
  };
  report.interrupted = state.interrupted;
  report.productionStopReason = state.productionStopReason ?? null;
  if (signal.aborted || snapshot.stopCategory === 'interrupted')
    report.status = 'incomplete-interrupted';
  else if (!report.preservation.success)
    report.status = 'incomplete-preservation';
  else if (snapshot.stopCategory === 'budget')
    report.status = 'incomplete-budget';
  else if (
    snapshot.stopReason ||
    state.productionStopReason ||
    state.runnerFailure ||
    snapshot.totalCostUsd == null ||
    snapshot.unsettledMicrodollars ||
    snapshot.unknownCallIds.length ||
    !report.phases.length ||
    report.phases.some((phase) => !phase.complete)
  )
    report.status = 'incomplete-provider';
  else if (mode.type === 'live') {
    const holdouts = report.phases.filter((phase) =>
      phase.label.startsWith('holdout-')
    );
    report.passed =
      report.phases.length === 3 &&
      report.phases.reduce((sum, phase) => sum + phase.evaluatedCount, 0) ===
        100 &&
      holdouts.length === 2 &&
      holdouts.every(
        (phase) =>
          phase.unsafeNegativeAdmissions === 0 &&
          phase.wrongCoreFields === 0 &&
          phase.fabricatedOptionalFields === 0 &&
          phase.eligibleRecall >= 0.8
      );
    report.status = report.passed ? 'qualified' : 'failed';
  } else
    report.status = report.phases[0].errors
      ? mode.type + '-failed'
      : mode.type + '-ok';
}

function parseArgs(args) {
  const usage =
    'Usage: node scripts/x-vision-eval.mjs [--live | --probe N | --split calibration|holdout] --run-dir PATH';
  let runDir;
  let mode;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--run-dir') {
      const value = args[++index];
      if (runDir !== undefined || !value || value.startsWith('--'))
        throw new Error(usage);
      runDir = value;
    } else if (mode) throw new Error(usage);
    else if (arg === '--live') mode = { type: 'live' };
    else if (arg === '--probe') {
      const value = args[++index];
      const count = Number(value);
      if (!/^[1-9][0-9]*$/.test(value ?? '') || !Number.isSafeInteger(count))
        throw new Error(usage);
      mode = { type: 'probe', count };
    } else if (arg === '--split') {
      const split = args[++index];
      if (!['calibration', 'holdout'].includes(split)) throw new Error(usage);
      mode = { type: 'split', split };
    } else throw new Error(usage);
  }
  if (!runDir?.trim()) throw new Error(usage);
  return { runDir, mode };
}
function paidOptions(mode) {
  if (!mode) return { requestCap: 0, budgetUsd: null };
  const raw = process.env.X_VISION_REQUEST_CAP ?? '300';
  if (!/^[0-9]+$/.test(raw))
    throw new Error('X_VISION_REQUEST_CAP must be an integer');
  const options = {
    requestCap: Number(raw),
    budgetUsd: process.env.X_VISION_BUDGET_USD,
  };
  try {
    createEvaluationFetch({ key: 'offline-validation', ...options });
  } catch (error) {
    throw new Error(
      error.message
        .replaceAll('requestCap', 'X_VISION_REQUEST_CAP')
        .replaceAll('budgetUsd', 'X_VISION_BUDGET_USD'),
      { cause: error }
    );
  }
  return options;
}

async function main() {
  const controller = new AbortController();
  const state = {
    signal: controller.signal,
    preservationChecks: [],
  };
  const interrupt = (name) => {
    state.interrupted = name;
    controller.abort(name);
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  try {
    const options = parseArgs(process.argv.slice(2));
    Object.assign(state, { mode: options.mode, ...paidOptions(options.mode) });
    state.preflightResult = await preflight({
      runDir: options.runDir,
      requireExisting: Boolean(options.mode),
    });
    state.runDir = state.preflightResult.runDir;
    const report = (state.report = baseReport(state.preflightResult, state));
    report.mode = state.mode ?? null;
    if (!state.mode || state.preflightResult.issues.length) return;
    state.key = process.env.GEMINI_API_KEY?.trim() ?? '';
    report.preflight.keyAvailable = Boolean(state.key);
    if (!state.key) {
      report.status = 'blocked-no-key';
      return;
    }
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    report.status = 'in-progress';
    await writeReport(state.runDir, report, state.key);
    await executePaidMode(state);
  } catch (error) {
    state.runnerFailure = scrubString(error.message, state.key);
    if (state.report) {
      state.report.failure = state.runnerFailure;
      state.report.status = state.signal.aborted
        ? 'incomplete-interrupted'
        : 'incomplete-provider';
    }
    console.error('X vision evaluation failed: ' + state.runnerFailure);
    process.exitCode = 1;
  } finally {
    try {
      if (state.guard) {
        let preservation;
        try {
          preservation = await inspectPreservation(state.preflightResult);
        } catch (error) {
          preservation = {
            success: false,
            issues: [scrubString(error.message, state.key)],
            manifestSha256: null,
          };
        }
        state.preservationChecks.push(preservation);
        finishPaidReport(state, preservation);
      }
      if (state.report) {
        if (state.runDir)
          await writeReport(state.runDir, state.report, state.key);
        console.log(
          JSON.stringify(safeValue(state.report, state.key), null, 2)
        );
        if (
          !['ready', 'qualified', 'probe-ok', 'split-ok'].includes(
            state.report.status
          )
        )
          process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        'X vision report persistence failed: ' +
          scrubString(error.message, state.key)
      );
      process.exitCode = 1;
    } finally {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    }
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  await main();
