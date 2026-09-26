import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  deduplicate,
  parseSheet,
  teamFromIndex,
} from '../scripts/import-catalog.mjs';
import {
  devonCorpUrl,
  parseVrPaste,
  victoryRoadUrl,
} from '../scripts/catalog-sources.mjs';
import { normalize } from '../src/lib/catalog.ts';

const importScript = fileURLToPath(
  new URL('../scripts/import-catalog.mjs', import.meta.url)
);
const sheetHeader =
  'Team ID|1|2|3|4|5|6|B|C|v1|v2|v3|Pokemon Text for Copypasta||||||Team Description|Full Name|Date Shared|Pokepaste|Replica Code\n(Click text for image)|Replica Status|Tournament / Event|Rank|Link to Source'.split(
    '|'
  );
const list = (value) => value.split('/');
const vrRoster = list(
  'Gengar Mega/Snorlax/Incineroar/Scrafty/Dragonite/Rillaboom'
);
const mcPokemon = list(
  'Gholdengo/Amoonguss/Iron Hands/Farigiraf/Pelipper/Basculegion'
);
const mcItems = list(
  'Choice Specs/Rocky Helmet/Assault Vest/Safety Goggles/Focus Sash/Mystic Water'
);
const mbPokemon = list(
  'Kingambit/Sinistcha/Rillaboom/Incineroar/Dragonite/Snorlax'
);
const mbItems = list(
  'Black Glasses/Sitrus Berry/Miracle Seed/Charcoal/Life Orb/Leftovers'
);
const devonPokemon = list(
  'Charizard/Garchomp/Amoonguss/Incineroar/Rillaboom/Gholdengo'
);
const devonItems = list(
  'Charizardite Y/Clear Amulet/Sitrus Berry/Safety Goggles/Miracle Seed/Choice Specs'
);

const csvField = (value) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function sheetRow(id, team) {
  const row = Array(sheetHeader.length).fill('');
  row[0] = id;
  team.items.forEach((item, index) => {
    row[3 + index] = item;
  });
  team.pokemon.forEach((name, index) => {
    row[12 + index] = name;
  });
  row[18] = team.name || id;
  row[19] = team.creator || 'Owner';
  row[20] = team.date || '12 Sep 2026';
  row[21] = team.paste;
  row[22] = team.code || '';
  row[23] = 'Open';
  row[24] = team.event || '';
  row[25] = team.rank || '';
  row[26] = team.source || '';
  return row;
}

const sheetCsv = (rows) =>
  [sheetHeader, ...rows].map((row) => row.map(csvField).join(',')).join('\n');

function setBlock(name, item, ability, nature, moves, spread) {
  return [
    item ? `${name} @ ${item}` : name,
    `Ability: ${ability}`,
    'Level: 50',
    spread ? `EVs: ${spread}` : '',
    `${nature} Nature`,
    ...moves.map((move) => `- ${move}`),
  ]
    .filter(Boolean)
    .join('\n');
}

const pasteText = (species, items) =>
  species
    .map((name, index) =>
      setBlock(
        name,
        items[index],
        'Ability',
        'Adamant',
        ['Protect', 'Fake Out'],
        '2 HP / 32 Atk'
      )
    )
    .join('\n\n');

const pokePasteJson = (blocks, notes) =>
  JSON.stringify({
    author: 'Fixture',
    notes,
    paste: blocks,
    title: 'Fixture team',
  });

const vrSetSpecs = [
  'Gengar|Genry|Gengarite|Cursed Body|Modest|hp=30,def=13,spd=16,spe=7|Perish Song,Shadow Ball,Sludge Bomb,Protect',
  'Snorlax|Snorlax|Leftovers|Thick Fat|Relaxed|hp=21,def=31,spd=14|Yawn,Encore,Fissure,Protect',
  'Incineroar|Incineroar|Sitrus Berry|Intimidate|Relaxed|hp=32,def=25,spd=9|Flare Blitz,Parting Shot,Fake Out,Protect',
  'Scrafty|Scrafty|Focus Sash|Intimidate|Impish|hp=32,def=4,spd=4,spe=26|Close Combat,Knock Off,Fake Out,Protect',
  'Dragonite|Dragonite|Life Orb|Inner Focus|Adamant|hp=29,atk=32,spe=5|Dragon Claw,Low Kick,Extreme Speed,Protect',
  'Rillaboom|Rillaboom|Eject Button|Grassy Surge|Sassy|hp=32,def=4,spd=30|Grassy Glide,U-turn,Fake Out,Protect',
];

