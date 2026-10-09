import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { speciesKey, stable, validateFixture } from './x-vision-fixture.mjs';
import { fetchVisionImage } from './x-vision-input.mjs';
import * as gemini from './x-vision-gemini.mjs';
import {
  createVisionRun,
  model,
  promptVersion,
  schemaVersion,
  validateExtraction,
} from './x-vision.mjs';

const fixturePath = resolve('test/fixtures/x-vision.json');
const reportPath = resolve('.cache/catalog/x-vision/qualification.json');
const cacheDir = resolve('.cache/catalog');
const requestCap = Number(process.env.X_VISION_REQUEST_CAP ?? 360);
if (!Number.isInteger(requestCap) || requestCap < 1)
  throw new Error('X_VISION_REQUEST_CAP must be a positive integer');
const ordered = (values) =>
  [...values].sort((a, b) => a.localeCompare(b, 'en'));
const hash = (value) => createHash('sha256').update(value).digest('hex');

function mediaManifest(fixture) {
  return fixture.records.flatMap((record) =>
    record.media.map(({ index, url, sha256 }) => ({
      postId: record.postId,
      index,
      url,
      sha256,
    }))
  );
}

async function verifyImages(fixture, { fresh = false } = {}) {
  const errors = [];
  const verified = [];
  for (const record of fixture.records) {
    for (const media of record.media) {
      try {
        const image = await fetchVisionImage(media.url, { cacheDir, fresh });
        if (image.sha256.toLowerCase() !== media.sha256.toLowerCase())
          throw new Error(
            `hash changed: expected ${media.sha256}, got ${image.sha256}`
          );
        if (image.url !== media.url)
          throw new Error(`image URL changed: ${image.url}`);
        verified.push({
          postId: record.postId,
          index: media.index,
          url: media.url,
          sha256: image.sha256,
        });
      } catch (error) {
        errors.push({
          postId: record.postId,
          index: media.index,
          url: media.url,
          error: error.message,
        });
      }
    }
  }
  return { errors, verified };
}

const cosmeticSuffix =
  /-(?:mega[xyz]?|[xyz]|[fm]|hero|eternal|masterpiece|antique|artisan)$/;
const comparisonKey = (pokemon) =>
  speciesKey(pokemon).replace(cosmeticSuffix, '');
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
    if (!outcome) {
      result.errors++;
      result.cases.push({ postId: record.postId, status: 'not-run' });
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
      result.cases.push({ postId: record.postId, status: outcome.status });
      continue;
    }
    if (outcome.status !== 'accepted') {
      result.cases.push({
        postId: record.postId,
        status: outcome.status,
        reason: outcome.reason ?? null,
      });
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
      result.cases.push({
        postId: record.postId,
        status: 'accepted',
        coreMismatches: mismatch.core,
        optionalMismatches: mismatch.optional,
        optionalOmissions: mismatch.omitted,
      });
    } catch (error) {
      result.wrongCoreFields++;
      result.cases.push({
        postId: record.postId,
        status: 'accepted',
        validationError: error.message,
      });
    }
  }
  result.eligibleRecall = eligible.length
    ? result.wholeTeamCorrect / eligible.length
    : 0;
  return result;
}

async function readFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

async function writeReport(report) {
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  const temp = `${reportPath}.tmp`;
  await writeFile(temp, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temp, reportPath);
}

async function preflight({ freshImages = false } = {}) {
  let fixture;
  try {
    fixture = await readFixture();
  } catch (error) {
    return {
      fixture: null,
      issues: [`fixture unavailable: ${error.message}`],
      images: { errors: [], verified: [] },
      fixtureSha256: null,
      mediaSha256: null,
    };
  }
  const issues = validateFixture(fixture);
  if (issues.length) {
    return {
      fixture,
      issues,
      images: { errors: [], verified: [] },
      fixtureSha256: hash(stable(fixture)),
      mediaSha256: hash(stable(mediaManifest(fixture))),
    };
  }
  const images = await verifyImages(fixture, { fresh: freshImages });
  return {
    fixture,
    issues: images.errors.map(
      (item) => `${item.postId}/${item.index}: ${item.error}`
    ),
    images,
    fixtureSha256: hash(stable(fixture)),
    mediaSha256: hash(stable(images.verified)),
  };
}

