import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createEvaluationFetch } from '../scripts/x-vision-budget.mjs';
import * as gemini from '../scripts/x-vision-gemini.mjs';
import { digest } from '../scripts/x-vision-input.mjs';
import { preflight } from '../scripts/x-vision-eval.mjs';

const key = 'x-vision-budget-test-secret';
const imageUrl = 'https://pbs.twimg.com/media/budget-test.png?name=orig';
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const countUrl = gemini.url.replace(':generateContent', ':countTokens');
const triageSchema = {
  type: 'object',
  properties: { decision: { type: 'string' } },
  required: ['decision'],
};
const extractionSchema = {
  type: 'object',
  properties: { members: { type: 'array', items: { type: 'object' } } },
  required: ['members'],
};
const usage2000 = {
  promptTokenCount: 2000,
  candidatesTokenCount: 10,
  thoughtsTokenCount: 0,
  totalTokenCount: 2010,
};

const response = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const countResponse = (totalTokens = 2000) =>
  response(totalTokens === null ? {} : { totalTokens });
const generationResponse = ({
  usage = usage2000,
  finishReason = 'STOP',
  text = '{"decision":"ineligible"}',
  status = 200,
  body,
} = {}) =>
  new Response(
    body ??
      JSON.stringify({
        candidates: [{ finishReason, content: { parts: [{ text }] } }],
        ...(usage === null || usage === undefined
          ? {}
          : { usageMetadata: usage }),
      }),
    { status, headers: { 'content-type': 'application/json' } }
  );
const payload = ({ maxTokens = 16384, stage = 'triage' } = {}) =>
  gemini.body({
    system: 'Inspect only the supplied photo.',
    schema: stage === 'triage' ? triageSchema : extractionSchema,
    postText: 'A small offline test post.',
    images: [{ index: 0, mime: 'image/png', bytes: png }],
    maxTokens,
  });
const imageMap = () =>
  new Map([[imageUrl, { bytes: png, mime: 'image/png', sha256: digest(png) }]]);
const settle = async (promise) => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

function harness({
  budgetUsd = '5',
  requestCap = 300,
  signal,
  context = () => ({ phase: 'calibration', postId: 'post-1' }),
  countTokens = 2000,
  usage = usage2000,
  remoteFetch: customFetch,
  onDispatch,
} = {}) {
  const calls = [];
  let snapshot;
  const remoteFetch = async (url, init) => {
    const call = { url, init, body: JSON.parse(init.body) };
    calls.push(call);
    onDispatch?.(call, snapshot?.());
    if (customFetch) return customFetch(url, init, call, snapshot?.());
    if (url === countUrl) return countResponse(countTokens);
    if (url === gemini.url) {
      const request = call.body.generateContentRequest ?? call.body;
      const schema = request.generationConfig.responseFormat.text.schema;
      return generationResponse({
        usage,
        text: schema.properties.members
          ? '{"members":[]}'
          : '{"decision":"ineligible"}',
      });
    }
    throw new Error(`unexpected remote URL: ${url}`);
  };
  const guard = createEvaluationFetch({
    key,
    images: imageMap(),
    remoteFetch,
    requestCap,
    budgetUsd,
    context,
    signal,
  });
  snapshot = guard.snapshot;
  const send = ({ maxTokens = 16384, stage = 'triage' } = {}) =>
    guard.fetchImpl(gemini.url, {
      method: 'POST',
      redirect: 'error',
      headers: gemini.headers(key),
      body: JSON.stringify(payload({ maxTokens, stage })),
    });
  return { ...guard, calls, send };
}

