import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePoch, pochUrl } from '../scripts/poch-source.mjs';
import { bestEvidence, matchesTeam } from '../src/lib/catalog.ts';
import { exportPaste, setText } from '../src/lib/workbench.ts';

const decorative = {
  types: '$ab:props:entries:7:team:4:types',
  spriteId: '$undefined',
};
const mon = (name, gender = null) => ({ name, gender, ...decorative });
const member = (line) => {
  const [name, item, ability, nature, moves] = line.split('|');
  const row = { ...mon(name), en: name };
  if (item) row.item = item;
  if (ability) row.ability = ability;
  if (nature) row.nature = nature;
  if (moves) row.moves = moves.split(',');
  return row;
};

const tournament = {
  id: '6aba12f1880ed327106de55b-2',
  player: 'KrebsVGC',
  event: 'Sketch Academy Sunday Regulation M-C Tournament',
  date: '2026-10-05T01:00:00.000Z',
  format: 'M-C',
  rule: 'double',
  players: 62,
  placement: 2,
  country: 'US',
  team: [
    'Raichu|Raichunite X|Lightning Rod|Jolly|Volt Tackle,Fake Out,Reflect,Light Screen',
    'Espathra|Electric Seed|Speed Boost|Timid|Protect,Lumina Crash,Calm Mind,Baton Pass',
    'Archaludon|Leftovers|Stamina|Calm|Protect,Electro Shot,Dragon Pulse,Flash Cannon',
    'Politoed|Sitrus Berry|Drizzle|Calm|Protect,Weather Ball,Muddy Water,Psych Up',
    'Charizard|Charizardite Y|Blaze|Modest|Protect,Heat Wave,Hurricane,Weather Ball',
    'Venusaur|Focus Sash|Chlorophyll|Modest|Protect,Leaf Storm,Sludge Bomb,Sleep Powder',
  ].map(member),
};

const social = {
  id: '2106083996589555887',
  handle: 'elm_motochika',
  displayName: 'エルム',
  date: '2026-10-02T18:08:48.000Z',
  postUrl: 'https://x.com/elm_motochika/status/2106083996589555887',
  rule: 'double',
  rank: 4,
  tier: null,
  tierRank: null,
  rating: null,
  event: null,
  place: 0,
  wins: 0,
  losses: 0,
  teamName: null,
  code: null,
  mons: [
    'Dragonite',
    'Floette',
    'Sneasler',
    'Incineroar',
    'Rillaboom',
    'Gholdengo',
  ].map((name) => mon(name)),
};

const collected = { event: 'Poch.ms collection', rank: '', sourceUrl: pochUrl };
const ladder = (rank) => ({
  event: 'Champions ranked battles',
  rank,
  sourceUrl: social.postUrl,
});
const eventReport = (event, rank) => ({
  event,
  rank,
  sourceUrl: social.postUrl,
});
const skip = (id, source, reason) => ({ id, source, reason });
const results = (team) =>
  team.reports.filter((report) => report.event !== 'Poch.ms collection');
const species = (team) => team.members.map((one) => one.pokemon).join();
const filter = (pokemon, fields = {}) => ({ pokemon, ...fields });
const match = (team, pokemon, fields) =>
  matchesTeam(team, [filter(pokemon, fields)]);
const clone = (value) => structuredClone(value);
const socialRow = (fields = {}) => ({ ...clone(social), ...fields });
const tournamentRow = (fields = {}) => ({ ...clone(tournament), ...fields });

function push(chunk, type = 1) {
  return `<script>self.__next_f.push(${JSON.stringify([type, chunk]).replace(/</g, '\\u003c')})</script>`;
}

function flightPage(value, options = {}) {
  const body =
    options.body ||
    JSON.stringify(['$', 'section', null, { children: { props: value } }]);
  const flight = `:HL["ignored.css","style"]\n0:I["ignored-module"]\n${options.id || 'fa3'}:${body}\n`;
  const chunks = [];
  let offset = 0;
  for (const end of [...(options.splits || []), flight.length]) {
    chunks.push(flight.slice(offset, end));
    offset = end;
  }
  return `<html><body>${push(null, 0)}${chunks.map((chunk) => push(chunk)).join('')}</body></html>`;
}

const page = (entries = [], x = []) =>
  flightPage({ entries, x, ladderSeasons: [{ season: 3, teams: [social] }] });