function baseReport(preflightResult) {
  const fixture = preflightResult.fixture;
  const counts = fixture
    ? Object.fromEntries(
        ['calibration', 'holdout'].map((split) => [
          split,
          Object.fromEntries(
            ['eligible', 'negative'].map((label) => [
              label,
              fixture.records.filter(
                (record) => record.split === split && record.label === label
              ).length,
            ])
          ),
        ])
      )
    : null;
  return {
    generatedAt: new Date().toISOString(),
    status: preflightResult.issues.length ? 'not-ready' : 'ready',
    passed: false,
    fixtureVersion: fixture?.fixtureVersion ?? null,
    datasetSha256: preflightResult.fixtureSha256,
    mediaManifestSha256: preflightResult.mediaSha256,
    counts,
    coverageGaps: fixture?.coverageGaps ?? [],
    extractor: { model, promptVersion, schemaVersion },
    preflight: {
      ready: preflightResult.issues.length === 0,
      issues: preflightResult.issues,
      mediaCount: preflightResult.images.verified.length,
      mediaErrors: preflightResult.images.errors,
    },
    paid: {
      requestCap,
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      refusals: 0,
    },
    phases: [],
  };
}

function addStats(total, current) {
  for (const key of [
    'posts',
    'accepted',
    'rejected',
    'errors',
    'withheld',
    'cached',
    'requests',
    'promptTokens',
    'completionTokens',
    'reasoningTokens',
    'totalTokens',
  ])
    total[key] += current[key] ?? 0;
  total.stopReason ??= current.stopReason;
}

async function evaluatePhase(createRun, records, phase, requestCount) {
  const outcomes = new Map();
  const stats = {
    posts: 0,
    accepted: 0,
    rejected: 0,
    errors: 0,
    withheld: 0,
    cached: 0,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    stopReason: null,
  };
  for (let offset = 0; offset < records.length; offset += 20) {
    const batch = records.slice(offset, offset + 20);
    const run = createRun(batch.length);
    for (const record of batch) {
      const post = {
        id: record.postId,
        url: record.postUrl,
        text: '',
        media: record.media.map(({ index, url }) => ({ index, original: url })),
      };
      try {
        outcomes.set(record.postId, await run.evaluate(post, { fresh: true }));
      } catch (error) {
        outcomes.set(record.postId, { status: 'error', reason: error.message });
      }
      if (run.stats().stopReason || requestCount() >= requestCap) break;
    }
    addStats(stats, run.stats());
    if (stats.stopReason || requestCount() >= requestCap) break;
  }
  const scored = scorePhase(phase, records, outcomes);
  scored.stats = stats;
  return scored;
}

const makeRun = (key, fetchImpl) => (postLimit) =>
  createVisionRun({ key, fetchImpl, cacheDir, postLimit, callLimit: 60 });

export const costOf = (usage) => ({
  pricePerMillionTokens: gemini.price,
  priceSource: gemini.priceSource,
  usd:
    (usage.promptTokens * gemini.price.input +
      usage.completionTokens * gemini.price.output) /
    1e6,
});

function paidBlock(counter) {
  const summed = (field) =>
    counter.calls.reduce((total, call) => total + call.usage[field], 0);
  return {
    requestCap,
    requests: counter.requests,
    promptTokens: summed('promptTokens'),
    completionTokens: summed('completionTokens'),
    reasoningTokens: summed('reasoningTokens'),
  };
}

function costBlock(paid, scored) {
  const cost = costOf(paid);
  return {
    ...cost,
    perRecord: scored.records ? cost.usd / scored.records : null,
    perAcceptedTeam: scored.wholeTeamCorrect
      ? cost.usd / scored.wholeTeamCorrect
      : null,
  };
}

const callFields = (call) => ({
  truncated: call.truncated,
  blank: call.blank,
  elapsedMs: call.elapsedMs,
  promptTokens: call.usage.promptTokens,
  completionTokens: call.usage.completionTokens,
  reasoningTokens: call.usage.reasoningTokens,
});

