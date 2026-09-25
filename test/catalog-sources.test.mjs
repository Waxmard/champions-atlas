import assert from 'node:assert/strict';
import test from 'node:test';
import {
  devonCorpUrl,
  parseDevonCorp,
  parseVictoryRoad,
  parseVrPaste,
  victoryRoadUrl,
} from '../scripts/catalog-sources.mjs';
import { parsePaste } from '../src/lib/paste.ts';

const roster = [
  'Gengar Mega',
  'Snorlax',
  'Incineroar',
  'Scrafty',
  'Dragonite',
  'Rillaboom',
];
const vrHeaders = [
  'Flag',
  'Player',
  'Best results',
  'Team',
  'Code',
  'Paste',
  'Rep.',
];

function rosterHtml(species) {
  return species
    .map((name, index) =>
      index === 2
        ? `<img alt="${name}">`
        : `<img title="${name}" alt="${name}">`
    )
    .join('');
}

function vrRow(data, headers = vrHeaders) {
  return `<tr>${headers.map((header) => `<td>${data[header] || ''}</td>`).join('')}</tr>`;
}

function vrTable(rows, headers = vrHeaders) {
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

const sourceRow = (overrides = {}) => ({
  Flag: '',
  Player: '<b>Alice</b><br>(<a href="https://x.com/AliceVGC">AliceVGC</a>)',
  'Best results':
    '<b><a href="https://events.example/spring">Spring Cup</a><br>Champion</b>',
  Team: rosterHtml(roster),
  Code: 'AB C 123',
  Paste: '<a href="https://vrpastes.com/AbC12345/"><img alt="Export"></a>',
  'Rep.': '<a href="https://replays.example/alice">Replay</a>',
  ...overrides,
});

const gengarPaste = {
  id: 'qZK7HCqj',
  is_public: false,
  is_encrypted: false,
  format: 'VGC Regulation M-C',
  createdAt: 1789118018,
  teams: [
    {
      species: 'Gengar',
      name: 'Genry',
      item: 'Gengarite',
      ability: 'Cursed Body',
      moves: ['Perish Song', 'Shadow Ball', 'Sludge Bomb', 'Protect'],
      nature: 'Modest',
      evs: { hp: 30, def: 13, spd: 16, spe: 7 },
      shiny: true,
    },
    {
      species: 'Snorlax',
      name: 'BIG MAN',
      item: 'Leftovers',
      ability: 'Thick Fat',
      moves: ['Yawn', 'Encore', 'Fissure', 'Protect'],
      nature: 'Relaxed',
      evs: { hp: 21, def: 31, spd: 14 },
    },
    {
      species: 'Incineroar',
      name: 'Incineroar',
      item: 'Sitrus Berry',
      ability: 'Intimidate',
      moves: ['Flare Blitz', 'Parting Shot', 'Fake Out', 'Protect'],
      nature: 'Relaxed',
      evs: { hp: 32, def: 25, spd: 9 },
    },
    {
      species: 'Scrafty',
      name: 'Bober',
      item: 'Focus Sash',
      ability: 'Intimidate',
      moves: ['Close Combat', 'Knock Off', 'Fake Out', 'Protect'],
      nature: 'Impish',
      evs: { hp: 32, def: 4, spd: 4, spe: 26 },
      shiny: true,
    },
    {
      species: 'Dragonite',
      name: 'Whisker',
      item: 'Life Orb',
      ability: 'Inner Focus',
      moves: ['Dragon Claw', 'Low Kick', 'Extreme Speed', 'Protect'],
      nature: 'Adamant',
      evs: { hp: 29, atk: 32, spe: 5 },
    },
    {
      species: 'Rillaboom',
      name: 'Bibizyana',
      item: 'Eject Button',
      ability: 'Grassy Surge',
      moves: ['Grassy Glide', 'U-turn', 'Fake Out', 'Protect'],
      nature: 'Sassy',
      evs: { hp: 32, def: 4, spd: 30 },
    },
  ],
};

function assertReason(action, reason) {
  assert.throws(action, (error) => error.reason === reason);
}

test('Victory Road reads only regulation tables and preserves explicit evidence', () => {
  const reordered = [
    'Paste',
    'Best results',
    'Player',
    'Flag',
    'Team',
    'Rep.',
    'Code',
  ];
  const validRows = [
    vrRow(sourceRow(), reordered),
    vrRow(
      sourceRow({
        Player: '<b>Bob</b>',
        'Best results': '<b>An early meta team</b><br>(September 12th)',
        Paste: '<a href="https://www.vrpastes.com/ZyX98765">paste</a>',
        'Rep.': '',
      }),
      reordered
    ),
    vrRow(
      sourceRow({
        Player: '<b>Ranked Player</b>',
        'Best results': '<b>Season M-C<br>3rd Place</b>',
        Paste: '<a href="https://www.vrpastes.com/RaNk1234">paste</a>',
        'Rep.': '',
      })
    ),
  ];
  const badRows = [
    vrRow(sourceRow({ Team: rosterHtml(roster.slice(0, 5)) }), reordered),
    vrRow(
      sourceRow({ Paste: '<a href="https://example.com/paste">paste</a>' }),
      reordered
    ),
    vrRow(sourceRow({ Paste: '' }), reordered),
  ];
  const legacy = vrTable([
    vrRow(
      sourceRow({
        Player: '<b>Legacy Player</b>',
        Paste: '<a href="https://pokepast.es/0123456789abcdef">legacy</a>',
      })
    ),
  ]);
  const html = `<h1>Pokémon Champions — Replica Teams</h1>
    <h2>Regulation Set (M-C)</h2><h3>Teams reaching finals of large tournaments</h3>
    ${vrTable([...validRows.slice(0, 2), ...badRows], reordered)}
    <h3>Ranked Battles teams</h3>${vrTable([validRows[2].replace(/^<tr>/, '<tr>')])}
    <h2>Past formats</h2>${legacy}`;
  const { candidates, skipped } = parseVictoryRoad(html);

  assert.equal(candidates.length, 3);
  assert.deepEqual(
    candidates.map(({ regulation }) => regulation),
    ['M-C', 'M-C', 'M-C']
  );
  assert.equal(candidates[0].name, 'Alice — Spring Cup');
  assert.equal(candidates[0].pasteUrl, 'https://www.vrpastes.com/AbC12345');
  assert.equal(candidates[0].replicaCode, 'ABC123');
  assert.deepEqual(candidates[0].expectedSpecies, roster);
  assert.deepEqual(
    candidates[0].reports.find(({ event }) => event === 'Spring Cup'),
    {
      event: 'Spring Cup',
      rank: 'Champion',
      sourceUrl: 'https://events.example/spring',
    }
  );
  assert.ok(
    candidates[0].reports.some(
      (entry) =>
        entry.event === 'Victory Road collection' &&
        entry.sourceUrl === victoryRoadUrl
    )
  );
  assert.ok(
    candidates[0].reports.some(
      (entry) =>
        entry.event === 'AliceVGC' &&
        entry.rank === '' &&
        entry.sourceUrl === 'https://x.com/AliceVGC'
    )
  );
  assert.ok(
    candidates[0].reports.some(
      (entry) => entry.event === 'Replay' && entry.rank === ''
    )
  );

  assert.equal(candidates[1].name, 'Bob — An early meta team');
  assert.equal(
    candidates[1].reports.find(({ event }) => event === 'An early meta team')
      .rank,
    ''
  );
  assert.deepEqual(
    candidates[2].reports.find(
      ({ event }) => event === 'Champions ranked battles — Season M-C'
    ),
    {
      event: 'Champions ranked battles — Season M-C',
      rank: '3rd',
      sourceUrl: victoryRoadUrl,
    }
  );
  assert.deepEqual(
    skipped.map(({ reason }) => reason),
    ['invalid_roster', 'unsupported_paste_url', 'missing_paste']
  );
  assert.ok(skipped.every(({ sourceUrl }) => sourceUrl === victoryRoadUrl));
  assert.ok(candidates.every(({ creator }) => creator !== 'Legacy Player'));
});

test('Victory Road fails wrong, unstructured, and empty sources', () => {
  assertReason(
    () => parseVictoryRoad('<h1>Unrelated replica list</h1>'),
    'wrong_page'
  );
  assertReason(
    () =>
      parseVictoryRoad(
        '<h1>Pokémon Champions — Replica Teams</h1><h2>Regulation Set M-C</h2>'
      ),
    'missing_structure'
  );
  const empty = `<h1>Pokémon Champions — Replica Teams</h1><h2>Regulation Set M-C</h2>${vrTable(
    [vrRow(sourceRow({ Paste: '' }))]
  )}`;
  assert.throws(
    () => parseVictoryRoad(empty),
    (error) =>
      error.reason === 'no_candidates' &&
      error.skipped[0].reason === 'missing_paste'
  );
});

test('DevonCorp associates M-A team blocks, builder links, codes, and sources', () => {
  const html = `<h1>38 Teams to Try for Pokémon Champions Regulation M-A</h1>
    <a href="https://pokepast.es/ffffffffffffffff">unrelated outside article</a>
    <article><div class="blog-item-content e-content">
      <div class="sqs-html-content"><p>Intro <a href="https://pokepast.es/eeeeeeeeeeeeeeee">ignore</a></p></div>
      <h3>AARON “CYBERTRON” ZHENG’S CHARIZARD Y TEAM</h3>
      <div class="sqs-html-content">
        <p>Teambuilder: <a href="https://x.com/CybertronVGC">https://x.com/CybertronVGC</a></p>
        <p>Replica Code: NFVS4SYCW2</p>
        <p>Pokepaste: <a href="https://pokepast.es/138b4ef886ba95e4">https://pokepast.es/138b4ef886ba95e4</a></p>
        <p><a href="https://youtu.be/Du3AZ5dpIv4?t=67">Link to YouTube Explanation/Source by CybertronVGC w/Timestamp</a></p>
      </div>
      <h3>SECOND BUILDER TEAM</h3>
      <div class="sqs-html-content">
        <p>Teambuilder: <a href="https://x.com/OtherBuilder">Preferred Builder</a></p>
        <p>Pokepaste: <a href="https://pokepast.es/0123456789abcdef">https://pokepast.es/0123456789abcdef</a></p>
      </div>
      <h3>Missing paste team</h3><div class="sqs-html-content"><p>Replica Code: ABC</p></div>
    </div></article>`;
  const { candidates, skipped } = parseDevonCorp(html);

  assert.equal(candidates.length, 2);
  const cybertron = candidates[0];
  assert.equal(cybertron.name, 'AARON “CYBERTRON” ZHENG’S CHARIZARD Y TEAM');
  assert.equal(cybertron.creator, 'CybertronVGC');
  assert.equal(cybertron.regulation, 'M-A');
  assert.equal(cybertron.pasteUrl, 'https://pokepast.es/138b4ef886ba95e4');
  assert.equal(cybertron.replicaCode, 'NFVS4SYCW2');
  assert.equal(cybertron.expectedSpecies, null);
  assert.deepEqual(cybertron.reports[0], {
    event: 'DevonCorp collection',
    rank: '',
    sourceUrl: devonCorpUrl,
  });
  assert.ok(
    cybertron.reports.some(
      (entry) =>
        entry.event === 'Teambuilder' &&
        entry.sourceUrl === 'https://x.com/CybertronVGC' &&
        entry.rank === ''
    )
  );
  assert.ok(
    cybertron.reports.some(
      (entry) =>
        entry.event.includes('YouTube Explanation') &&
        entry.sourceUrl === 'https://youtu.be/Du3AZ5dpIv4?t=67' &&
        entry.rank === ''
    )
  );
  assert.ok(cybertron.reports.every(({ rank }) => rank === ''));
  assert.equal(candidates[1].creator, 'Preferred Builder');
  assert.equal(candidates[1].expectedSpecies, null);
  assert.deepEqual(skipped, [
    { sourceUrl: devonCorpUrl, pasteUrl: '', reason: 'missing_paste' },
  ]);
  assertReason(
    () =>
      parseDevonCorp(
        '<h1>Unrelated M-A teams</h1><article><div class="blog-item-content"></div></article>'
      ),
    'wrong_page'
  );
});

test('VR Pastes reconstructs nicknames, moves, EVs, and dates without inventing fields', () => {
  const parsed = parseVrPaste(gengarPaste);
  const members = parsePaste(parsed.paste);
  assert.equal(parsed.format, 'VGC Regulation M-C');
  assert.equal(parsed.notes, 'Format: VGC Regulation M-C');
  const withNotes = parseVrPaste({ ...gengarPaste, notes: 'Source note' });
  assert.equal(withNotes.notes, 'Source note\nFormat: VGC Regulation M-C');
  assert.equal(parsed.publishedAt, '2026-09-11');
  assert.match(parsed.paste, /Genry \(Gengar\) @ Gengarite/);
  assert.match(parsed.paste, /EVs: 30 HP \/ 13 Def \/ 16 SpD \/ 7 Spe/);
  assert.match(
    parsed.paste,
    /- Perish Song\n- Shadow Ball\n- Sludge Bomb\n- Protect/
  );
  assert.match(parsed.paste, /Shiny: Yes/);
  assert.deepEqual(
    {
      pokemon: members[0].pokemon,
      item: members[0].item,
      ability: members[0].ability,
      moves: members[0].moves,
    },
    {
      pokemon: 'Gengar',
      item: 'Gengarite',
      ability: 'Cursed Body',
      moves: ['Perish Song', 'Shadow Ball', 'Sludge Bomb', 'Protect'],
    }
  );
  assert.match(members[0].set, /Genry \(Gengar\)/);

  const minimal = parseVrPaste({
    teams: [
      'Bulbasaur',
      'Ivysaur',
      'Venusaur',
      'Charmander',
      'Charmeleon',
      'Charizard',
    ].map((species) => ({ species })),
  });
  const unknowns = parsePaste(minimal.paste);
  assert.equal(minimal.format, null);
  assert.equal(minimal.notes, null);
  assert.equal(minimal.publishedAt, '');
  assert.deepEqual(
    {
      item: unknowns[0].item,
      ability: unknowns[0].ability,
      nature: unknowns[0].nature,
      moves: unknowns[0].moves,
      spread: unknowns[0].spread,
    },
    { item: null, ability: null, nature: null, moves: [], spread: null }
  );
});

test('VR Pastes rejects protected and malformed payloads with reason codes', () => {
  assertReason(() => parseVrPaste({ hasPassword: true }), 'protected_paste');
  assertReason(() => parseVrPaste({ is_encrypted: true }), 'protected_paste');
  assertReason(
    () => parseVrPaste({ ...gengarPaste, format: 7 }),
    'invalid_payload'
  );

  const duplicate = structuredClone(gengarPaste);
  duplicate.teams[1].species = duplicate.teams[0].species;
  assertReason(() => parseVrPaste(duplicate), 'invalid_payload');
  const invalidMoves = structuredClone(gengarPaste);
  invalidMoves.teams[0].moves = 'Protect';
  assertReason(() => parseVrPaste(invalidMoves), 'invalid_payload');
  const invalidEvs = structuredClone(gengarPaste);
  invalidEvs.teams[0].evs.hp = '30';
  assertReason(() => parseVrPaste(invalidEvs), 'invalid_payload');
  const outOfRangeEvs = structuredClone(gengarPaste);
  outOfRangeEvs.teams[0].evs.hp = 253;
  assertReason(() => parseVrPaste(outOfRangeEvs), 'invalid_payload');
  const newline = structuredClone(gengarPaste);
  newline.teams[0].ability = 'Cursed\nBody';
  assertReason(() => parseVrPaste(newline), 'invalid_payload');
});
