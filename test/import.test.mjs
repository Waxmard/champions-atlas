import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  resolveSprite,
  syncSprites,
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
  assert.doesNotMatch(members[0].set, /IVs:/);
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

test('normalizes team sheets to champions formatting: EVs out of 32 and no IVs', () => {
  const paste = `Dragonite (M) @ Dragoninite  
Ability: Inner Focus  
Level: 50  
EVs: 12 HP / 252 SpA / 252 Spe  
Timid Nature  
- Dragon Pulse  
- Tailwind  
- Flamethrower  
- Protect  

Rillaboom (M) @ Miracle Seed  
Ability: Grassy Surge  
Level: 50  
EVs: 252 HP / 84 Atk / 4 Def / 108 SpD / 60 Spe  
Adamant Nature  
- Grassy Glide  
- Wood Hammer  
- Fake Out  
- High Horsepower  

Weavile (F) @ Focus Sash  
Ability: Pickpocket  
Level: 50  
Tera Type: Dark  
EVs: 44 HP / 252 Atk / 220 Spe  
Jolly Nature  
- Icicle Crash  
- Fake Out  
- Protect  
- Knock Off  

Gholdengo @ Grassy Seed  
Ability: Good as Gold  
Level: 50  
Tera Type: Water  
EVs: 236 HP / 124 Def / 92 SpA / 28 SpD / 28 Spe  
Bold Nature  
IVs: 31 Atk  
- Protect  
- Nasty Plot  
- Shadow Ball  
- Make It Rain  

Golisopod (F) @ Golisopite  
Ability: Emergency Exit  
Level: 50  
Tera Type: Water  
EVs: 236 HP / 252 Atk / 12 Def / 12 SpD  
Brave Nature  
- Iron Head  
- Leech Life  
- First Impression  
- Wide Guard  

Milotic (F) @ Leftovers  
Ability: Competitive  
Level: 50  
EVs: 252 HP / 212 Def / 36 SpA / 12 SpD  
Calm Nature  
IVs: 31 Atk  
- Muddy Water  
- Hypnosis  
- Coil  
- Protect`;

  const members = parsePaste(paste);
  assert.equal(members.length, 6);
  assert.equal(members[0].spread, '2 HP / 32 SpA / 32 Spe');
  assert.equal(members[1].spread, '32 HP / 11 Atk / 1 Def / 14 SpD / 8 Spe');
  assert.equal(members[2].spread, '6 HP / 32 Atk / 28 Spe');
  assert.equal(members[3].spread, '30 HP / 16 Def / 12 SpA / 4 SpD / 4 Spe');
  assert.equal(members[4].spread, '30 HP / 32 Atk / 2 Def / 2 SpD');
  assert.equal(members[5].spread, '32 HP / 27 Def / 5 SpA / 2 SpD');

  for (const member of members) {
    assert.doesNotMatch(member.set, /IVs:/);
    assert.doesNotMatch(member.set, /252/);
  }
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

test('sprite resolution keeps forms exact and covers catalog naming aliases', () => {
  const results = [
    ['lucario', 448],
    ['arcanine-hisui', 10229],
    ['indeedee-female', 10186],
    ['lucario-mega', 10059],
    ['lucario-mega-z', 10310],
    ['floette-mega', 10296],
  ].map(([name, id]) => ({
    name,
    url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
  }));
  const index = { results };
  const champions = (id) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ix/champions/${id}.png`;

  assert.equal(resolveSprite('Lucario', index), champions(448));
  assert.equal(resolveSprite('Arcanine-Hisui', index), champions(10229));
  assert.equal(resolveSprite('Indeedee-F', index), champions(10186));
  assert.equal(resolveSprite('Lucario-Mega', index), champions(10059));
  assert.equal(resolveSprite('Lucario-Mega-Z', index), champions(10310));
  assert.equal(resolveSprite('Floette-Mega', index), champions(10296));
  assert.equal(resolveSprite('Floette-Eternal-Mega', index), champions(10296));
  assert.equal(
    resolveSprite('Vivillon-Fancy', index),
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/666-fancy.png'
  );
  assert.equal(
    resolveSprite('Sinistcha-Masterpiece', index),
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1013-masterpiece.png'
  );
  assert.equal(resolveSprite('Unknownmon', index), null);
});

test('sprite failures warn without changing catalog output or using wrong art', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-sprites-'));
  const output = join(directory, 'catalog.json');
  const sprites = join(directory, 'sprites');
  const catalog = {
    teams: [
      {
        members: [
          { pokemon: 'Lucario' },
          { pokemon: 'Vivillon-Fancy' },
          { pokemon: 'Unknownmon' },
        ],
      },
    ],
  };
  const index = {
    results: [
      {
        name: 'lucario',
        url: 'https://pokeapi.co/api/v2/pokemon/448/',
      },
    ],
  };
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const warnings = [];
  try {
    await writeFile(output, JSON.stringify(catalog));
    await syncSprites(catalog.teams, index, {
      directory: sprites,
      load: async (address) => {
        if (address.endsWith('/448.png')) return png;
        throw new Error('offline');
      },
      warn: (message) => warnings.push(message),
    });
    assert.deepEqual(await readdir(sprites), ['lucario.png']);
    assert.match(warnings.join('\n'), /Sprite unavailable for Unknownmon/);
    assert.match(warnings.join('\n'), /vivillonfancy\.png: offline/);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), catalog);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