async function modelCall(response, elapsedMs) {
  const data = await response
    .clone()
    .json()
    .catch(() => null);
  return {
    truncated: gemini.truncated(data),
    blank: (gemini.text(data) ?? '').trim() === '',
    usage: gemini.usage(data),
    elapsedMs,
  };
}

function guardedFetch(counter) {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.href !== gemini.url) {
      if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com')
        throw new Error('blocked unexpected network destination ' + url.origin);
      return fetch(input, init);
    }
    if (counter.requests >= requestCap)
      throw new Error('paid request cap ' + requestCap + ' reached');
    counter.requests++;
    const started = Date.now();
    const response = await fetch(input, init);
    counter.calls.push(await modelCall(response, Date.now() - started));
    return response;
  };
}

async function live(preflightResult, report) {
  if (!preflightResult.fixture || preflightResult.issues.length) return report;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    report.status = 'blocked-no-key';
    report.preflight.keyAvailable = false;
    return report;
  }
  report.preflight.keyAvailable = true;
  const counter = { requests: 0, calls: [] };
  const createRun = makeRun(key, guardedFetch(counter));
  const all = preflightResult.fixture.records;
  for (const [phase, records] of [
    ['calibration', all.filter((record) => record.split === 'calibration')],
    ['holdout-1', all.filter((record) => record.split === 'holdout')],
    ['holdout-2', all.filter((record) => record.split === 'holdout')],
  ]) {
    const scored = await evaluatePhase(
      createRun,
      records,
      phase,
      () => counter.requests
    );
    report.phases.push(scored);
    report.paid = {
      requestCap,
      requests: counter.requests,
      promptTokens: report.phases.reduce(
        (sum, item) => sum + item.stats.promptTokens,
        0
      ),
      completionTokens: report.phases.reduce(
        (sum, item) => sum + item.stats.completionTokens,
        0
      ),
      reasoningTokens: report.phases.reduce(
        (sum, item) => sum + item.stats.reasoningTokens,
        0
      ),
      totalTokens: report.phases.reduce(
        (sum, item) => sum + item.stats.totalTokens,
        0
      ),
      refusals: report.phases.reduce((sum, item) => sum + item.refusals, 0),
    };
    report.paid.cost = costOf(report.paid);
    report.status = 'in-progress';
    await writeReport(report);
    if (scored.stats.stopReason || counter.requests >= requestCap) break;
  }
  const holdouts = report.phases.filter((phase) =>
    phase.label.startsWith('holdout-')
  );
  report.passed =
    report.phases.length === 3 &&
    holdouts.length === 2 &&
    holdouts.every(
      (phase) =>
        phase.unsafeNegativeAdmissions === 0 &&
        phase.wrongCoreFields === 0 &&
        phase.fabricatedOptionalFields === 0 &&
        phase.eligibleRecall >= 0.8
    ) &&
    report.paid.requests <= requestCap;
  report.status = report.passed ? 'qualified' : 'failed';
  await writeReport(report);
  return report;
}

function printReport(report) {
  console.log(
    JSON.stringify(
      {
        status: report.status,
        passed: report.passed,
        fixtureVersion: report.fixtureVersion,
        counts: report.counts,
        coverageGaps: report.coverageGaps,
        datasetSha256: report.datasetSha256,
        mediaManifestSha256: report.mediaManifestSha256,
        preflight: report.preflight,
        paid: report.paid,
        phases: report.phases.map(
          ({
            label,
            records,
            eligible,
            negatives,
            wholeTeamCorrect,
            eligibleRecall,
            unsafeNegativeAdmissions,
            wrongCoreFields,
            fabricatedOptionalFields,
            refusals,
            errors,
            errorReasons,
            stats,
          }) => ({
            label,
            records,
            eligible,
            negatives,
            wholeTeamCorrect,
            eligibleRecall,
            unsafeNegativeAdmissions,
            wrongCoreFields,
            fabricatedOptionalFields,
            refusals,
            errors,
            errorReasons,
            stats,
          })
        ),
        reportPath,
      },
      null,
      2
    )
  );
}