function rejected(row, source = 'x') {
  const parsed =
    source === 'entries'
      ? parsePoch(page([tournament, row]))
      : parsePoch(page([tournament], [row]));
  assert.equal(parsed.teams.length, 1);
  assert.equal(parsed.skipped.length, 1);
  assert.deepEqual(parsed.skipped[0].id, row?.id ?? '');
  assert.ok(!parsed.skipped[0].reason.startsWith('unsupported'));
  return parsed.skipped[0];
}

test('chunked Flight records admit the published M-C tournament without executing scripts', () => {
  const props = { entries: [tournament], x: [social] };
  const body = JSON.stringify(['$', 'section', null, { children: { props } }]);
  const flight = `:HL["ignored.css","style"]\n0:I["ignored-module"]\nbeef:${body}`;
  const split = flight.indexOf('Raichunite') + 5;
  const options = { id: 'beef', body, splits: [7, split, split + 17] };
  const pageHtml = flightPage({ entries: [tournament], x: [social] }, options);
  const html = `${pageHtml}<script>globalThis.pochExecuted = true</script>`;
  const { teams, skipped } = parsePoch(html);
  assert.equal(globalThis.pochExecuted, undefined);
  assert.equal(teams.length, 2);
  assert.deepEqual(skipped, []);
  const team = teams[0];
  assert.equal(team.id, `poch-tournament-${tournament.id}`);
  assert.equal(team.creator, 'KrebsVGC');
  assert.equal(team.name, `KrebsVGC — ${tournament.event}`);
  assert.equal(team.regulation, 'M-C');
  assert.equal(team.publishedAt, '2026-10-05');
  assert.deepEqual(team.sheetIds, []);
  assert.equal(team.pasteUrl, '');
  assert.equal(team.pasteNotes, null);
  assert.ok(!Object.hasOwn(team, 'pasteError'));
  assert.deepEqual(team.reports, [
    { event: tournament.event, rank: '2nd', sourceUrl: pochUrl },
    collected,
  ]);
  const raichu = team.members[0];
  assert.equal(raichu.pokemon, 'Raichu-Mega-X');
  assert.equal(raichu.item, 'Raichunite X');
  assert.equal(raichu.ability, 'Lightning Rod');
  assert.equal(team.members[4].pokemon, 'Charizard-Mega-Y');
  assert.equal(team.members[4].ability, 'Blaze');
  assert.ok(team.members.every((one) => one.spread === null));
  assert.ok(team.members.every((one) => one.set === setText(one)));
  assert.equal(team.paste, exportPaste(team.members));
  assert.match(
    team.paste,
    /Raichu-Mega-X @ Raichunite X\nAbility: Lightning Rod/
  );
  assert.doesNotMatch(team.paste, /EVs:|\$ab|undefined|Psychic Surge/);
  assert.ok(matchesTeam(team, [filter('Espathra'), filter('Raichu-Mega-X')]));
  assert.ok(
    match(team, 'Raichu-Mega-X', { item: 'Raichunite X', move: 'Volt Tackle' })
  );
  assert.ok(!match(team, 'Espathra', { item: 'Raichunite X' }));
  assert.ok(!match(team, 'Raichu-Mega-X', { move: 'Lumina Crash' }));
});

test('the published rank-bearing social roster stays Unknown and keeps original post attribution', () => {
  const { teams, skipped } = parsePoch(
    page([], [{ ...clone(social), code: 'N852QBTW9D' }])
  );
  assert.deepEqual(skipped, []);
  const team = teams[0];
  assert.equal(team.id, `poch-x-${social.id}`);
  assert.equal(team.regulation, 'Unknown');
  assert.equal(team.creator, 'エルム');
  assert.equal(team.name, 'エルム — Champions doubles team');
  assert.equal(team.publishedAt, '2026-10-02');
  assert.equal(team.replicaCode, 'N852QBTW9D');
  assert.equal(team.replicaStatus, '');
  assert.equal(team.paste, null);
  assert.equal(team.pasteUrl, '');
  assert.equal(team.pasteNotes, null);
  assert.deepEqual(team.reports, [ladder('Reported #4'), collected]);
  assert.equal(bestEvidence(team, 'M-C').platform, 'Champions ladder');
  assert.ok(
    team.members.every(
      (one) =>
        one.item === null &&
        one.ability === null &&
        one.nature === null &&
        one.spread === null &&
        one.moves.length === 0
    )
  );
  assert.ok(!match(team, 'Dragonite', { item: 'Life Orb' }));
  assert.ok(!match(team, 'Dragonite', { ability: 'Multiscale' }));
  assert.ok(!match(team, 'Dragonite', { move: 'Protect' }));
});

