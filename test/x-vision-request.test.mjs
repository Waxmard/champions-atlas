import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { costOf, scorePhase } from '../scripts/x-vision-eval.mjs';
import * as gemini from '../scripts/x-vision-gemini.mjs';
import { createVisionRun } from '../scripts/x-vision.mjs';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const pngBase64 = Buffer.from(png).toString('base64');
const summaryNames = [
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
const extractionJson = JSON.stringify({
  schemaVersion: 1,
  summaryIndex: 0,
  teamId: 'TEAM-9',
  members: summaryNames.map((pokemon, index) => ({
    pokemon,
    itemState: items[index] === null ? 'none' : 'held',
    item: items[index],
    moves4: ['Protect', 'Thunderbolt', 'Volt Switch', 'Fake Out'],
    ability: null,
    nature: null,
    allocation: null,
  })),
});
const triageJson = JSON.stringify({
  schemaVersion: 1,
  decision: 'eligible',
  summaryIndex: 0,
  allocationIndexes: [],
  teamId: 'TEAM-9',
});
const modelResponse = (content) =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: content }] }, finishReason: 'stop' },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 0,
        totalTokenCount: 15,
      },
    }),
    { headers: { 'content-type': 'application/json' } }
  );
const source = (id) => ({
  id,
  url: `https://x.com/test/status/${id}`,
  text: 'Champions team summary',
  media: [
    {
      index: 0,
      original: `https://pbs.twimg.com/media/${id}-summary?format=png&name=orig`,
    },
    {
      index: 1,
      original: `https://pbs.twimg.com/media/${id}-allocation?format=png&name=orig`,
    },
  ],
});
const contentFor = (body) =>
  body.systemInstruction.parts[0].text.startsWith('Extract')
    ? extractionJson
    : triageJson;
async function cacheDir(t) {
  const path = await mkdtemp(join(tmpdir(), 'x-vision-request-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
const recordsOf = async (dir) => {
  try {
    return await readdir(join(dir, 'x-vision', 'records'));
  } catch {
    return [];
  }
};

test('paid requests send the documented request contract', async (t) => {
  const dir = await cacheDir(t);
  const bodies = [];
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith('https://pbs.twimg.com/'))
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    const body = JSON.parse(init.body);
    bodies.push(body);
    return modelResponse(contentFor(body));
  };
  const run = createVisionRun({ key: 'test-key', fetchImpl, cacheDir: dir });
  assert.equal((await run.evaluate(source('contract-1'))).status, 'accepted');
  assert.equal(bodies.length, 3);
  assert.deepEqual(
    bodies.map((body) => body.generationConfig.maxOutputTokens),
    [16384, 32768, 32768]
  );
  bodies.forEach((body, call) => {
    assert.equal(body.model, undefined);
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.thinking, undefined);
    assert.equal(body.generationConfig.mediaResolution, undefined);
    assert.equal(body.contents.length, 1);
    assert.equal(body.contents[0].role, 'user');
    const parts = body.contents[0].parts;
    const images = parts.filter((part) => part.inlineData);
    assert.equal(images.length, call === 0 ? 2 : 1);
    assert.deepEqual(images[0].inlineData, {
      mimeType: 'image/png',
      data: pngBase64,
    });
    for (const image of images)
      assert.deepEqual(image.media_resolution, {
        level: 'MEDIA_RESOLUTION_ULTRA_HIGH',
      });
    assert.equal(
      parts.filter((part) => /^Source photo index \d+:$/.test(part.text ?? ''))
        .length,
      images.length
    );
    assert.ok(
      body.systemInstruction.parts[0].text.startsWith(
        call === 0 ? 'Inspect' : 'Extract'
      )
    );
  });
});

test('response mapping drops thoughts, detects truncation, and reads usage', () => {
  assert.equal(
    gemini.text({
      candidates: [
        {
          content: {
            parts: [
              { text: 'thinking', thought: true },
              { text: '{"ok":true}' },
            ],
          },
        },
      ],
    }),
    '{"ok":true}'
  );
  assert.equal(gemini.text({}), null);
  assert.equal(
    gemini.truncated({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    true
  );
  assert.equal(
    gemini.truncated({ candidates: [{ finishReason: 'STOP' }] }),
    false
  );
  assert.equal(gemini.truncated({}), false);
  assert.deepEqual(
    gemini.usage({
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 7,
        totalTokenCount: 22,
      },
    }),
    {
      promptTokens: 10,
      completionTokens: 12,
      totalTokens: 22,
      reasoningTokens: 7,
    }
  );
  assert.deepEqual(gemini.usage({}), {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
  });
});

test('blank provider content is retryable and never cached as a rejection', async (t) => {
  const dir = await cacheDir(t);
  let modelCalls = 0;
  let blanked = false;
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith('https://pbs.twimg.com/'))
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    modelCalls += 1;
    if (!blanked) {
      blanked = true;
      return modelResponse('');
    }
    return modelResponse(contentFor(JSON.parse(init.body)));
  };
  const run = createVisionRun({ key: 'test-key', fetchImpl, cacheDir: dir });
  const post = source('blank-1');
  const first = await run.evaluate(post);
  assert.equal(first.status, 'error');
  assert.equal(first.reason, 'provider returned empty content');
  assert.deepEqual(await recordsOf(dir), []);
  const second = await run.evaluate(post);
  assert.equal(second.status, 'accepted');
  assert.equal(second.reason, null);
  assert.equal(run.stats().errors, 1);
  assert.equal(run.stats().requests, modelCalls);
  assert.equal(modelCalls, 4);
});

test('cost accounting prices billed prompt and output tokens', () => {
  assert.equal(
    costOf({ promptTokens: 1_000_000, completionTokens: 1_000_000 }).usd,
    4.5
  );
  assert.equal(costOf({ promptTokens: 0, completionTokens: 0 }).usd, 0);
  assert.deepEqual(
    costOf({ promptTokens: 1, completionTokens: 1 }).pricePerMillionTokens,
    {
      input: 0.75,
      output: 3.75,
    }
  );
});

test('allocation comparison accepts an equivalent cosmetic form name', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/x-vision.json', import.meta.url), 'utf8')
  );
  const record = fixture.records.find(
    (entry) => entry.postId === '2101498563381330268'
  );
  const observed = { schemaVersion: 1, ...structuredClone(record.expected) };
  const member = observed.members.find(
    (entry) => entry.pokemon === 'Floette-Eternal'
  );
  member.pokemon = 'Floette';
  member.allocation.pokemon = 'Floette';
  const score = (result) =>
    scorePhase(
      'calibration',
      [record],
      new Map([[record.postId, { status: 'accepted', result }]])
    );
  const aliased = score(observed);
  assert.equal(aliased.wrongCoreFields, 0);
  assert.equal(aliased.fabricatedOptionalFields, 0);
  assert.equal(aliased.wholeTeamCorrect, 1);
  assert.equal(aliased.eligibleRecall, 1);
  const changed = structuredClone(observed);
  changed.members.find(
    (entry) => entry.pokemon === 'Floette'
  ).allocation.points.SpA = 31;
  const penalized = score(changed);
  assert.deepEqual(penalized.cases[0].optionalMismatches, [
    'Floette-Eternal.allocation',
  ]);
});