async function probe(preflightResult, count) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log(
      JSON.stringify({ status: 'blocked-no-key', probe: count }, null, 2)
    );
    process.exitCode = 1;
    return;
  }
  if (!preflightResult.fixture || preflightResult.issues.length) {
    console.log(
      JSON.stringify(
        { status: 'not-ready', probe: count, issues: preflightResult.issues },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }
  const records = preflightResult.fixture.records.slice(0, count);
  const counter = { requests: 0, calls: [] };
  const scored = await evaluatePhase(
    makeRun(key, guardedFetch(counter)),
    records,
    'probe',
    () => counter.requests
  );
  const paid = paidBlock(counter);
  console.log(
    JSON.stringify(
      {
        status: scored.errors ? 'probe-failed' : 'probe-ok',
        probe: count,
        preflight: ready(preflightResult),
        paid,
        cost: costBlock(paid, scored),
        calls: counter.calls.map(callFields),
        score: scored,
      },
      null,
      2
    )
  );
  if (scored.errors) process.exitCode = 1;
}

function ready(preflightResult) {
  return {
    ready: preflightResult.issues.length === 0,
    mediaCount: preflightResult.images.verified.length,
  };
}

async function split(preflightResult, value) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log(
      JSON.stringify({ status: 'blocked-no-key', split: value }, null, 2)
    );
    process.exitCode = 1;
    return;
  }
  if (!preflightResult.fixture || preflightResult.issues.length) {
    console.log(
      JSON.stringify(
        { status: 'not-ready', split: value, issues: preflightResult.issues },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }
  const records = preflightResult.fixture.records.filter(
    (record) => record.split === value
  );
  const counter = { requests: 0, calls: [] };
  const scored = await evaluatePhase(
    makeRun(key, guardedFetch(counter)),
    records,
    value,
    () => counter.requests
  );
  const paid = paidBlock(counter);
  console.log(
    JSON.stringify(
      {
        status: scored.errors ? 'split-failed' : 'split-ok',
        split: value,
        model,
        preflight: ready(preflightResult),
        paid,
        cost: costBlock(paid, scored),
        calls: counter.calls.map(callFields),
        score: scored,
      },
      null,
      2
    )
  );
  if (scored.errors) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const usage =
    'Usage: node scripts/x-vision-eval.mjs [--live] [--probe N] [--split calibration|holdout]';
  const probeAt = args.indexOf('--probe');
  const probeCount = probeAt === -1 ? null : Number(args[probeAt + 1]);
  const splitAt = args.indexOf('--split');
  const splitValue = splitAt === -1 ? null : args[splitAt + 1];
  const liveRequested = args.includes('--live');
  const consumed = new Set();
  for (const at of [probeAt, splitAt]) {
    if (at === -1) continue;
    consumed.add(at);
    consumed.add(at + 1);
  }
  const extras = args.filter((arg, index) => !consumed.has(index));
  const modes =
    (probeAt === -1 ? 0 : 1) +
    (splitAt === -1 ? 0 : 1) +
    (liveRequested ? 1 : 0);
  if (
    extras.some((arg) => arg !== '--live') ||
    (probeAt !== -1 && (!Number.isInteger(probeCount) || probeCount < 1)) ||
    (splitAt !== -1 && !['calibration', 'holdout'].includes(splitValue)) ||
    modes > 1
  )
    throw new Error(usage);
  const keyAvailable = Boolean(process.env.GEMINI_API_KEY?.trim());
  const preflightResult = await preflight({
    freshImages:
      keyAvailable && (liveRequested || probeAt !== -1 || splitAt !== -1),
  });
  if (probeAt !== -1) {
    await probe(preflightResult, probeCount);
    return;
  }
  if (splitAt !== -1) {
    await split(preflightResult, splitValue);
    return;
  }
  const report = baseReport(preflightResult);
  if (liveRequested) {
    report.preflight.keyAvailable = keyAvailable;
    if (!keyAvailable) {
      report.status = 'blocked-no-key';
      report.preflight.issues.push(
        'GEMINI_API_KEY is required for live qualification'
      );
    } else if (!preflightResult.issues.length) {
      await live(preflightResult, report);
    }
  }
  await writeReport(report);
  printReport(report);
  if (report.status !== 'ready' && report.status !== 'qualified')
    process.exitCode = 1;
  if (report.status === 'failed') process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(`X vision evaluation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