test('optional published set fields remain partial and exports contain only known values', () => {
  const row = clone(social);
  Object.assign(row.mons[0], {
    ability: 'Multiscale',
    moves: ['Dragon Pulse', 'Protect', 'Tailwind', 'Heat Wave'],
    gender: 'M',
  });
  Object.assign(row.mons[1], {
    ability: 'Flower Veil',
    gender: 'F',
    item: '',
    nature: null,
    moves: null,
  });
  Object.assign(row.mons[2], {
    item: null,
    ability: '',
    nature: '',
    moves: [],
  });
  const team = parsePoch(page([], [row])).teams[0];
  assert.equal(team.members[0].item, null);
  assert.equal(team.members[1].pokemon, 'Floette-Eternal');
  assert.equal(team.members[2].ability, null);
  assert.equal(team.members[2].nature, null);
  assert.equal(team.paste, exportPaste(team.members));
  assert.match(
    team.paste,
    /Dragonite\nAbility: Multiscale\n- Dragon Pulse\n- Protect/
  );
  assert.match(team.paste, /Floette-Eternal\nAbility: Flower Veil/);
  assert.doesNotMatch(team.paste, / @ |EVs:| Nature|unknown|null|undefined/);
  assert.ok(
    match(team, 'Dragonite', { ability: 'Multiscale', move: 'Protect' })
  );
});

test('forms resolve only from published species, supported female forms, and Mega stones', () => {
  const femaleRoster = 'Indeedee,Meowstic,Raichu,Dragonite,Rillaboom,Gholdengo'
    .split(',')
    .map((name) => mon(name, 'F'));
  const team = parsePoch(page([], [{ ...clone(social), mons: femaleRoster }]))
    .teams[0];
  assert.equal(
    species(team),
    'Indeedee-F,Meowstic-F,Raichu,Dragonite,Rillaboom,Gholdengo'
  );
  assert.equal(team.members[2].item, null);
  assert.equal(team.members[2].ability, null);
  assert.equal(team.paste, null);
  const fallback = clone(tournament);
  delete fallback.team[0].en;
  fallback.team[1].en = '';
  const canonicalNames = new Map([
    ['raichumegax', 'Raichu Mega X'],
    ['espathra', 'ESPATHRA'],
  ]);
  const resolved = parsePoch(page([fallback]), canonicalNames).teams[0];
  assert.equal(resolved.members[0].pokemon, 'Raichu Mega X');
  assert.equal(resolved.members[1].pokemon, 'ESPATHRA');
  assert.equal(resolved.members[0].ability, 'Lightning Rod');
  assert.ok(
    matchesTeam(resolved, [filter('Raichu-Mega-X'), filter('Espathra')])
  );
});

test('published Floette spellings use the approved Eternal alias and a Floettite alone enables Mega', () => {
  const floette = (mons) =>
    parsePoch(page([], [{ ...clone(social), mons }])).teams[0].members[1];
  const itemless = floette(clone(social).mons);
  assert.equal(itemless.pokemon, 'Floette-Eternal');
  assert.equal(itemless.item, null);
  assert.equal(itemless.ability, null);
  const row = clone(social);
  Object.assign(row.mons[1], { item: 'Floettite', ability: 'Flower Veil' });
  const mega = floette(row.mons);
  assert.equal(mega.pokemon, 'Floette-Mega');
  assert.equal(mega.item, 'Floettite');
  assert.equal(mega.ability, 'Flower Veil');
  delete row.mons[1].ability;
  assert.equal(floette(row.mons).ability, null);
  const eternal = clone(social);
  eternal.mons[1].name = 'Eternal Flower Floette';
  assert.equal(floette(eternal.mons).pokemon, 'Floette-Eternal');
  const event = clone(tournament);
  event.team[0] = member('Floette|Floettite|Flower Veil');
  const published = parsePoch(page([event])).teams[0].members[0];
  assert.equal(published.pokemon, 'Floette-Mega');
  assert.equal(published.ability, 'Flower Veil');
});

function socialTeam(first) {
  const row = socialRow({ mons: [mon(first), ...social.mons.slice(1)] });
  return parsePoch(page([], [row])).teams[0];
}

