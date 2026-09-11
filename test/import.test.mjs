import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  parseCsv,
  parseSheet,
  deduplicate,
  enrich,
  writeCatalog,
} from '../scripts/import-catalog.mjs';

test('bootstrap fails without sources, reuses an existing catalog, and keeps refresh explicit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-bootstrap-'));
  const script = fileURLToPath(
    new URL('../scripts/import-catalog.mjs', import.meta.url)
  );
  const run = (...args) =>
    execFileSync(process.execPath, [script, ...args], {
      cwd: directory,
      env: { ...process.env, OFFLINE: '1', REFRESH: '1' },
      stdio: 'pipe',
    });
  try {
    assert.throws(() => run('--if-missing'), /Missing cached sheet/);
    const path = join(directory, 'src/lib/data/catalog.json');
    await writeCatalog(path, { teams: [{ id: 'original' }] });
    const original = await readFile(path, 'utf8');
    run('--if-missing');
    assert.equal(await readFile(path, 'utf8'), original);
    assert.throws(() => run(), /Missing cached sheet/);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CSV handles quoted commas/newlines/escaped quotes and rejects truncation', () => {
  assert.deepEqual(parseCsv('a,"b,b","c""d"\r\n1,"two\nlines",3'), [
    ['a', 'b,b', 'c"d'],
    ['1', 'two\nlines', '3'],
  ]);
  assert.throws(() => parseCsv('a,"unfinished'));
  assert.throws(() => parseCsv('a,"done"junk'));
  assert.throws(() => parseSheet('broken,csv', 'M-C'));
});

test('deduplication keeps independent evidence and repeat imports stable', () => {
  const first = {
    id: 'one',
    sheetIds: ['MC1'],
    reports: [
      {
        event: 'Worlds',
        rank: 'Champion',
        sourceUrl: 'https://example.com/one',
      },
    ],
  };
  const second = {
    id: 'one',
    sheetIds: ['MC2'],
    reports: [
      {
        event: 'Ladder',
        rank: 'Peak 3rd',
        sourceUrl: 'https://example.com/two',
      },
    ],
  };
  const output = deduplicate(structuredClone([first, second, first]));
  assert.equal(output.length, 1);
  assert.equal(output[0].reports.length, 2);
  assert.deepEqual(output[0].sheetIds, ['MC1', 'MC2']);
  assert.deepEqual(deduplicate(structuredClone(output)), output);
});

test('paste enrichment matches species and item, never array position', () => {
  const members = Array.from({ length: 6 }, (_, i) => ({
    pokemon: `Pokemon${i}`,
    item: `Item${i}`,
  }));
  const paste = [...members]
    .reverse()
    .map(
      (m) =>
        `${m.pokemon} @ ${m.item}\nAbility: Ability\nEVs: 32 HP\nAdamant Nature\n- Protect`
    )
    .join('\n\n');
  const enriched = enrich(
    { members, pasteUrl: 'https://pokepast.es/example' },
    { paste }
  );
  assert.equal(enriched.members[0].pokemon, 'Pokemon0');
  assert.equal(enriched.members[0].spread, '32 HP');
  assert.deepEqual(enriched.members[0].moves, ['Protect']);
  assert.throws(() =>
    enrich(
      { members, pasteUrl: '' },
      { paste: paste.replace('Item0', 'Different item') }
    )
  );
});

test('invalid refresh preserves existing catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-import-'));
  try {
    const path = join(directory, 'catalog.json');
    await writeCatalog(path, { teams: [{ id: 'original' }] });
    await assert.rejects(writeCatalog(path, { teams: [] }));
    assert.equal(
      JSON.parse(await readFile(path, 'utf8')).teams[0].id,
      'original'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
