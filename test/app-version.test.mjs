import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimAutoReload,
  parseBuildId,
  readServedBuildId,
  shouldReload,
} from '../src/lib/app-version.ts';

test('parseBuildId reads a string buildId and treats anything else as unknown', () => {
  assert.equal(parseBuildId('{"buildId":"abc"}'), 'abc');
  assert.equal(parseBuildId('{"buildId":""}'), '');
  assert.equal(parseBuildId('{}'), null);
  assert.equal(parseBuildId('{"buildId":7}'), null);
  assert.equal(parseBuildId('not json'), null);
});

test('shouldReload only fires for two known, differing ids', () => {
  assert.equal(shouldReload('abc', 'def'), true);
  assert.equal(shouldReload('abc', 'abc'), false);
  assert.equal(shouldReload('abc', null), false);
  assert.equal(shouldReload('', 'def'), false);
  assert.equal(shouldReload(undefined, 'def'), false);
});

test('readServedBuildId fetches the stamp uncached and reports unknown on any failure', async () => {
  const respond =
    (body, ok = true) =>
    async () => ({ ok, text: async () => body });

  let requested;
  const record = async (url, init) => {
    requested = { url, init };
    return { ok: true, text: async () => '{"buildId":"abc"}' };
  };
  assert.equal(await readServedBuildId({ fetchImpl: record }), 'abc');
  assert.deepEqual(requested, {
    url: '/version.json',
    init: { cache: 'no-store' },
  });

  assert.equal(
    await readServedBuildId({
      url: '/stamp.json',
      fetchImpl: respond('{"buildId":"def"}'),
    }),
    'def'
  );
  assert.equal(await readServedBuildId({ fetchImpl: respond('{}') }), null);
  assert.equal(
    await readServedBuildId({ fetchImpl: respond('{"buildId":"def"}', false) }),
    null
  );
  assert.equal(
    await readServedBuildId({
      fetchImpl: async () => {
        throw new Error('offline');
      },
    }),
    null
  );
});

test('claimAutoReload allows one auto-reload per served build', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  };

  assert.equal(claimAutoReload('build-1', storage), true);
  assert.equal(claimAutoReload('build-1', storage), false);
  assert.equal(claimAutoReload('build-2', storage), true);
  assert.equal(
    claimAutoReload('build-2', {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {},
    }),
    false
  );
});