test('published display names map only to their explicitly named forms', () => {
  const names =
    'Hisuian Arcanine=Arcanine-Hisui|Hisuian Goodra=Goodra-Hisui|Hisuian Samurott=Samurott-Hisui|Hisuian Typhlosion=Typhlosion-Hisui|Hisuian Zoroark=Zoroark-Hisui|Alolan Ninetales=Ninetales-Alola|Galarian Slowking=Slowking-Galar|Wash Rotom=Rotom-Wash|Heat Rotom=Rotom-Heat|Paldean Tauros Aqua Breed=Tauros-Paldea-Aqua';
  for (const pair of names.split('|')) {
    const [display, resolved] = pair.split('=');
    const team = socialTeam(display);
    const member = team.members[0];
    assert.equal(member.pokemon, resolved);
    assert.equal(member.item, null);
    assert.equal(member.ability, null);
    assert.equal(member.spread, null);
    assert.equal(team.regulation, 'Unknown');
  }
  assert.throws(
    () => socialTeam('Unpublishedmon'),
    /Every supported doubles record/
  );
});

test('social ladder reports keep every published claim without inferring peak, finish, or global rank', () => {
  const row = {
    ...clone(social),
    rank: 42,
    tier: 'Master Ball',
    tierRank: 7,
    rating: 2012.5,
    teamName: 'Published team',
  };
  const team = parsePoch(page([], [row])).teams[0];
  assert.equal(team.name, 'Published team');
  assert.deepEqual(results(team), [
    ladder('Reported #42'),
    ladder('Master Ball Rank 7'),
    ladder('2012.5 rating'),
  ]);
  assert.ok(
    team.reports.every(
      (one) => !/Peak|Season finish|Reported #7/.test(one.rank)
    )
  );
  const tierOnly = parsePoch(
    page([], [{ ...row, rank: null, tierRank: null, rating: null }])
  ).teams[0];
  assert.deepEqual(results(tierOnly), [ladder('Master Ball')]);
  const bare = {
    ...clone(social),
    rank: null,
    tierRank: 3,
    displayName: '',
    code: '',
  };
  const unreported = parsePoch(page([], [bare])).teams[0];
  assert.equal(unreported.creator, social.handle);
  assert.equal(unreported.replicaCode, null);
  assert.deepEqual(results(unreported), [ladder('')]);
  assert.equal(bestEvidence(unreported, 'M-C').label, 'No reported result');
});

test('social events use placement with zero/null/missing fallback and never emit ladder claims', () => {
  for (const place of [0, null, undefined]) {
    const row = {
      ...clone(social),
      event: 'Published Doubles Cup',
      place,
      rank: 3,
      tier: 'Champion Tier',
      tierRank: 1,
      rating: 2200,
    };
    const team = parsePoch(page([], [row])).teams[0];
    assert.deepEqual(results(team), [eventReport(row.event, '3rd')]);
    assert.ok(
      team.reports.every((one) => one.event !== 'Champions ranked battles')
    );
  }
  const placed = {
    ...clone(social),
    event: 'Published Cup',
    place: 2,
    rank: 1,
  };
  assert.equal(results(parsePoch(page([], [placed])).teams[0])[0].rank, '2nd');
  const unplaced = { ...placed, place: 0, rank: null };
  assert.deepEqual(results(parsePoch(page([], [unplaced])).teams[0]), [
    eventReport(placed.event, ''),
  ]);
  for (const place of [-1, 1.5, '2', '', '$f:place'])
    assert.equal(rejected({ ...placed, place }).reason, 'invalid_position');
});

test('tournament ordinal labels preserve placement without inferring top cut or participation', () => {
  const placements = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 111];
  const rows = [...placements, 0, null, undefined].map((placement, index) => ({
    ...clone(tournament),
    id: `place-${index}`,
    placement,
  }));
  const teams = parsePoch(page(rows)).teams;
  assert.equal(
    teams.map((team) => results(team)[0].rank).join(),
    '1st,2nd,3rd,4th,11th,12th,13th,21st,22nd,23rd,111th,,,'
  );
  assert.ok(
    teams.every((team) => !/Top|Participant/i.test(results(team)[0].rank))
  );
  for (const placement of [-1, 2.5, '2', '', Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      rejected(
        { ...clone(tournament), id: 'invalid-place', placement },
        'entries'
      ).reason,
      'invalid_position'
    );
});

