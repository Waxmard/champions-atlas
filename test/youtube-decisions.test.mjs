import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  readYoutubeDecisions,
  retriableReasons,
  writeYoutubeDecisions,
} from '../scripts/youtube-decisions.mjs';

const pasteUrl = 'https://pokepast.es/0123456789abcdef';
const candidate = (overrides = {}) => ({
  pasteUrl,
  video: {
    id: 'aaaaaaaaaaa',
    title: 'Pokémon Champions VGC Regulation M-C',
    description: `${pasteUrl}\nFormat: gen9championsvgc2026regmc`,
    publishedAt: '2026-03-14T12:30:45Z',
    ...overrides,
  },
});

const ledgerPath = (directory) => join(directory, 'youtube-decisions.json');
const readLedgerFile = async (directory) =>
  JSON.parse(await readFile(ledgerPath(directory), 'utf8'));
const freshDirectory = async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-youtube-decisions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test('records a rejection and replays it on the next read', async (t) => {
  const directory = await freshDirectory(t);
  const empty = await readYoutubeDecisions(directory);
  assert.equal(empty.reuse(candidate()), null);
  for (const reason of retriableReasons) empty.skip(candidate(), reason);
  assert.equal(empty.size, 0);
  empty.skip(candidate(), 'unsupported_format');
  await writeYoutubeDecisions(directory, empty);
  const reopened = await readYoutubeDecisions(directory);
  assert.equal(reopened.reuse(candidate()), 'unsupported_format');
  assert.deepEqual(Object.keys((await readLedgerFile(directory)).decisions), [
    `aaaaaaaaaaa|${pasteUrl}`,
  ]);
});

test('drops entries whose video content changed', async (t) => {
  const directory = await freshDirectory(t);
  const ledger = await readYoutubeDecisions(directory);
  ledger.skip(candidate(), 'unsupported_format');
  await writeYoutubeDecisions(directory, ledger);
  const reopened = await readYoutubeDecisions(directory);
  assert.equal(
    reopened.reuse(candidate({ title: 'Corrected video title' })),
    null
  );
  await writeYoutubeDecisions(directory, reopened);
  assert.deepEqual((await readLedgerFile(directory)).decisions, {});
});

test('writes back only decisions consulted during the run', async (t) => {
  const directory = await freshDirectory(t);
  const ledger = await readYoutubeDecisions(directory);
  ledger.skip(candidate(), 'format_conflict');
  ledger.skip(
    candidate({
      id: 'bbbbbbbbbbb',
      description: 'https://pokepast.es/fedcba9876543210\nFormat: gen9ou',
    }),
    'unsupported_format'
  );
  await writeYoutubeDecisions(directory, ledger);
  const reopened = await readYoutubeDecisions(directory);
  assert.equal(reopened.reuse(candidate()), 'format_conflict');
  await writeYoutubeDecisions(directory, reopened);
  assert.deepEqual(Object.keys((await readLedgerFile(directory)).decisions), [
    `aaaaaaaaaaa|${pasteUrl}`,
  ]);
});

test('ignores unusable ledgers and replaces them on write', async (t) => {
  const directory = await freshDirectory(t);
  const valid = await (async () => {
    const ledger = await readYoutubeDecisions(directory);
    ledger.skip(candidate(), 'unsupported_format');
    await writeYoutubeDecisions(directory, ledger);
    return readLedgerFile(directory);
  })();
  const unusable = [
    'not json',
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, rules: 'b'.repeat(64) }),
    JSON.stringify({
      ...valid,
      decisions: { 'not-a-key': { video: 'c'.repeat(64), reason: 'x' } },
    }),
    JSON.stringify({ ...valid, decisions: [] }),
  ];
  for (const text of unusable) {
    await writeFile(ledgerPath(directory), text);
    const ledger = await readYoutubeDecisions(directory);
    assert.equal(ledger.reuse(candidate()), null, text);
    assert.equal(ledger.size, 0, text);
    await writeYoutubeDecisions(directory, ledger);
    const repaired = await readLedgerFile(directory);
    assert.equal(repaired.version, 1, text);
    assert.deepEqual(repaired.decisions, {}, text);
  }
});
