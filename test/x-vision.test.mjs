import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  readXCandidates,
  selectXPaste,
  xPostRegulation,
} from '../scripts/x-source.mjs';
import { validateFixture } from '../scripts/x-vision-fixture.mjs';
import { fetchVisionImage } from '../scripts/x-vision-input.mjs';
import {
  agreeExtractions,
  automaticVisionQualified,
  createVisionRun,
  model,
  promptVersion,
  revalidateAccepted,
  schemaVersion,
  validateExtraction,
} from '../scripts/x-vision.mjs';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const imageUrl = (name = 'photo') =>
  `https://pbs.twimg.com/media/${name}?format=png&name=orig`;
const post = (
  id = 'post-1',
  media = [{ index: 0, original: imageUrl() }],
  extra = {}
) => ({
  id,
  url: `https://x.com/test/status/${id}`,
  text: 'Champions team summary',
  media,
  ...extra,
});
const names = [
  'Pikachu',
  'Charizard',
  'Gengar',
  'Dragonite',
  'Gholdengo',
  'Amoonguss',
];
const items = [
  'Light Ball',
  'Charizardite X',
  'Focus Sash',
  'Choice Band',
  'Leftovers',
  null,
];
const makeExtraction = (overrides = {}) => ({
  schemaVersion: 1,
  summaryIndex: 0,
  teamId: 'TEAM-9',
  members: names.map((pokemon, index) => ({
    pokemon,
    itemState: items[index] === null ? 'none' : 'held',
    item: items[index],
    moves4: ['Protect', 'Thunderbolt', 'Volt Switch', 'Fake Out'],
    ability: index === 0 ? 'Static' : null,
    nature: index === 0 ? 'Jolly' : null,
    allocation:
      index === 1
        ? {
            mediaIndex: 1,
            pokemon,
            teamId: 'TEAM-9',
            points: { HP: 32, Spe: 32 },
          }
        : null,
  })),
  ...overrides,
});
const triage = (overrides = {}) => ({
  schemaVersion: 1,
  decision: 'eligible',
  summaryIndex: 0,
  allocationIndexes: [1],
  teamId: 'TEAM-9',
  ...overrides,
});
const usageFixture = {
  prompt_tokens: 10,
  completion_tokens: 5,
  total_tokens: 15,
};
const jsonResponse = (content, usage = usageFixture, finishReason = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage,
    }),
    { headers: { 'content-type': 'application/json' } }
  );