test('admission checks ids and rule before excluding singles and unsupported formats', () => {
  const entries = [
    {
      id: 'single-event',
      rule: 'single',
      format: null,
      team: '$bad',
      date: 'not a date',
    },
    {
      id: 'unsupported-event',
      rule: 'double',
      format: 'M-D',
      team: 42,
      player: {},
    },
  ];
  const x = [
    {
      id: 'single-post',
      rule: 'single',
      mons: [null],
      postUrl: 'javascript:bad',
      rank: -1,
    },
  ];
  assert.deepEqual(parsePoch(page(entries, x)), {
    teams: [],
    skipped: [
      skip('single-event', 'entries', 'unsupported_rule'),
      skip('unsupported-event', 'entries', 'unsupported_format'),
      skip('single-post', 'x', 'unsupported_rule'),
    ],
  });
  for (const id of [
    '',
    ' ',
    'slash/id',
    '日本語',
    '$f',
    'a'.repeat(129),
    42,
    null,
    undefined,
  ])
    assert.equal(rejected({ ...clone(social), id }).reason, 'invalid_id');
  const maximalId = 'A'.repeat(128);
  assert.equal(
    parsePoch(page([], [{ ...clone(social), id: maximalId }])).teams[0].id,
    `poch-x-${maximalId}`
  );
  for (const rule of ['', 'triples', null, undefined, {}, '$f:rule'])
    assert.equal(rejected({ ...clone(social), rule }).reason, 'invalid_rule');
  for (const format of ['', null, undefined, {}, '$f:format'])
    assert.equal(
      rejected({ ...clone(tournament), id: 'bad-format', format }, 'entries')
        .reason,
      'invalid_field'
    );
  for (const format of ['M-A', 'M-B', 'M-C'])
    assert.equal(
      parsePoch(page([{ ...clone(tournament), format }])).teams[0].regulation,
      format
    );
});

test('six unique resolved canonical species are required', () => {
  for (const mons of [
    null,
    undefined,
    '$f:mons',
    [],
    social.mons.slice(0, 5),
    [...social.mons, mon('Raichu')],
  ])
    assert.equal(rejected({ ...clone(social), mons }).reason, 'invalid_roster');
  const badNames = [
    null,
    'Dragonite',
    [],
    { name: '' },
    { name: 'Unpublishedmon' },
  ];
  for (const value of [...badNames, { name: '$f:name' }]) {
    const row = clone(social);
    row.mons[0] = value;
    rejected(row);
  }
  const duplicate = clone(social);
  duplicate.mons[0].name = 'gholdengo';
  assert.equal(rejected(duplicate).reason, 'invalid_roster');
  const megaDuplicate = clone(tournament);
  megaDuplicate.id = 'duplicate-mega';
  megaDuplicate.team[1] = member('Raichu-Mega-X|Raichunite X');
  assert.equal(rejected(megaDuplicate, 'entries').reason, 'invalid_roster');
  const duplicateName = new Map([['dragonite', 'Gholdengo']]);
  assert.throws(
    () => parsePoch(page([], [social]), duplicateName),
    /Every supported doubles record/
  );
  const conflict = clone(tournament);
  conflict.id = 'conflicting-stone';
  conflict.team[0] = member('Raichu-Mega-X|Charizardite Y');
  assert.equal(rejected(conflict, 'entries').reason, 'unresolved_species');
});