async function tempDir(t) {
  const path = await mkdtemp(join(tmpdir(), 'atlas-x-vision-budget-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

function offlineEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const name of [
    'GEMINI_API_KEY',
    'TYPESAFE_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
  ])
    delete env[name];
  for (const name of ['X_VISION_REQUEST_CAP', 'X_VISION_BUDGET_USD'])
    if (!Object.hasOwn(overrides, name)) delete env[name];
  return env;
}

const evaluatorPath = fileURLToPath(
  new URL('../scripts/x-vision-eval.mjs', import.meta.url)
);
const invokeCli = (args, env = {}) =>
  spawnSync(process.execPath, [evaluatorPath, ...args], {
    cwd: process.cwd(),
    env: offlineEnv(env),
    encoding: 'utf8',
  });

async function preflightResult(options) {
  try {
    return await preflight(options);
  } catch (error) {
    return { ready: false, error: error.message };
  }
}

async function sourceWithCachedImages(t) {
  const root = await tempDir(t);
  const fixtureImages = resolve('.cache/catalog/x-vision/images');
  await mkdir(join(root, 'x-vision'), { recursive: true });
  await symlink(fixtureImages, join(root, 'x-vision', 'images'));
  return { root, fixtureImages };
}

test('countTokens rejects over-cap, missing, malformed, and nonpositive counts globally', async (t) => {
  const cases = [
    ['over cap', 10001],
    ['zero', 0],
    ['missing', null],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ];
  for (const [label, countTokens] of cases) {
    await t.test(label, async () => {
      const run = harness({ countTokens });
      await settle(run.send());
      assert.equal(run.calls.length, 1);
      assert.equal(run.calls[0].url, countUrl);
      assert.equal(run.snapshot().countAttempts, 1);
      assert.equal(run.snapshot().generationAttempts, 0);
      assert.match(run.snapshot().stopReason, /countTokens|counted input/i);
      await settle(run.send({ stage: 'detail', maxTokens: 32768 }));
      assert.equal(run.calls.length, 1);
    });
  }
});

test('countTokens HTTP rejection and malformed JSON stop before generation', async (t) => {
  for (const [label, countResponseValue] of [
    ['HTTP rejection', new Response('{"error":"denied"}', { status: 503 })],
    ['malformed JSON', new Response('{', { status: 200 })],
  ]) {
    await t.test(label, async () => {
      const run = harness({
        remoteFetch: async (url) =>
          url === countUrl ? countResponseValue : generationResponse(),
      });
      await settle(run.send());
      assert.equal(run.calls.length, 1);
      assert.equal(run.snapshot().countAttempts, 1);
      assert.equal(run.snapshot().generationAttempts, 0);
      assert.match(run.snapshot().stopReason, /countTokens/i);
    });
  }
});

test('count attempt exhaustion is shared and consumes the last count allowance', async () => {
  const run = harness({ requestCap: 1 });
  await run.send();
  assert.equal(run.snapshot().countAttempts, 1);
  assert.equal(run.snapshot().generationAttempts, 1);
  await settle(run.send({ stage: 'detail', maxTokens: 32768 }));
  assert.equal(run.calls.length, 2);
  assert.equal(run.calls.filter((call) => call.url === countUrl).length, 1);
  assert.equal(run.snapshot().countAttempts, 1);
  assert.match(run.snapshot().stopReason, /countTokens attempts exhausted/i);
});

test('budget admission reserves doubled input and full output before dispatch, then reconciles usage', async () => {
  let atDispatch;
  const run = harness({
    onDispatch: (call, snapshot) => {
      if (call.url === gemini.url) atDispatch = snapshot;
    },
  });
  await run.send();
  assert.equal(atDispatch.countAttempts, 1);
  assert.equal(atDispatch.generationAttempts, 1);
  assert.equal(atDispatch.lifetimeInputReservationTokens, 4000);
  assert.equal(atDispatch.lifetimeOutputReservationTokens, 16384);
  assert.equal(atDispatch.lifetimeReservationMicrodollars, 64440);
  assert.deepEqual(atDispatch.diagnostics.at(-1).reservation, {
    inputTokens: 4000,
    outputTokens: 16384,
    microdollars: 64440,
  });
  assert.deepEqual(run.calls[0].body.generateContentRequest, {
    model: 'models/' + gemini.model,
    ...payload(),
  });
  assert.deepEqual(run.calls[1].body, payload());
  assert.equal(run.calls[0].init.method, 'POST');
  assert.equal(run.calls[1].init.method, 'POST');
  assert.equal(run.calls[0].init.redirect, 'error');
  assert.equal(run.calls[1].init.redirect, 'error');
  assert.equal(run.calls[0].init.headers['x-goog-api-key'], key);
  assert.equal(run.calls[1].init.headers['x-goog-api-key'], key);
  const after = run.snapshot();
  assert.equal(after.knownMicrodollars, 1538);
  assert.equal(after.knownCostUsd, 0.0015375);
  assert.equal(after.totalCostUsd, 0.0015375);
  assert.equal(after.unsettledMicrodollars, 0);
  assert.equal(after.lifetimeReservationMicrodollars, 64440);
});

test('usage-based admission admits 0.066 USD but refuses 0.065 USD', async (t) => {
  for (const [budgetUsd, expectedGenerations] of [
    ['0.066', 2],
    ['0.065', 1],
  ]) {
    await t.test(budgetUsd, async () => {
      let postId = 'post-1';
      const run = harness({
        budgetUsd,
        context: () => ({ phase: 'calibration', postId }),
      });
      await run.send();
      postId = 'post-2';
      await settle(run.send());
      assert.equal(run.snapshot().countAttempts, 2);
      assert.equal(run.snapshot().generationAttempts, expectedGenerations);
      assert.equal(
        run.calls.filter((call) => call.url === gemini.url).length,
        expectedGenerations
      );
      assert.equal(
        run.snapshot().lifetimeReservationMicrodollars,
        expectedGenerations === 2 ? 128880 : 64440
      );
      if (expectedGenerations === 2) {
        assert.equal(run.snapshot().budgetMicrodollars, 66000);
        assert.equal(run.snapshot().knownMicrodollars, 3076);
      } else {
        assert.equal(run.snapshot().budgetMicrodollars, 65000);
        assert.equal(run.snapshot().knownMicrodollars, 1538);
        assert.equal(run.snapshot().stopReason, 'budget ceiling exceeded');
      }
    });
  }
});

test('invalid budgets and request caps cannot dispatch any transport call', async (t) => {
  for (const budgetUsd of ['0', '-1', '1e0', '0.0000001', ' 5', 'Infinity']) {
    await t.test(`budget ${JSON.stringify(budgetUsd)}`, async () => {
      let remoteCalls = 0;
      let run;
      try {
        run = harness({
          budgetUsd,
          remoteFetch: async () => {
            remoteCalls += 1;
            return countResponse();
          },
        });
      } catch (error) {
        assert.match(error.message, /budget/i);
      }
      if (run) await settle(run.send());
      assert.equal(remoteCalls, 0);
    });
  }
  for (const requestCap of [0, -1, 1.5, 301, Number.MAX_SAFE_INTEGER + 1]) {
    await t.test(`request cap ${requestCap}`, async () => {
      let remoteCalls = 0;
      let run;
      try {
        run = harness({
          requestCap,
          remoteFetch: async () => {
            remoteCalls += 1;
            return countResponse();
          },
        });
      } catch (error) {
        assert.match(error.message, /requestCap|request cap/i);
      }
      if (run) await settle(run.send());
      assert.equal(remoteCalls, 0);
    });
  }
});

test('missing or inconsistent usage keeps the reservation unsettled and stops later phases', async (t) => {
  const cases = [
    ['missing', null],
    ['inconsistent total', { ...usage2000, totalTokenCount: 2011 }],
  ];
  for (const [label, usage] of cases) {
    await t.test(label, async () => {
      const run = harness({ usage });
      await settle(run.send());
      assert.equal(run.snapshot().countAttempts, 1);
      assert.equal(run.snapshot().generationAttempts, 1);
      assert.equal(run.snapshot().unsettledMicrodollars, 64440);
      assert.equal(run.snapshot().totalCostUsd, null);
      assert.equal(run.snapshot().unknownCallIds.length, 1);
      assert.match(run.snapshot().stopReason, /usage missing or inconsistent/i);
      await settle(run.send({ stage: 'detail', maxTokens: 32768 }));
      assert.equal(run.calls.length, 2);
    });
  }
});

test('failed and timed-out generation attempts retain their full reservation', async (t) => {
  await t.test('HTTP failure without trustworthy usage', async () => {
    const run = harness({
      remoteFetch: async (url) =>
        url === countUrl
          ? countResponse()
          : generationResponse({
              status: 503,
              body: '{"error":"unavailable"}',
            }),
    });
    await settle(run.send());
    assert.equal(run.snapshot().generationAttempts, 1);
    assert.equal(run.snapshot().unsettledMicrodollars, 64440);
    assert.equal(run.snapshot().totalCostUsd, null);
    assert.equal(run.snapshot().unknownCallIds.length, 1);
  });
  await t.test('transport timeout', async () => {
    const run = harness({
      remoteFetch: async (url) => {
        if (url === countUrl) return countResponse();
        throw new DOMException('simulated transport timeout', 'TimeoutError');
      },
    });
    await settle(run.send());
    assert.equal(run.snapshot().generationAttempts, 1);
    assert.equal(run.snapshot().unsettledMicrodollars, 64440);
    assert.equal(run.snapshot().totalCostUsd, null);
    assert.equal(run.snapshot().unknownCallIds.length, 1);
    assert.equal(run.snapshot().stopReason, 'generation request timed out');
  });
});

test('actual usage above either reservation ceiling stays unknown and records discrepancy tokens', async (t) => {
  for (const [label, usage] of [
    [
      'input',
      {
        promptTokenCount: 4001,
        candidatesTokenCount: 10,
        thoughtsTokenCount: 0,
        totalTokenCount: 4011,
      },
    ],
    [
      'output',
      {
        promptTokenCount: 2000,
        candidatesTokenCount: 16385,
        thoughtsTokenCount: 0,
        totalTokenCount: 18385,
      },
    ],
  ]) {
    await t.test(label, async () => {
      const run = harness({ usage });
      await settle(run.send());
      const snapshot = run.snapshot();
      assert.equal(snapshot.unsettledMicrodollars, 64440);
      assert.equal(snapshot.totalCostUsd, null);
      assert.equal(snapshot.unknownCallIds.length, 1);
      assert.equal(
        snapshot.diagnostics.at(-1).usage.promptTokenCount,
        usage.promptTokenCount
      );
      assert.equal(
        snapshot.diagnostics.at(-1).usage.candidatesTokenCount,
        usage.candidatesTokenCount
      );
      assert.equal(
        snapshot.diagnostics.at(-1).observedUsage.totalTokenCount,
        usage.totalTokenCount
      );
      assert.equal(
        snapshot.diagnostics.at(-1).reservationDiscrepancy.reservedInputTokens,
        4000
      );
      assert.equal(
        snapshot.diagnostics.at(-1).reservationDiscrepancy.promptTokenCount,
        usage.promptTokenCount
      );
      assert.equal(
        snapshot.diagnostics.at(-1).reservationDiscrepancy.outputTokenCount,
        usage.candidatesTokenCount
      );
      assert.equal(
        snapshot.diagnostics.at(-1).reservationDiscrepancy.outputCeilingTokens,
        16384
      );
      assert.match(snapshot.stopReason, /actual tokens exceeded reservation/i);
    });
  }
});

test('trustworthy usage on a failed HTTP response is reconciled before stopping', async () => {
  const run = harness({
    remoteFetch: async (url) =>
      url === countUrl
        ? countResponse()
        : generationResponse({
            status: 503,
            usage: usage2000,
            body: JSON.stringify({
              usageMetadata: usage2000,
              error: { message: 'provider unavailable' },
            }),
          }),
  });
  await settle(run.send());
  assert.equal(run.snapshot().generationAttempts, 1);
  assert.equal(run.snapshot().knownMicrodollars, 1538);
  assert.equal(run.snapshot().unsettledMicrodollars, 0);
  assert.equal(run.snapshot().totalCostUsd, 0.0015375);
  assert.equal(run.snapshot().stopCategory, 'provider');
});

test('abort during count, generation, or between requests dispatches no later call', async (t) => {
  await t.test('abort during count', async () => {
    const controller = new AbortController();
    const run = harness({
      signal: controller.signal,
      remoteFetch: async (url) => {
        if (url === countUrl) {
          controller.abort();
          return countResponse();
        }
        return generationResponse();
      },
    });
    await settle(run.send());
    assert.equal(run.calls.length, 1);
    assert.equal(run.snapshot().generationAttempts, 0);
    assert.equal(run.snapshot().stopCategory, 'interrupted');
  });
  await t.test('abort during generation', async () => {
    const controller = new AbortController();
    const run = harness({
      signal: controller.signal,
      remoteFetch: async (url, init) => {
        if (url === countUrl) return countResponse();
        return new Promise((_, reject) => {
          init.signal.addEventListener(
            'abort',
            () => reject(init.signal.reason),
            { once: true }
          );
          setImmediate(() => controller.abort());
        });
      },
    });
    await settle(run.send());
    assert.equal(run.snapshot().generationAttempts, 1);
    assert.equal(run.snapshot().unsettledMicrodollars, 64440);
    assert.equal(run.snapshot().stopCategory, 'interrupted');
    const calls = run.calls.length;
    await settle(run.send({ stage: 'detail', maxTokens: 32768 }));
    assert.equal(run.calls.length, calls);
  });
  await t.test('abort between requests', async () => {
    const controller = new AbortController();
    const run = harness({ signal: controller.signal });
    await run.send();
    const calls = run.calls.length;
    controller.abort();
    await settle(run.send({ stage: 'detail', maxTokens: 32768 }));
    assert.equal(run.calls.length, calls);
    assert.equal(run.snapshot().stopCategory, 'interrupted');
  });
});

test('lifetime output reservation admits the exact cap and refuses the next generation', async () => {
  const run = harness({
    budgetUsd: '100',
    requestCap: 300,
    countTokens: 1,
    usage: {
      promptTokenCount: 1,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 0,
      totalTokenCount: 1,
    },
  });
  for (let index = 0; index < 250; index += 1)
    await run.send({ maxTokens: 32768, stage: 'detail' });
  assert.equal(run.snapshot().countAttempts, 250);
  assert.equal(run.snapshot().generationAttempts, 250);
  assert.equal(run.snapshot().lifetimeOutputReservationTokens, 8192000);
  assert.equal(run.snapshot().lifetimeReservationMicrodollars, 30720500);
  await settle(run.send({ maxTokens: 32768, stage: 'detail' }));
  assert.equal(run.snapshot().countAttempts, 251);
  assert.equal(run.snapshot().generationAttempts, 250);
  assert.equal(run.snapshot().countedInputTokens, 251);
  assert.equal(run.snapshot().lifetimeOutputReservationTokens, 8192000);
  assert.equal(run.calls.filter((call) => call.url === gemini.url).length, 250);
  assert.equal(run.snapshot().stopReason, 'lifetime reservation cap exceeded');
});

test('lifetime counters and reservations stay shared through exact aggregate ceilings', async () => {
  let phaseIndex = 0;
  let postIndex = 0;
  const phases = ['calibration', 'holdout-1', 'holdout-2'];
  const run = harness({
    budgetUsd: '100',
    requestCap: 300,
    countTokens: 10000,
    usage: {
      promptTokenCount: 10000,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 0,
      totalTokenCount: 10000,
    },
    context: () => ({ phase: phases[phaseIndex], postId: 'post-' + postIndex }),
  });
  for (let index = 0; index < 300; index += 1) {
    phaseIndex = index < 100 ? 0 : index < 200 ? 1 : 2;
    postIndex = index;
    await run.send({
      maxTokens: index < 200 ? 32768 : 16384,
      stage: index < 200 ? 'detail' : 'triage',
    });
  }
  const atCeiling = run.snapshot();
  assert.equal(atCeiling.countAttempts, 300);
  assert.equal(atCeiling.generationAttempts, 300);
  assert.equal(atCeiling.countedInputTokens, 3000000);
  assert.equal(atCeiling.lifetimeInputReservationTokens, 6000000);
  assert.equal(atCeiling.lifetimeOutputReservationTokens, 8192000);
  assert.equal(atCeiling.lifetimeReservationMicrodollars, 35220000);
  assert.equal(
    atCeiling.lifetimeInputReservationTokens +
      atCeiling.lifetimeOutputReservationTokens,
    14192000
  );
  assert.equal(atCeiling.usage.promptTokenCount, 3000000);
  const generationDiagnostics = atCeiling.diagnostics.filter(
    ({ kind }) => kind === 'generation'
  );
  assert.equal(generationDiagnostics.length, 300);
  assert.equal(generationDiagnostics[0].phase, 'calibration');
  assert.equal(generationDiagnostics[100].phase, 'holdout-1');
  assert.equal(generationDiagnostics[200].phase, 'holdout-2');
  assert.equal(generationDiagnostics[200].postId, 'post-200');
  const callsAtCeiling = run.calls.length;
  assert.equal(callsAtCeiling, 600);
  phaseIndex = 0;
  await settle(run.send());
  assert.equal(run.calls.length, callsAtCeiling);
  assert.equal(run.snapshot().countAttempts, 300);
  assert.equal(run.snapshot().generationAttempts, 300);
  assert.match(run.snapshot().stopReason, /countTokens attempts exhausted/i);
});

test('guard rejects an overlapping generation path before another count request', async () => {
  let resolveStarted;
  let resolveResponse;
  const started = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  const pendingResponse = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const run = harness({
    remoteFetch: async (url) => {
      if (url === countUrl) return countResponse();
      resolveStarted();
      return pendingResponse;
    },
  });
  const first = run.send();
  await started;
  await settle(run.send());
  assert.equal(run.calls.filter((call) => call.url === countUrl).length, 1);
  assert.equal(run.calls.filter((call) => call.url === gemini.url).length, 1);
  assert.equal(run.snapshot().stopReason, 'overlapping generation path');
  resolveResponse(generationResponse());
  await first;
});

test('pinned image fetch is local and never reaches authenticated transport', async () => {
  const run = harness();
  const image = await run.fetchImpl(imageUrl, { headers: gemini.headers(key) });
  assert.equal(image.status, 200);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), png);
  assert.equal(run.calls.length, 0);
  await settle(run.fetchImpl('https://example.invalid/image'));
  assert.equal(run.calls.length, 0);
  assert.equal(run.snapshot().stopReason, 'unapproved destination');
});