const vrTeams = vrSetSpecs.map((spec) => {
  const [species, name, item, ability, nature, evs, moves] = spec.split('|');
  return {
    species,
    name,
    item,
    ability,
    nature,
    evs: Object.fromEntries(
      evs.split(',').map((pair) => {
        const [stat, value] = pair.split('=');
        return [stat, Number(value)];
      })
    ),
    moves: moves.split(','),
    ...(species === 'Gengar' ? { shiny: true } : {}),
  };
});

const vrProviderPayload = (overrides = {}) => ({
  id: 'AbC12345',
  is_public: true,
  is_encrypted: false,
  format: 'VGC Regulation M-C',
  createdAt: 1789118018,
  teams: vrTeams,
  ...overrides,
});

const rosterHtml = (names) =>
  names
    .map((name) => `<img title="${name}" alt="${name}" width="64px"/>`)
    .join('');

const vrRow = (player, roster, paste, rank = 'Champion') =>
  `<tr><td></td><td><b>${player}</b></td>` +
  `<td><b>Spring Cup<br>${rank}</b></td><td><div>${roster}</div></td>` +
  `<td>AB C 123</td><td><a href="${paste}"><img title="Export"/></a></td><td></td></tr>`;

const vrTable = (rows, start = 0) =>
  `<table><thead><tr><th>Flag</th><th>Player</th><th>Best results</th><th>Team</th>` +
  `<th>Code</th><th>Paste</th><th>Rep.</th></tr></thead><tbody>${rows.slice(start).join('')}` +
  `</tbody></table>`;

const victoryRoadPage = (rows) =>
  `<h1>Pokémon Champions — Replica Teams</h1>` +
  `<h2>Regulation Set (M-C)</h2><h3>Teams reaching finals of large tournaments</h3>` +
  vrTable(rows) +
  `<h2>Past formats</h2>` +
  vrTable([
    vrRow(
      'Legacy Player',
      rosterHtml(vrRoster),
      'https://pokepast.es/0123456789abcdef'
    ),
  ]);

const devonCorpPage = (extra = '') =>
  `<h1>38 Teams to Try for Pokémon Champions Regulation M-A</h1>` +
  `<a href="https://pokepast.es/ffffffffffffffff">unrelated</a>` +
  `<article><div class="blog-item-content e-content">` +
  `<h3>CYBERTRON TEAM</h3><div class="sqs-html-content">` +
  `<p>Teambuilder: <a href="https://x.com/CybertronVGC">https://x.com/CybertronVGC</a></p>` +
  `<p>Replica Code: NFVS4SYCW2</p>` +
  `<p>Pokepaste: <a href="https://pokepast.es/138b4ef886ba95e4">paste</a></p>` +
  `<p><a href="https://youtu.be/Du3AZ5dpIv4?t=67">Link to YouTube Explanation</a></p>` +
  `</div>${extra}</div></article>`;

const reasonChecker = (reason) => (error) => error.reason === reason;

