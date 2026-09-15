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
  enrichPastes,
  writeCatalog,
} from '../scripts/import-catalog.mjs';
import { parseCustomPaste, parsePaste } from '../src/lib/paste.ts';

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
  assert.match(enriched.members[0].set, /^Pokemon0 @ Item0/);
  assert.throws(() =>
    enrich(
      { members, pasteUrl: '' },
      { paste: paste.replace('Item0', 'Different item') }
    )
  );
});

test('paste parser preserves complete sets and rejects unsafe input', () => {
  const blocks = Array.from(
    { length: 6 },
    (_, i) =>
      `Nickname${i} (Pokemon-${i}) @ Item ${i}\r\nAbility: Ability ${i}\r\nIVs: 0 Atk\r\nEVs: ${i + 1} HP\r\nJolly Nature\r\n- Move ${i}`
  );
  const members = parsePaste(blocks.join('\r\n\r\n'));
  assert.equal(members[0].pokemon, 'Pokemon-0');
  assert.match(members[0].set, /IVs: 0 Atk/);
  assert.throws(() => parsePaste(blocks.slice(0, 5).join('\n\n')), /six/);
  assert.throws(
    () => parsePaste([...blocks.slice(0, 5), blocks[0]].join('\n\n')),
    /duplicate/
  );
  assert.throws(() => parsePaste('x'.repeat(50001)), /Invalid/);
  assert.throws(
    () =>
      parsePaste(blocks.join('\n\n').replace('- Move 0', '- Move 0\n- move-0')),
    /Pokemon-0 has duplicate moves/
  );
  assert.throws(
    () =>
      parsePaste(
        blocks
          .join('\n\n')
          .replace('- Move 0', '- One\n- Two\n- Three\n- Four\n- Five')
      ),
    /Pokemon-0 has more than four moves/
  );
});

test('custom paste requires every editable field without tightening catalog parsing', () => {
  const blocks = Array.from(
    { length: 6 },
    (_, i) =>
      `Pokemon${i} @ Item${i}\nAbility: Ability${i}\nEVs: 4 HP / 252 Atk / 252 Spe\nJolly Nature\n- Move ${i}A\n- Move ${i}B\n- Move ${i}C\n- Move ${i}D`
  );
  const paste = blocks.join('\n\n');
  assert.equal(parseCustomPaste(paste).length, 6);
  assert.equal(parsePaste(paste.replace('Ability: Ability0\n', '')).length, 6);
  for (const [removed, error] of [
    [' @ Item0', /missing an item/],
    ['Ability: Ability0\n', /missing an ability/],
    ['EVs: 4 HP / 252 Atk / 252 Spe\n', /missing EVs/],
    ['Jolly Nature\n', /missing a nature/],
    ['- Move 0D', /exactly four moves/],
  ])
    assert.throws(() => parseCustomPaste(paste.replace(removed, '')), error);
  assert.throws(
    () => parseCustomPaste(paste.replace('- Move 0D', '- Move 0A')),
    /duplicate moves/
  );
  assert.throws(
    () => parseCustomPaste(paste.replace('Pokemon1 @', 'Pokemon0 @')),
    /duplicate Pokémon/
  );
});

test('paste failures stay isolated and retain previous enrichment', async () => {
  const stubs = (id) => ({
    id,
    pasteUrl: `https://pokepast.es/${id}`,
    members: Array.from({ length: 6 }, (_, i) => ({
      pokemon: `Pokemon${i}`,
      item: `Item${i}`,
      ability: null,
      moves: [],
      nature: null,
      spread: null,
    })),
    paste: null,
    pasteNotes: null,
  });
  const paste = Array.from(
    { length: 6 },
    (_, i) =>
      `Pokemon${i} @ Item${i}\nAbility: Ability\nEVs: 32 HP\nAdamant Nature\n- Protect`
  ).join('\n\n');
  const previous = enrich(stubs('old'), { paste, notes: 'published' });
  const teams = [stubs('old'), stubs('new'), stubs('good')];
  const stats = await enrichPastes(teams, {
    previousTeams: [previous],
    concurrency: 2,
    loadPaste: async ({ id }) => {
      if (id === 'good') return { paste };
      throw new Error('temporary outage');
    },
  });
  assert.deepEqual(stats, { attempted: 3, enriched: 1, failed: 2 });
  assert.equal(teams[0].paste, paste);
  assert.equal(teams[0].members[0].ability, 'Ability');
  assert.equal(teams[0].pasteError, 'temporary outage');
  assert.equal(teams[1].paste, null);
  assert.equal(teams[1].pasteError, 'temporary outage');
  assert.equal(teams[2].pasteError, undefined);
});

test('partial imports retain compatible prior sets without masking sheet changes', async () => {
  const team = (item = 'Item0') => ({
    id: 'team',
    pasteUrl: 'https://pokepast.es/team',
    members: Array.from({ length: 6 }, (_, i) => ({
      pokemon: `Pokemon${i}`,
      item: i ? `Item${i}` : item,
      ability: null,
      moves: [],
      nature: null,
      spread: null,
    })),
    paste: null,
    pasteNotes: null,
  });
  const paste = Array.from(
    { length: 6 },
    (_, i) =>
      `Pokemon${i} @ Item${i}\nAbility: Ability\nAdamant Nature\n- Protect`
  ).join('\n\n');
  const previous = enrich(team(), { paste });

  const compatible = team();
  const retained = await enrichPastes([compatible], {
    previousTeams: [previous],
    limit: 0,
    loadPaste: () => assert.fail('limit zero must not fetch'),
  });
  assert.deepEqual(retained, { attempted: 0, enriched: 0, failed: 0 });
  assert.equal(compatible.paste, paste);
  assert.equal(compatible.members[0].ability, 'Ability');

  const changed = team('New Item');
  await enrichPastes([changed], {
    previousTeams: [previous],
    limit: 0,
    loadPaste: () => assert.fail('limit zero must not fetch'),
  });
  assert.equal(changed.paste, null);
  assert.equal(changed.members[0].item, 'New Item');
  assert.equal(changed.members[0].ability, null);
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