test('present malformed set fields, moves, and unresolved references reject rows', () => {
  for (const field of ['item', 'ability', 'nature', 'gender']) {
    for (const value of [
      42,
      false,
      [],
      {},
      '$f:member',
      'Injected\n- Fake move',
    ]) {
      const row = clone(social);
      row.mons[0][field] = value;
      assert.equal(rejected(row).reason, 'invalid_field');
    }
  }
  for (const moves of [
    '$f:moves',
    {},
    'Protect',
    ['Protect', 'Tailwind', 'Heat Wave', 'Dragon Pulse', 'Roost'],
    [''],
    [' '],
    [null],
    [42],
    ['Protect', 'protect'],
    ['$f:move'],
    ['Protect\nAbility: Fake'],
  ]) {
    const row = clone(social);
    row.mons[0].moves = moves;
    rejected(row);
  }
  const named = ['displayName', 'handle', 'teamName', 'event', 'tier', 'code'];
  for (const field of named) {
    for (const value of [false, 1, {}, [], '$f:source']) {
      const row = socialRow({ [field]: value });
      assert.equal(rejected(row).reason, 'invalid_field');
    }
  }
  for (const field of ['player', 'event']) {
    for (const value of [null, '', {}, '$f:source']) {
      const row = { ...clone(tournament), id: `bad-${field}`, [field]: value };
      assert.equal(rejected(row, 'entries').reason, 'invalid_field');
    }
  }
  const anonymous = socialRow({ handle: '', displayName: null });
  assert.equal(rejected(anonymous).reason, 'invalid_field');
  const referenceName = clone(tournament);
  referenceName.id = 'reference-name';
  referenceName.team[0].en = '$f:en';
  assert.equal(rejected(referenceName, 'entries').reason, 'invalid_field');
  const ignored = clone(social);
  Object.assign(ignored.mons[0], {
    spread: '32 HP',
    num: '$f:num',
    abilityLoc: '$f:abilityLoc',
  });
  const one = parsePoch(page([], [ignored])).teams[0].members[0];
  assert.equal(one.spread, null);
  assert.ok(!Object.hasOwn(one, 'types'));
  assert.ok(!Object.hasOwn(one, 'spriteId'));
});

test('numeric positions and ratings require the published numeric type and valid value', () => {
  const unsafe = Number.MAX_SAFE_INTEGER + 1;
  for (const field of ['rank', 'tierRank']) {
    for (const value of [-1, 0, 1.2, '4', '', {}, '$f:rank', unsafe]) {
      const row = socialRow({ [field]: value });
      assert.equal(rejected(row).reason, 'invalid_position');
    }
  }
  for (const rating of [-1, 0, '2000', '', {}, '$f:rating']) {
    const row = socialRow({ rating });
    assert.equal(rejected(row).reason, 'invalid_rating');
  }
  const body = JSON.stringify({
    entries: [tournament],
    x: [{ ...social, rating: 1 }],
  }).replace('"rating":1', '"rating":1e400');
  assert.equal(
    parsePoch(flightPage(null, { body })).skipped[0].reason,
    'invalid_rating'
  );
  const boundary = {
    ...clone(social),
    rank: Number.MAX_SAFE_INTEGER,
    tier: 'Published tier',
    tierRank: Number.MAX_SAFE_INTEGER,
    rating: 1,
  };
  assert.equal(
    results(parsePoch(page([], [boundary])).teams[0])
      .map((one) => one.rank)
      .join(),
    `Reported #${Number.MAX_SAFE_INTEGER},Published tier Rank ${Number.MAX_SAFE_INTEGER},1 rating`
  );
});

test('dates retain the published calendar day and absent dates stay unknown', () => {
  for (const date of [undefined, null, '']) {
    const socialDate = parsePoch(page([], [socialRow({ date })])).teams[0];
    const eventDate = parsePoch(page([tournamentRow({ date })])).teams[0];
    assert.deepEqual([socialDate.publishedAt, eventDate.publishedAt], ['', '']);
  }
  for (const date of ['2026-10-02', '2026-10-02T23:30:00-05:00']) {
    const row = parsePoch(page([], [socialRow({ date })])).teams[0];
    assert.equal(row.publishedAt, '2026-10-02');
  }
  for (const date of ['not a date', '2026-02-30T12:00:00.000Z', '2026-13-01'])
    rejected(socialRow({ date }));
  for (const date of ['2026-10-02T25:00:00Z', '1', 1789100000, {}, '$f:date'])
    rejected(socialRow({ date }));
});

test('original X/Twitter URLs require HTTPS, approved hosts, and no credentials', () => {
  const hosts = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'];
  for (const host of [...hosts, 'mobile.twitter.com']) {
    const postUrl = `https://${host}/elm_motochika/status/${social.id}?s=20`;
    const team = parsePoch(page([], [{ ...clone(social), postUrl }])).teams[0];
    assert.equal(results(team)[0].sourceUrl, postUrl);
  }
  for (const postUrl of [
    undefined,
    null,
    '',
    {},
    '$f:url',
    'http://x.com/a/status/1',
    'javascript:alert(1)',
    'https://evil.example/a/status/1',
    'https://x.com.evil.example/a/status/1',
    'https://evil.example@x.com/a/status/1',
    'https://a:password@twitter.com/a/status/1',
    'https://@x.com/a/status/1',
    'https://x.com:8443/a/status/1',
    'https://x.com\\evil.example/a/status/1',
    ' https://x.com/a/status/1',
    'https://x.com/a/status/1\n',
  ])
    rejected({ ...clone(social), postUrl });
});