test('provider credential echoes are scrubbed while safe status and body remain', async () => {
  const safeBody = JSON.stringify({
    error: { message: `safe provider denial for ${key}` },
  });
  const run = harness({
    remoteFetch: async (url) =>
      url === countUrl
        ? countResponse()
        : new Response(safeBody, {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
  });
  const result = await run.send();
  assert.equal(result.status, 403);
  const snapshot = run.snapshot();
  const saved = JSON.stringify(snapshot);
  assert.equal(saved.includes(key), false);
  assert.match(saved, /safe provider denial/);
  assert.equal(snapshot.diagnostics.at(-1).status, 403);
  assert.match(snapshot.diagnostics.at(-1).errorBody, /safe provider denial/);
});

test('malformed CLI invocations fail before creating a run directory', async (t) => {
  const root = await tempDir(t);
  const runDir = join(root, 'must-not-exist');
  const invalid = [
    [],
    ['--run-dir', '', '--live'],
    ['--run-dir', runDir, '--unknown'],
    ['--run-dir', runDir, '--run-dir', join(root, 'duplicate')],
    ['--run-dir', runDir, '--live', '--probe', '1'],
    ['--run-dir', runDir, '--probe'],
    ['--run-dir', runDir, '--probe', 'not-a-number'],
    ['--run-dir', runDir, '--probe', '9007199254740993'],
    ['--run-dir', runDir, '--split', 'invalid'],
  ];
  for (const args of invalid) {
    const result = invokeCli(args);
    assert.notEqual(
      result.status,
      0,
      `${args.join(' ')} unexpectedly succeeded`
    );
  }
  await assert.rejects(readdir(runDir));
  await assert.rejects(readdir(join(root, 'duplicate')));
});

test('CLI validates budget and request-cap environment before creating the run directory', async (t) => {
  const root = await tempDir(t);
  const runDir = join(root, 'invalid-config');
  for (const [env, expected] of [
    [{ X_VISION_BUDGET_USD: '1e0' }, 'X_VISION_BUDGET_USD'],
    [
      { X_VISION_BUDGET_USD: '5', X_VISION_REQUEST_CAP: '301' },
      'X_VISION_REQUEST_CAP',
    ],
  ]) {
    const result = invokeCli(['--run-dir', runDir, '--live'], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(expected));
    await assert.rejects(readdir(runDir));
  }
});

test('offline preflight fails closed on missing cached images without fetching', async (t) => {
  const root = await tempDir(t);
  const runDir = join(root, 'run');
  const sourceCacheDir = join(root, 'empty-cache');
  await mkdir(sourceCacheDir);
  const result = await preflightResult({ runDir, sourceCacheDir });
  assert.equal(result.ready, false);
  assert.match(JSON.stringify(result), /image|missing|not ready|cache/i);
  assert.equal((await readdir(runDir)).includes('paid.started'), false);
  const paid = invokeCli(['--probe', '1', '--run-dir', runDir], {
    X_VISION_BUDGET_USD: '5',
  });
  assert.notEqual(paid.status, 0);
  assert.ok(paid.stdout.includes('matching preflight.json is required'));
  await assert.rejects(readFile(join(runDir, 'paid.started')));
});

test('offline preflight is stable on reuse and refuses a paid.started run', async (t) => {
  const root = await tempDir(t);
  const runDir = join(root, 'run');
  const { root: sourceCacheDir, fixtureImages } =
    await sourceWithCachedImages(t);
  const before = (await readdir(fixtureImages)).sort();
  const first = await preflightResult({ runDir, sourceCacheDir });
  assert.equal(first.ready, true, JSON.stringify(first.issues ?? first));
  assert.equal(first.fixture.records.length, 60);
  assert.equal(first.images.byUrl.size, 95);
  const manifestPath = join(runDir, 'preflight.json');
  const saved = await readFile(manifestPath, 'utf8');
  const second = await preflightResult({ runDir, sourceCacheDir });
  assert.equal(second.ready, true);
  assert.equal(await readFile(manifestPath, 'utf8'), saved);
  const altered = JSON.parse(saved);
  altered.manifest.images[0].sha256 = '0'.repeat(64);
  const alteredContents = JSON.stringify(altered, null, 2) + '\n';
  await writeFile(manifestPath, alteredContents);
  const mismatch = await preflightResult({ runDir, sourceCacheDir });
  assert.equal(mismatch.ready, false);
  assert.equal(await readFile(manifestPath, 'utf8'), alteredContents);
  await writeFile(manifestPath, saved);
  const blocked = invokeCli(['--probe', '1', '--run-dir', runDir], {
    X_VISION_BUDGET_USD: '5',
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stdout, /"status": "blocked-no-key"/);
  await assert.rejects(readFile(join(runDir, 'paid.started')));
  await writeFile(join(runDir, 'paid.started'), 'started\n', { flag: 'wx' });
  const reused = await preflightResult({ runDir, sourceCacheDir });
  assert.equal(reused.ready, false);
  assert.equal(await readFile(manifestPath, 'utf8'), saved);
  assert.deepEqual((await readdir(fixtureImages)).sort(), before);
});

test('preflight rejects a symlink alias into a forbidden repository path', async (t) => {
  const root = await tempDir(t);
  const runDir = join(root, 'alias');
  await symlink(resolve('scripts'), runDir);
  const result = await preflightResult({
    runDir,
    sourceCacheDir: join(root, 'empty-cache'),
  });
  assert.equal(result.ready, false);
  assert.match(JSON.stringify(result), /overlap|forbidden|run directory|path/i);
  await assert.rejects(readFile(join(runDir, 'preflight.json')));
});