async function writeCache(directory, files) {
  const cache = join(directory, '.cache/catalog');
  await mkdir(cache, { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(join(cache, name), content);
  return cache;
}

function runImport(directory, env = {}) {
  return execFileSync(process.execPath, [importScript], {
    cwd: directory,
    env: {
      ...process.env,
      OFFLINE: '1',
      CHECK_SHEET: '',
      REFRESH: '',
      PASTE_LIMIT: '',
      ...env,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const catalogPath = (directory) => join(directory, 'src/lib/data/catalog.json');

const readCatalog = async (directory) =>
  JSON.parse(await readFile(catalogPath(directory), 'utf8'));

const sheetSources = {
  'M-C.csv': sheetCsv([
    sheetRow('MC1', {
      pokemon: mcPokemon,
      items: mcItems,
      paste: 'https://pokepast.es/aaaaaaaaaaaaaaaa',
    }),
  ]),
  'M-B.csv': sheetCsv([
    sheetRow('MB1', {
      pokemon: mbPokemon,
      items: mbItems,
      paste: 'https://pokepast.es/bbbbbbbbbbbbbbbb',
    }),
  ]),
  'aaaaaaaaaaaaaaaa.json': pokePasteJson(
    pasteText(mcPokemon, mcItems),
    'Format: gen9vgcregulationmc'
  ),
  'bbbbbbbbbbbbbbbb.json': pokePasteJson(
    pasteText(mbPokemon, mbItems),
    'Format: gen9vgcregulationmb'
  ),
};

test('imports public index teams alongside the sheets and accounts for every row', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-'));
  try {
    await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': victoryRoadPage([
        vrRow('Alice', rosterHtml(vrRoster), 'https://vrpastes.com/AbC12345/'),
        vrRow(
          'Bob',
          rosterHtml(['Pikachu', ...vrRoster.slice(1)]),
          'https://vrpastes.com/AbC12345/'
        ),
        vrRow(
          'Carol',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/AbC12345'
        ),
        vrRow(
          'Dave',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZyX98765'
        ),
        vrRow(
          'Erin',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/QwE12345'
        ),
        vrRow(
          'Frank',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZzZ99999'
        ),
      ]),
      'devoncorp-m-a.html': devonCorpPage(
        `<h3>Missing paste team</h3><div class="sqs-html-content">` +
          `<p>Replica Code: ABC</p></div>`
      ),
      'vr-AbC12345.json': JSON.stringify(vrProviderPayload()),
      'vr-ZyX98765.json': JSON.stringify(
        vrProviderPayload({ id: 'ZyX98765', hasPassword: true })
      ),
      'vr-QwE12345.json': JSON.stringify(
        vrProviderPayload({ id: 'QwE12345', format: 'VGC Regulation M-B' })
      ),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
    });

    const output = runImport(directory);
    const catalog = await readCatalog(directory);

    assert.deepEqual(
      catalog.sources.map(({ name }) => name),
      ['VGCPastes', 'Victory Road', 'DevonCorp']
    );
    assert.equal(catalog.teams.length, 4);
    const alice = catalog.teams.find(({ creator }) => creator === 'Alice');
    assert.ok(alice, 'the accepted Victory Road row is missing');
    assert.equal(alice.name, 'Alice — Spring Cup');
    assert.equal(alice.regulation, 'M-C');
    assert.equal(alice.pasteUrl, 'https://www.vrpastes.com/AbC12345');
    assert.equal(alice.replicaCode, 'ABC123');
    assert.match(alice.publishedAt, /^2026-\d{2}-\d{2}$/);
    assert.deepEqual(alice.sheetIds, []);
    assert.equal(alice.members[0].pokemon, 'Gengar-Mega');
    assert.equal(alice.members[0].item, 'Gengarite');
    assert.equal(alice.members[0].ability, 'Cursed Body');
    assert.equal(alice.members[0].nature, 'Modest');
    assert.equal(alice.members[0].spread, '30 HP / 13 Def / 16 SpD / 7 Spe');
    assert.match(alice.members[0].set, /Genry \(Gengar\)/);
    assert.ok(
      alice.reports.some(
        ({ event, rank }) => event === 'Spring Cup' && rank === 'Champion'
      )
    );
    assert.ok(
      alice.reports.some(
        ({ event, sourceUrl }) =>
          event === 'Victory Road collection' && sourceUrl === victoryRoadUrl
      )
    );

    const cybertron = catalog.teams.find(
      ({ creator }) => creator === 'CybertronVGC'
    );
    assert.ok(cybertron, 'the DevonCorp team is missing');
    assert.equal(cybertron.regulation, 'M-A');
    assert.equal(cybertron.pasteUrl, 'https://pokepast.es/138b4ef886ba95e4');
    assert.equal(cybertron.publishedAt, '');
    assert.equal(cybertron.replicaCode, 'NFVS4SYCW2');
    assert.ok(
      cybertron.reports.some(
        ({ event, sourceUrl }) =>
          event === 'DevonCorp collection' && sourceUrl === devonCorpUrl
      )
    );
    assert.ok(
      cybertron.reports.some(
        ({ sourceUrl }) => sourceUrl === 'https://youtu.be/Du3AZ5dpIv4?t=67'
      )
    );
    assert.ok(
      cybertron.reports.every(({ rank }) => rank === ''),
      'DevonCorp prose must not become a result'
    );

    for (const rejected of [
      'Bob',
      'Carol',
      'Dave',
      'Erin',
      'Frank',
      'Legacy Player',
    ])
      assert.ok(
        !catalog.teams.some(({ creator }) => creator === rejected),
        `${rejected} should not reach the catalog`
      );

    assert.match(
      output,
      /Victory Road: 6 discovered — 1 accepted, 0 retained, 4 skipped, 1 merged\./
    );
    assert.match(
      output,
      /DevonCorp: 2 discovered — 1 accepted, 0 retained, 1 skipped, 0 merged\./
    );
    for (const reason of [
      'roster_mismatch=1',
      'protected_paste=1',
      'format_conflict=1',
      'paste_unavailable=1',
      'missing_paste=1',
    ])
      assert.match(output, new RegExp(reason), `${reason} was not reported`);
    assert.match(output, /Imported 4 teams/);

    const ids = catalog.teams.map(({ id }) => id).sort();
    const again = await readCatalog(directory);
    assert.deepEqual(again.teams.map(({ id }) => id).sort(), ids);
    const second = runImport(directory);
    const third = await readCatalog(directory);
    assert.deepEqual(third.teams.map(({ id }) => id).sort(), ids);
    assert.equal(third.sourceHash, again.sourceHash);
    assert.equal(runImport(directory), second);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('transient payload loss retains prior public metadata without adopting a changed creator', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-retain-'));
  try {
    const cache = await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': victoryRoadPage([
        vrRow(
          'Erin',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZzZ99999'
        ),
      ]),
      'devoncorp-m-a.html': devonCorpPage(),
      'vr-ZzZ99999.json': JSON.stringify(vrProviderPayload({ id: 'ZzZ99999' })),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
    });
    runImport(directory);
    const before = await readCatalog(directory);
    const original = before.teams.find(({ creator }) => creator === 'Erin');
    assert.ok(original, 'the first run should accept the row');

    await rm(join(cache, 'vr-ZzZ99999.json'));
    await writeFile(
      join(cache, 'victory-road.html'),
      victoryRoadPage([
        vrRow(
          'Impostor',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZzZ99999'
        ),
      ])
    );
    const output = runImport(directory);
    const after = await readCatalog(directory);
    const retained = after.teams.find(({ id }) => id === original.id);
    assert.ok(retained, 'the compatible prior team should be retained');
    assert.equal(retained.creator, 'Erin');
    assert.equal(retained.name, original.name);
    assert.equal(retained.pasteUrl, original.pasteUrl);
    assert.ok(retained.pasteError, 'a retained team must expose its error');
    assert.deepEqual(retained.members, original.members);
    assert.ok(
      !after.teams.some(({ creator }) => creator === 'Impostor'),
      'an unverified current creator must not be attached'
    );
    assert.match(
      output,
      /Victory Road: 1 discovered — 0 accepted, 1 retained, 0 skipped, 0 merged\./
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('format, protection, and roster conflicts never return from prior state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-conflict-'));
  try {
    const ids = ['AbC12345', 'DeF67890', 'GhI13579'];
    const page = (thirdRoster) =>
      victoryRoadPage([
        vrRow(
          'First',
          rosterHtml(vrRoster),
          `https://www.vrpastes.com/${ids[0]}`
        ),
        vrRow(
          'Second',
          rosterHtml(vrRoster),
          `https://www.vrpastes.com/${ids[1]}`
        ),
        vrRow('Third', thirdRoster, `https://www.vrpastes.com/${ids[2]}`),
      ]);
    const cache = await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': page(rosterHtml(vrRoster)),
      'devoncorp-m-a.html': devonCorpPage(),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
      ...Object.fromEntries(
        ids.map((id) => [
          `vr-${id}.json`,
          JSON.stringify(vrProviderPayload({ id })),
        ])
      ),
    });
    runImport(directory);
    assert.equal((await readCatalog(directory)).teams.length, 6);

    await writeFile(
      join(cache, `vr-${ids[0]}.json`),
      JSON.stringify(vrProviderPayload({ id: ids[0], hasPassword: true }))
    );
    await writeFile(
      join(cache, `vr-${ids[1]}.json`),
      JSON.stringify(
        vrProviderPayload({ id: ids[1], format: 'VGC Regulation M-B' })
      )
    );
    await writeFile(
      join(cache, 'victory-road.html'),
      page(rosterHtml(['Pikachu', ...vrRoster.slice(1)]))
    );
    const output = runImport(directory);
    const after = await readCatalog(directory);
    assert.deepEqual(
      after.teams.map(({ creator }) => creator).sort(),
      ['CybertronVGC', 'Owner', 'Owner'],
      'only the sheet teams and the unaffected collection may remain'
    );
    for (const reason of [
      'protected_paste=1',
      'format_conflict=1',
      'roster_mismatch=1',
    ])
      assert.match(output, new RegExp(reason));
    assert.match(
      output,
      /Victory Road: 3 discovered — 0 accepted, 0 retained, 3 skipped, 0 merged\./
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PASTE_LIMIT spends sheet attempts first and reports limited candidates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-limit-'));
  try {
    const ids = ['AbC12345', 'DeF67890', 'GhI13579', 'JkL24680'];
    const page = (rows) =>
      victoryRoadPage(
        rows.map((id, index) =>
          vrRow(
            `Player ${index}`,
            rosterHtml(vrRoster),
            `https://www.vrpastes.com/${id}`
          )
        )
      );
    await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': page(ids.slice(0, 3)),
      'devoncorp-m-a.html': devonCorpPage(),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
      ...Object.fromEntries(
        ids.map((id) => [
          `vr-${id}.json`,
          JSON.stringify(vrProviderPayload({ id })),
        ])
      ),
    });
    runImport(directory);
    const full = await readCatalog(directory);
    const accepted = ids
      .slice(0, 3)
      .map((id) => full.teams.find(({ pasteUrl }) => pasteUrl.endsWith(id)).id);

    const partial = runImport(directory, { PASTE_LIMIT: '3' });
    const partialCatalog = await readCatalog(directory);
    assert.deepEqual(
      partialCatalog.teams.map(({ id }) => id).sort(),
      full.teams.map(({ id }) => id).sort()
    );
    assert.match(
      partial,
      /Victory Road: 3 discovered — 1 accepted, 2 retained, 0 skipped, 0 merged\./
    );
    for (const id of accepted.slice(1))
      assert.equal(
        partialCatalog.teams.find((team) => team.id === id).pasteError ?? null,
        null,
        'limit-only reuse must keep prior metadata unchanged'
      );

    const zero = runImport(directory, { PASTE_LIMIT: '2' });
    assert.match(
      zero,
      /Victory Road: 3 discovered — 0 accepted, 3 retained, 0 skipped, 0 merged\./
    );

    await writeFile(
      join(directory, '.cache/catalog/victory-road.html'),
      page(ids)
    );
    const limited = runImport(directory, { PASTE_LIMIT: '2' });
    const limitedCatalog = await readCatalog(directory);
    assert.equal(limitedCatalog.teams.length, full.teams.length);
    assert.ok(
      !limitedCatalog.teams.some(({ pasteUrl }) => pasteUrl.endsWith(ids[3])),
      'a new candidate beyond the budget must be omitted, never emitted'
    );
    assert.match(limited, /limited=1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('public teams built from a real sheet record keep the sheet identity and merge reports', () => {
  const pasteUrl = 'https://pokepast.es/138b4ef886ba95e4';
  const blocks = pasteText(devonPokemon, devonItems);
  const csv = sheetCsv([
    sheetRow('MA1', {
      pokemon: ['Charizard-Mega-Y', ...devonPokemon.slice(1)],
      items: devonItems,
      paste: pasteUrl,
      source: 'https://events.example/ma',
    }),
  ]);
  const [sheetTeam] = parseSheet(csv, 'M-A');
  const identity = sheetTeam.members
    .map(({ pokemon, item }) => [pokemon, item])
    .sort();
  assert.equal(
    sheetTeam.id,
    `m-a-${createHash('sha256')
      .update(JSON.stringify(['M-A', pasteUrl, identity]))
      .digest('hex')
      .slice(0, 16)}`
  );

  const canonicalNames = new Map(
    sheetTeam.members.map(({ pokemon }) => [normalize(pokemon), pokemon])
  );
  const candidate = {
    sourceName: 'DevonCorp',
    indexUrl: devonCorpUrl,
    name: 'Fixture team',
    creator: 'Builder',
    regulation: 'M-A',
    pasteUrl,
    replicaCode: null,
    expectedSpecies: null,
    reports: [
      { event: 'DevonCorp collection', rank: '', sourceUrl: devonCorpUrl },
    ],
  };
  const payload = {
    paste: blocks,
    notes: 'Format: gen9championsvgc2026regma',
    publishedAt: '',
    provider: 'pokepaste',
  };
  const publicTeam = teamFromIndex(candidate, payload, canonicalNames);
  assert.equal(publicTeam.id, sheetTeam.id);
  assert.equal(publicTeam.paste, blocks);

  const merged = deduplicate([sheetTeam, publicTeam]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sheetIds, ['MA1']);
  assert.equal(merged[0].creator, 'Owner');
  assert.equal(merged[0].paste, null);
  assert.equal(merged[0].reports.length, 2);

  const other = teamFromIndex(
    { ...candidate, pasteUrl: 'https://pokepast.es/0123456789abcdef' },
    payload,
    canonicalNames
  );
  assert.notEqual(other.id, sheetTeam.id);
  const changed = teamFromIndex(
    candidate,
    { ...payload, paste: blocks.replace('Choice Specs', 'Choice Band') },
    canonicalNames
  );
  assert.notEqual(changed.id, sheetTeam.id);
  assert.equal(deduplicate([sheetTeam, publicTeam, other, changed]).length, 3);
});

test('index payloads are admitted only for the candidate Champions regulation', () => {
  const blocks = pasteText(devonPokemon, devonItems);
  const candidate = {
    sourceName: 'DevonCorp',
    indexUrl: devonCorpUrl,
    name: 'Fixture team',
    creator: 'Builder',
    regulation: 'M-A',
    pasteUrl: 'https://pokepast.es/138b4ef886ba95e4',
    replicaCode: null,
    expectedSpecies: null,
    reports: [
      { event: 'DevonCorp collection', rank: '', sourceUrl: devonCorpUrl },
    ],
  };
  const payload = {
    paste: blocks,
    notes: null,
    publishedAt: '',
    provider: 'pokepaste',
  };
  const names = new Map();
  const format = (notes) =>
    teamFromIndex(candidate, { ...payload, notes }, names);

  assert.ok(format(null), 'missing metadata stays unknown');
  assert.ok(format('Format: gen9championsvgc2026regma'));
  assert.ok(format('Format: gen9vgcregulationma'));
  for (const notes of [
    'Format: gen9ou',
    'Format: gen9championsou',
    'Format: gen9vgcregulationmb',
    'Format: gen9vgc2023series2',
  ])
    assert.throws(
      () => format(notes),
      reasonChecker('format_conflict'),
      `${notes} must not be admitted as M-A`
    );

  const vrCandidate = {
    ...candidate,
    sourceName: 'Victory Road',
    indexUrl: victoryRoadUrl,
    regulation: 'M-C',
    pasteUrl: 'https://www.vrpastes.com/AbC12345',
    expectedSpecies: vrRoster,
    reports: [
      { event: 'Victory Road collection', rank: '', sourceUrl: victoryRoadUrl },
    ],
  };
  const parsed = parseVrPaste(vrProviderPayload());
  const vrPayload = { ...parsed, provider: 'victory-road' };
  const team = teamFromIndex(vrCandidate, vrPayload, names);
  assert.equal(team.members[0].pokemon, 'Gengar-Mega');
  assert.equal(team.members[0].spread, '30 HP / 13 Def / 16 SpD / 7 Spe');
  assert.ok(
    teamFromIndex(vrCandidate, { ...vrPayload, format: null }, names),
    'unknown provider format stays unknown'
  );
  assert.throws(
    () =>
      teamFromIndex(
        vrCandidate,
        { ...vrPayload, format: 'VGC Regulation M-B' },
        names
      ),
    reasonChecker('format_conflict')
  );
  assert.throws(
    () =>
      teamFromIndex(
        { ...vrCandidate, expectedSpecies: ['Pikachu', ...vrRoster.slice(1)] },
        vrPayload,
        names
      ),
    reasonChecker('roster_mismatch')
  );
});
