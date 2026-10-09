import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVisionRun } from '../scripts/x-vision.mjs';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
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
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
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
  body.messages[0].content.startsWith('Extract') ? extractionJson : triageJson;
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

test('paid requests send the documented low-effort thinking controls', async (t) => {
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
  assert.equal((await run.evaluate(source('controls-1'))).status, 'accepted');
  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.equal(body.model, 'deepseek-flash');
    assert.equal(body.reasoning_effort, 'low');
    assert.deepEqual(body.thinking, { type: 'enabled' });
  }
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