test('identical ids deduplicate, changed records conflict, and publications keep ids', () => {
  const another = { ...clone(tournament), id: 'another-publication' };
  const reversed = Object.fromEntries(
    Object.entries(clone(tournament)).reverse()
  );
  const html = page([tournament, reversed, another], [social, clone(social)]);
  const first = parsePoch(html);
  assert.equal(first.teams.length, 3);
  assert.deepEqual(first.skipped, []);
  assert.deepEqual(first, parsePoch(html));
  assert.deepEqual(first.teams[0].members, first.teams[1].members);
  assert.notEqual(first.teams[0].id, first.teams[1].id);
  assert.throws(
    () => parsePoch(page([tournament, { ...tournament, placement: 1 }])),
    /Conflicting records/
  );
  assert.throws(
    () => parsePoch(page([], [social, { ...social, rank: 5 }])),
    /Conflicting records/
  );
  assert.throws(
    () =>
      parsePoch(
        page(
          [],
          [
            { id: 'single-id', rule: 'single' },
            { id: 'single-id', rule: 'double' },
          ]
        )
      ),
    /Conflicting records/
  );
});

test('missing, malformed, and conflicting containers fail source validation', () => {
  for (const html of [
    null,
    '',
    '<html>No Flight data</html>',
    push('f:{invalid}\n'),
  ])
    assert.throws(() => parsePoch(html), /Poch.ms:/);
  for (const props of [
    {},
    { entries: [] },
    { x: [] },
    { entries: {}, x: [] },
    { entries: [], x: null },
    { entries: '$f:entries', x: [] },
    { entries: [], x: '$f:x' },
  ])
    assert.throws(
      () => parsePoch(flightPage(props)),
      /data container|both be arrays/
    );
  const one = { entries: [tournament], x: [] };
  const other = { entries: [], x: [social] };
  assert.throws(
    () => parsePoch(flightPage([one, other])),
    /Conflicting data containers/
  );
  assert.throws(
    () => parsePoch(flightPage([one, { entries: null, x: [] }])),
    /both/
  );
  assert.equal(parsePoch(flightPage([one, clone(one)])).teams.length, 1);
  assert.deepEqual(parsePoch(page()), { teams: [], skipped: [] });
  assert.throws(
    () => parsePoch(push('not a record\n')),
    /Malformed Flight record/
  );
  assert.throws(
    () =>
      parsePoch(
        '<script>self.__next_f.push([1, {"entries":[],"x":[]}])</script>'
      ),
    /type-1 payload/
  );
  assert.throws(
    () =>
      parsePoch('<script>self.__next_f.push([1, "f:{}\\n", "extra"])</script>'),
    /type-1 payload/
  );
  assert.throws(
    () =>
      parsePoch(
        '<script>self.__next_f.push([1, globalThis.pochExecuted = true])</script>'
      ),
    /Malformed Flight push/
  );
  assert.equal(globalThis.pochExecuted, undefined);
});

test('all-invalid supported doubles and malformed unsupported admissions cannot publish', () => {
  const invalidTournament = { ...clone(tournament), team: [] };
  const invalidSocial = { ...clone(social), mons: [] };
  assert.throws(
    () => parsePoch(page([invalidTournament])),
    /Every supported doubles record/
  );
  assert.throws(
    () => parsePoch(page([], [invalidSocial])),
    /Every supported doubles record/
  );
  assert.throws(
    () =>
      parsePoch(
        page([invalidTournament], [{ id: 'valid-single', rule: 'single' }])
      ),
    /Every supported doubles record/
  );
  const invalidRows = [
    null,
    {},
    { id: 'bad-rule' },
    { rule: '$f:rule' },
    { id: 'bad/id', rule: 'single' },
  ];
  for (const invalid of invalidRows) {
    assert.throws(() => parsePoch(page([], [invalid])), /malformed admission/);
    assert.throws(
      () =>
        parsePoch(page([], [{ id: 'valid-single', rule: 'single' }, invalid])),
      /malformed admission/
    );
  }
  assert.throws(
    () => parsePoch(page([{ id: 'no-format', rule: 'double' }])),
    /malformed/
  );
  const unsupported = page([
    { id: 'unsupported', rule: 'double', format: 'M-Z' },
  ]);
  assert.equal(parsePoch(unsupported).teams.length, 0);
});