async function cacheDir(t) {
  const path = await mkdtemp(join(tmpdir(), 'x-vision-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
function acceptedFetch({
  detail = JSON.stringify(makeExtraction()),
  triageValue = JSON.stringify(triage()),
  onModel,
} = {}) {
  const calls = { image: 0, model: 0, bodies: [] };
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith('https://pbs.twimg.com/')) {
      calls.image += 1;
      assert.equal(init.redirect, 'error');
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    }
    calls.model += 1;
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-flash');
    assert.equal(body.tools, undefined);
    assert.equal(JSON.stringify(body).includes('test-key'), false);
    calls.bodies.push(body);
    const content = body.messages[0].content.startsWith('Extract')
      ? typeof detail === 'function'
        ? detail(calls.model)
        : detail
      : triageValue;
    onModel?.(body, calls.model);
    return jsonResponse(content);
  };
  return { fetchImpl, calls };
}

test('gold fixture is present, valid, and split ten/ten calibration and twenty/twenty holdout', async () => {
  const path = fileURLToPath(
    new URL('./fixtures/x-vision.json', import.meta.url)
  );
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(
      `the gold fixture is required at test/fixtures/x-vision.json: ${error.message}`,
      { cause: error }
    );
  }
  const fixture = JSON.parse(raw);
  assert.deepEqual(validateFixture(fixture), []);
  const counts = {};
  for (const record of fixture.records) {
    const key = `${record.split}/${record.label}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  assert.deepEqual(counts, {
    'calibration/eligible': 10,
    'calibration/negative': 10,
    'holdout/eligible': 20,
    'holdout/negative': 20,
  });
});

test('exports the fixed, unqualified model boundary', () => {
  assert.equal(model, 'deepseek-flash');
  assert.equal(promptVersion, 'x-vision-4');
  assert.equal(schemaVersion, 1);
  assert.equal(automaticVisionQualified, false);
});

test('X post regulation uses half-open boundaries and leaves legacy transition days unknown', () => {
  const exact = [
    ['2026-04-08T01:59:59.999Z', 'Unknown'],
    ['2026-04-08T02:00:00.000Z', 'M-A'],
    ['2026-06-17T01:59:59.999Z', 'M-A'],
    ['2026-06-17T02:00:00.000Z', 'M-B'],
    ['2026-09-09T01:59:59.999Z', 'M-B'],
    ['2026-09-09T02:00:00.000Z', 'M-C'],
    ['2026-12-02T01:59:59.999Z', 'M-C'],
    ['2026-12-02T02:00:00.000Z', 'Unknown'],
  ];
  for (const [createdAtExact, expected] of exact)
    assert.equal(xPostRegulation({ createdAtExact }), expected);
  for (const createdAt of [
    '2026-04-08',
    '2026-06-17',
    '2026-09-09',
    '2026-12-02',
  ])
    assert.equal(xPostRegulation({ createdAt }), 'Unknown');
  for (const createdAt of ['2026-06-31', '2026-12-03'])
    assert.equal(xPostRegulation({ createdAt }), 'Unknown');
});

test('strict extraction resolves exact dictionaries and preserves unknown optional values', () => {
  const raw = makeExtraction();
  raw.members[0].moves4[1] = ' Thunder-bolt ';
  raw.members[0].ability = 'not an ability';
  raw.members[0].nature = 'not a nature';
  const result = validateExtraction(raw, 2);
  assert.equal(result.members[0].pokemon, 'Pikachu');
  assert.equal(result.members[0].moves4[1], 'Thunderbolt');
  assert.equal(result.members[0].ability, null);
  assert.equal(result.members[0].nature, null);
  assert.equal(result.members[5].itemState, 'none');
  assert.equal(result.members[5].item, null);
  assert.equal(result.members[1].allocation.points.HP, 32);
  assert.deepEqual(Object.keys(result.members[1].allocation.points), [
    'HP',
    'Spe',
  ]);
});

test('strict extraction rejects fuzzy names, malformed JSON, wrappers, and extra keys', () => {
  assert.throws(() => validateExtraction('```json\\n{}\\n```', 2));
  assert.throws(() =>
    validateExtraction({ ...makeExtraction(), hidden: true }, 2)
  );
  const unknownSpecies = makeExtraction();
  unknownSpecies.members[0].pokemon = 'Pikacgu';
  assert.throws(() => validateExtraction(unknownSpecies, 2));
  const unknownMove = makeExtraction();
  unknownMove.members[0].moves4[0] = 'Protect-ish';
  assert.throws(() => validateExtraction(unknownMove, 2));
  const itemMismatch = makeExtraction();
  itemMismatch.members[5].item = 'Leftovers';
  assert.throws(() => validateExtraction(itemMismatch, 2));
  const repeatedSpecies = makeExtraction();
  repeatedSpecies.members[5].pokemon = 'Pikachu';
  assert.throws(() => validateExtraction(repeatedSpecies, 2));
});

test('Mega item does not cause the form resolver to invent an ability', () => {
  const extraction = makeExtraction();
  extraction.members[1].ability = null;
  const result = validateExtraction(extraction, 2);
  assert.equal(result.members[1].pokemon, 'Charizard');
  assert.equal(result.members[1].ability, null);
});

test('allocations preserve partial points only with matching member and team identity', () => {
  const extraction = makeExtraction();
  extraction.members[1].allocation.teamId = null;
  assert.equal(validateExtraction(extraction, 2).members[1].allocation, null);
  extraction.members[1].allocation.teamId = 'OTHER';
  assert.equal(validateExtraction(extraction, 2).members[1].allocation, null);
  extraction.members[1].allocation.teamId = 'TEAM-9';
  extraction.members[1].allocation.pokemon = 'Gengar';
  assert.equal(validateExtraction(extraction, 2).members[1].allocation, null);
});

test('allocations outside selected media or on the summary are dropped', () => {
  for (const mediaIndex of [0, 2, 3]) {
    const extraction = makeExtraction();
    extraction.members[1].allocation.mediaIndex = mediaIndex;
    assert.equal(validateExtraction(extraction, 2).members[1].allocation, null);
  }
});

test('allocation limits reject out-of-range, over-budget, and Scarlet/Violet EV-like values', () => {
  for (const points of [
    { HP: 33 },
    { HP: 32, Atk: 32, Def: 3 },
    { HP: 252 },
    {},
  ]) {
    const extraction = makeExtraction();
    extraction.members[1].allocation.points = points;
    assert.throws(() => validateExtraction(extraction, 2));
  }
});

test('independent agreement ignores member and move order, drops uncertain optional fields', () => {
  const left = validateExtraction(makeExtraction(), 2);
  const rawRight = makeExtraction();
  rawRight.members.reverse();
  for (const member of rawRight.members) member.moves4.reverse();
  rawRight.members.find((member) => member.pokemon === 'Pikachu').ability =
    null;
  rawRight.members.find((member) => member.pokemon === 'Pikachu').nature =
    'Timid';
  rawRight.members.find((member) => member.pokemon === 'Charizard').allocation =
    null;
  const right = validateExtraction(rawRight, 2);
  const agreed = agreeExtractions(left, right);
  const pikachu = agreed.members.find((member) => member.pokemon === 'Pikachu');
  const charizard = agreed.members.find(
    (member) => member.pokemon === 'Charizard'
  );
  assert.equal(pikachu.ability, null);
  assert.equal(pikachu.nature, null);
  assert.equal(charizard.allocation, null);
});

test('independent agreement rejects summary, roster, item, or move disagreement', () => {
  const left = validateExtraction(makeExtraction(), 2);
  const mismatch = makeExtraction();
  mismatch.summaryIndex = 1;
  assert.throws(() => agreeExtractions(left, validateExtraction(mismatch, 2)));
  const wrongItem = makeExtraction();
  wrongItem.members[0].item = 'Sitrus Berry';
  assert.throws(() => agreeExtractions(left, validateExtraction(wrongItem, 2)));
  const wrongMove = makeExtraction();
  wrongMove.members[0].moves4[0] = 'Tackle';
  assert.throws(() => agreeExtractions(left, validateExtraction(wrongMove, 2)));
  const wrongRoster = makeExtraction();
  wrongRoster.members[5].pokemon = 'Snorlax';
  assert.throws(() =>
    agreeExtractions(left, validateExtraction(wrongRoster, 2))
  );
});

test('original image fetch is host-locked, size-limited, signature-checked, and cached', async (t) => {
  const dir = await cacheDir(t);
  let calls = 0;
  let options;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    options = init;
    return new Response(png);
  };
  await assert.rejects(
    fetchVisionImage('https://evil.example/photo?name=orig', {
      fetchImpl,
      cacheDir: dir,
    })
  );
  await assert.rejects(
    fetchVisionImage('https://pbs.twimg.com/media/x?name=small', {
      fetchImpl,
      cacheDir: dir,
    })
  );
  assert.equal(calls, 0);
  const first = await fetchVisionImage(imageUrl(), {
    fetchImpl,
    cacheDir: dir,
  });
  const second = await fetchVisionImage(imageUrl(), {
    fetchImpl,
    cacheDir: dir,
  });
  assert.equal(first.mime, 'image/png');
  assert.equal(first.sha256, second.sha256);
  assert.equal(calls, 1);
  const fresh = await fetchVisionImage(imageUrl(), {
    fetchImpl: async () => {
      calls += 1;
      return new Response(new Uint8Array([...png, 2]));
    },
    cacheDir: dir,
    fresh: true,
  });
  assert.notEqual(fresh.sha256, first.sha256);
  assert.equal(calls, 2);
  assert.equal(options.redirect, 'error');
  const tooLarge = async () =>
    new Response(new Uint8Array([1]), {
      headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
    });
  await assert.rejects(
    fetchVisionImage(imageUrl('large'), { fetchImpl: tooLarge, cacheDir: dir }),
    /8 MiB|byte limit/
  );
  await assert.rejects(
    fetchVisionImage(imageUrl('bad'), {
      fetchImpl: async () => new Response('not image'),
      cacheDir: dir,
    }),
    /signature/
  );
});

test('accepted extraction uses three independent fixed-endpoint calls and reuses the validated cache', async (t) => {
  const dir = await cacheDir(t);
  const mock = acceptedFetch({
    detail: (call) => {
      const extraction = makeExtraction();
      if (call === 3) extraction.members[0].ability = null;
      return JSON.stringify(extraction);
    },
  });
  const run = createVisionRun({
    key: 'test-key',
    fetchImpl: mock.fetchImpl,
    cacheDir: dir,
    now: () => new Date('2026-10-08T00:00:00Z'),
  });
  const source = post('accepted-1', [
    { index: 0, original: imageUrl('summary') },
    { index: 1, original: imageUrl('allocation') },
  ]);
  const accepted = await run.evaluate(source);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.result.members.length, 6);
  assert.equal(accepted.media.length, 2);
  assert.equal(accepted.usage.requests, 3);
  assert.deepEqual(run.stats(), {
    posts: 1,
    accepted: 1,
    rejected: 0,
    errors: 0,
    withheld: 0,
    cached: 0,
    requests: 3,
    promptTokens: 30,
    completionTokens: 15,
    totalTokens: 45,
    stopReason: null,
  });
  assert.equal(revalidateAccepted(accepted, source).members.length, 6);
  assert.equal(
    revalidateAccepted(accepted, { ...source, text: 'changed' }),
    null
  );
  assert.equal(
    accepted.media[0].sha256,
    createHash('sha256').update(png).digest('hex')
  );
  assert.equal(
    revalidateAccepted(accepted, {
      ...source,
      media: source.media.map((image) => ({
        ...image,
        sha256: '0'.repeat(64),
      })),
    }),
    null
  );
  assert.equal(accepted.result.members[0].ability, null);
  assert.equal(JSON.stringify(mock.calls.bodies[2]).includes('Static'), false);
  assert.ok(
    mock.calls.bodies[0].messages.some(
      (message) =>
        message.role === 'system' &&
        message.content.includes('additionalProperties')
    )
  );
  assert.ok(
    mock.calls.bodies[1].messages.some(
      (message) =>
        message.role === 'system' &&
        message.content.includes('allocation') &&
        !message.content.includes('json-schema.org') &&
        message.content.includes('Showdown')
    )
  );
  const cachedRun = createVisionRun({
    fetchImpl: async () => {
      throw new Error('cache hit must not fetch');
    },
    cacheDir: dir,
  });
  const cached = await cachedRun.evaluate(source);
  assert.equal(cached.status, 'accepted');
  assert.equal(cachedRun.stats().cached, 1);
  const cachedImagePath = join(
    dir,
    'x-vision',
    'images',
    `${createHash('sha256').update(imageUrl('summary')).digest('hex')}.bin`
  );
  await writeFile(cachedImagePath, new Uint8Array([...png, 2]));
  assert.equal((await cachedRun.evaluate(source)).status, 'withheld');
  await rm(cachedImagePath);
  assert.equal((await cachedRun.evaluate(source)).status, 'withheld');
  const changedText = await cachedRun.evaluate({ ...source, text: 'changed' });
  assert.equal(changedText.status, 'withheld');
  const changedImage = await cachedRun.evaluate(
    post('accepted-1', [{ index: 0, original: imageUrl('different') }], {
      url: source.url,
      text: source.text,
    })
  );
  assert.equal(changedImage.status, 'withheld');
  assert.equal(cachedRun.stats().requests, 0);
});

test('rejected image outcomes cache without repeating paid calls', async (t) => {
  const dir = await cacheDir(t);
  const mock = acceptedFetch({
    triageValue: JSON.stringify({
      schemaVersion: 1,
      decision: 'ineligible',
      summaryIndex: null,
      allocationIndexes: [],
      teamId: null,
    }),
  });
  const run = createVisionRun({
    key: 'test-key',
    fetchImpl: mock.fetchImpl,
    cacheDir: dir,
  });
  const source = post('rejected-1');
  const first = await run.evaluate(source);
  assert.equal(first.status, 'rejected');
  assert.equal(mock.calls.model, 1);
  const cachedRun = createVisionRun({
    cacheDir: dir,
    fetchImpl: async () => {
      throw new Error('no fetch');
    },
  });
  const second = await cachedRun.evaluate(source);
  assert.equal(second.status, 'rejected');
  assert.equal(cachedRun.stats().cached, 1);
});

test('request and post limits withhold work without retrying or exceeding the cap', async (t) => {
  const dir = await cacheDir(t);
  const mock = acceptedFetch();
  const run = createVisionRun({
    key: 'test-key',
    fetchImpl: mock.fetchImpl,
    cacheDir: dir,
    callLimit: 2,
  });
  const result = await run.evaluate(
    post('limited', [
      { index: 0, original: imageUrl('limited-summary') },
      { index: 1, original: imageUrl('limited-allocation') },
    ])
  );
  assert.equal(result.status, 'withheld');
  assert.equal(result.reason, 'request limit reached');
  assert.equal(run.stats().requests, 2);
  assert.equal(mock.calls.model, 2);
  const noPosts = createVisionRun({
    key: 'test-key',
    fetchImpl: mock.fetchImpl,
    cacheDir: dir,
    postLimit: 0,
  });
  assert.equal(
    (await noPosts.evaluate(post('post-limited'))).status,
    'withheld'
  );
  assert.equal(noPosts.stats().requests, 0);
});

test('default post cap stops new work after twenty posts', async (t) => {
  const dir = await cacheDir(t);
  const run = createVisionRun({
    key: 'test-key',
    fetchImpl: async () => {
      throw new Error('no fetch');
    },
    cacheDir: dir,
  });
  for (let index = 0; index < 20; index += 1) {
    const result = await run.evaluate(post(`default-cap-${index}`, []));
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'no photos');
  }
  const extra = await run.evaluate(post('default-cap-20', []));
  assert.equal(extra.status, 'withheld');
  assert.equal(extra.reason, 'post limit reached');
  assert.equal(run.stats().posts, 20);
  assert.equal(run.stats().requests, 0);
});

test('missing credentials make no image or paid requests and never claim acceptance', async (t) => {
  const dir = await cacheDir(t);
  let calls = 0;
  const run = createVisionRun({
    cacheDir: dir,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('unexpected');
    },
  });
  const result = await run.evaluate(post('missing-key'));
  assert.equal(result.status, 'withheld');
  assert.equal(result.reason, 'DEEPSEEK_API_KEY is not configured');
  assert.equal(calls, 0);
  assert.equal(run.stats().requests, 0);
});

test('detailed provider failures are retryable and never cached as content rejection', async (t) => {
  for (const failedCall of [1, 2, 3]) {
    const dir = await cacheDir(t);
    const mock = acceptedFetch();
    let modelCalls = 0;
    let failed = false;
    const fetchImpl = async (url, init) => {
      if (String(url).startsWith('https://pbs.twimg.com/'))
        return mock.fetchImpl(url, init);
      modelCalls += 1;
      if (!failed && modelCalls === failedCall) {
        failed = true;
        return failedCall === 1
          ? jsonResponse('', undefined, 'length')
          : new Response('temporary provider failure', { status: 503 });
      }
      return mock.fetchImpl(url, init);
    };
    const run = createVisionRun({ key: 'test-key', fetchImpl, cacheDir: dir });
    const source = post(`provider-retry-${failedCall}`, [
      { index: 0, original: imageUrl(`summary-${failedCall}`) },
      { index: 1, original: imageUrl(`allocation-${failedCall}`) },
    ]);
    const first = await run.evaluate(source);
    assert.equal(first.status, 'error');
    if (failedCall === 1)
      assert.equal(first.reason, 'provider response truncated');
    assert.equal((await run.evaluate(source)).status, 'accepted');
    assert.equal(run.stats().errors, 1);
    assert.equal(run.stats().accepted, 1);
    assert.equal(run.stats().requests, failedCall + 3);
  }
});

test('authentication, credit, and throttling errors stop paid work for the run', async (t) => {
  const dir = await cacheDir(t);
  let modelCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).startsWith('https://pbs.twimg.com/'))
      return new Response(png);
    modelCalls += 1;
    return new Response('{"error":"rate limit"}', { status: 429 });
  };
  const run = createVisionRun({ key: 'test-key', fetchImpl, cacheDir: dir });
  const first = await run.evaluate(post('throttled-1'));
  const second = await run.evaluate(
    post('throttled-2', [{ index: 0, original: imageUrl('second') }])
  );
  assert.equal(first.status, 'error');
  assert.equal(second.status, 'withheld');
  assert.equal(modelCalls, 1);
  assert.equal(run.stats().requests, 1);
  assert.equal(
    run.stats().stopReason,
    'provider authentication, credit, or throttling error'
  );
});

test('malformed triage stops after one call and does not enter detailed extraction', async (t) => {
  const dir = await cacheDir(t);
  const mock = acceptedFetch({ triageValue: '```json\\n{}\\n```' });
  const run = createVisionRun({
    key: 'test-key',
    fetchImpl: mock.fetchImpl,
    cacheDir: dir,
  });
  const result = await run.evaluate(post('bad-triage'));
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'invalid triage response');
  assert.equal(mock.calls.model, 1);
});

const paste = (letter, extra = {}) => ({
  url: `https://pokepast.es/${letter.repeat(16)}`,
  kind: 'pokepaste',
  ...extra,
});
const declaredSets = 'A\n\nB\n\nC\n\nD\n\nE\n\nF';
const validPayload = {
  notes: 'Format: gen9championsvgc2026regmb',
  paste: declaredSets,
};
const onePhoto = [{ index: 0, original: imageUrl() }];
const sourcePost = (id, pastes, media = onePhoto) => ({
  id,
  url: `https://x.com/test/status/${id}`,
  text: 'team',
  media,
  pastes,
});
const decide = (post, payloads) =>
  selectXPaste(post, async (entry) => payloads[entry.url] ?? null);

test('paste selection prefers a usable paste and only trusts recorded validation', async () => {
  const supported = await decide(sourcePost('a', [paste('a')]), {
    [paste('a').url]: validPayload,
  });
  assert.equal(supported.selected.regulation, 'M-B');
  assert.equal(supported.allowImages, false);

  const unsupported = await decide(sourcePost('b', [paste('b'), paste('c')]), {
    [paste('b').url]: { notes: 'Format: gen9ou' },
  });
  assert.equal(unsupported.reason, 'unsupported_format');
  assert.equal(unsupported.allowImages, false);

  const recorded = await decide(
    sourcePost('c', [paste('d', { regulation: 'M-B', validated: true })]),
    {}
  );
  assert.equal(recorded.selected.regulation, 'M-B');
  assert.equal(recorded.allowImages, false);

  const regulationOnly = await decide(
    sourcePost('c', [paste('d', { regulation: 'M-B' })]),
    {}
  );
  assert.equal(regulationOnly.selected, null);
  assert.equal(regulationOnly.reason, 'paste_unavailable');
  assert.equal(regulationOnly.allowImages, true);

  const blocked = await decide(
    sourcePost('c', [paste('d', { unsupported: true })]),
    {}
  );
  assert.equal(blocked.reason, 'unsupported_format');
  assert.equal(blocked.allowImages, false);

  assert.equal((await decide(sourcePost('d', [], []), {})).allowImages, false);
});

const screenshotPost = (id) =>
  post(
    id,
    [0, 1].map((index) => ({ index, original: imageUrl(`two-${index}`) })),
    { handle: 'Trainer', createdAt: '2026-08-06' }
  );
async function cachedVision(t, raw, detail) {
  const dir = await cacheDir(t);
  const { fetchImpl } = acceptedFetch({ detail });
  const run = createVisionRun({ key: 'test-key', fetchImpl, cacheDir: dir });
  await run.evaluate(raw);
  const index = JSON.stringify({ posts: { [raw.id]: { ...raw, pastes: [] } } });
  await writeFile(join(dir, 'x-posts.json'), index);
  return dir;
}

test('a cached accepted record becomes a stable screenshot team without paste reads', async (t) => {
  const dir = await cachedVision(t, screenshotPost('post-9'));
  const loadPaste = async () => assert.fail('screenshot teams read pastes');
  const first = await readXCandidates(dir, { vision: true, loadPaste });
  assert.deepEqual(first.candidates, []);
  const [team] = first.vision;
  assert.deepEqual(
    [
      team.id,
      team.pasteUrl,
      team.setSource,
      team.regulation,
      team.regulationBasis,
      team.publishedAt,
    ],
    ['x-image-post-9', '', 'screenshot', 'M-B', 'post-date', '2026-08-06']
  );
  assert.equal(new Set(team.members.map((member) => member.pokemon)).size, 6);
  const member = (name) => team.members.find((entry) => entry.pokemon === name);
  assert.equal(member('Amoonguss').item, null);
  const charizard = member('Charizard-Mega-X');
  assert.deepEqual(
    [charizard.item, charizard.ability, charizard.spread],
    ['Charizardite X', null, null]
  );
  assert.equal(team.paste.includes('EVs:'), false);
  const again = await readXCandidates(dir, { vision: true });
  assert.deepEqual(again.vision, [team]);
});

test('screenshot conversion writes spread only for a complete allocation', async (t) => {
  const complete = makeExtraction();
  complete.members[1].allocation.points = {
    HP: 32,
    Atk: 32,
    Def: 1,
    SpA: 1,
    SpD: 0,
    Spe: 0,
  };
  const dir = await cachedVision(
    t,
    screenshotPost('post-7'),
    JSON.stringify(complete)
  );
  const { vision } = await readXCandidates(dir, { vision: true });
  const member = (name) => vision[0].members.find((e) => e.pokemon === name);
  assert.equal(
    member('Charizard-Mega-X').spread,
    '32 HP / 32 Atk / 1 Def / 1 SpA'
  );
  assert.equal(member('Pikachu').ability, 'Static');
  assert.equal(member('Pikachu').nature, 'Jolly');
});

test('cached vision records change the X source hash contribution', async (t) => {
  const dir = await cachedVision(t, screenshotPost('post-5'));
  const before = await readXCandidates(dir, { vision: true });
  assert.match(before.visionRaw[0], /"fingerprint":"[a-f0-9]{64}"/);
  const [name] = await readdir(join(dir, 'x-vision', 'records'));
  const path = join(dir, 'x-vision', 'records', name);
  const record = await readFile(path, 'utf8');
  await writeFile(
    path,
    record.replace('"status":"accepted"', '"status":"rejected"')
  );
  const after = await readXCandidates(dir, { vision: true });
  const hash = (parts) =>
    createHash('sha256').update(parts.join('')).digest('hex');
  assert.notEqual(hash(before.visionRaw), hash(after.visionRaw));
});
