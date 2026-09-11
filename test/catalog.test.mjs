import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesTeam,
  readFilters,
  writeFilters,
  compareTeams,
  evidence,
  normalize,
} from '../src/lib/catalog.ts';

const member = (pokemon, item) => ({
  pokemon,
  item,
  ability: null,
  moves: [],
  nature: null,
  spread: null,
});
const team = (regulation, event, rank) => ({
  id: `${regulation}-${rank}`,
  name: 'Team',
  creator: 'Player',
  sheetIds: ['TEST'],
  regulation,
  publishedAt: '2026-09-01',
  pasteUrl: 'https://pokepast.es/0000000000000000',
  replicaCode: null,
  replicaStatus: '',
  reports: [{ event, rank, sourceUrl: '' }],
  members: [
    member('Incineroar', 'Safety Goggles'),
    member('Charizard-Mega-Y', 'Charizardite Y'),
  ],
  paste: null,
  pasteNotes: null,
});

test('member constraints apply together to the same member; every member is required', () => {
  const fixture = team('M-C', '', '');
  const filters = [
    { pokemon: 'Incineroar', item: 'Safety Goggles', ability: '', move: '' },
    { pokemon: 'Charizard-Mega-Y', item: '', ability: '', move: '' },
  ];
  assert.ok(matchesTeam(fixture, filters));
  assert.equal(
    matchesTeam(fixture, [{ ...filters[0], item: 'Charizardite Y' }]),
    false
  );
  assert.equal(
    matchesTeam(fixture, [...filters, { ...filters[0], pokemon: 'Rillaboom' }]),
    false
  );
  assert.equal(
    matchesTeam(fixture, [{ ...filters[1], pokemon: 'Charizard' }]),
    false
  );
  assert.equal(
    matchesTeam(fixture, [{ ...filters[0], move: 'Fake Out' }]),
    false
  );
  fixture.members[0].moves = ['Fake Out'];
  fixture.members[0].ability = 'Intimidate';
  assert.ok(
    matchesTeam(fixture, [
      { ...filters[0], move: 'Fake Out', ability: 'Intimidate' },
    ])
  );
  assert.notEqual(normalize('Nidoran♀'), normalize('Nidoran♂'));
});

test('filter URLs round-trip with sort/regulation and reject malformed constraints', () => {
  const filters = [
    {
      pokemon: 'Incineroar',
      item: 'Safety Goggles',
      ability: 'Intimidate',
      move: 'Fake Out',
    },
  ];
  const params = writeFilters(
    new URLSearchParams('sort=recent&regulation=M-B&page=4'),
    filters
  );
  assert.deepEqual(readFilters(params), filters);
  assert.equal(params.get('sort'), 'recent');
  assert.equal(params.get('regulation'), 'M-B');
  assert.equal(params.has('page'), false);
  assert.throws(() => readFilters(new URLSearchParams('member=broken')));
  assert.throws(() => readFilters(new URLSearchParams('member=[1,2,3,4]')));
  assert.throws(() =>
    readFilters(writeFilters(new URLSearchParams(), [filters[0], filters[0]]))
  );
  assert.throws(() =>
    readFilters(writeFilters(new URLSearchParams(), Array(7).fill(filters[0])))
  );
});

test('agreed ranking examples and source-platform distinctions hold', () => {
  const mcMaster = team('M-C', 'Ranked Ladder', 'Master Ball');
  const mbCut = team('M-B', 'Worlds', 'Top cut');
  const mcCut = team('M-C', 'Worlds', 'Top cut');
  const mbChampions = team('M-B', 'Ranked Ladder', 'Champions');
  const mcShowdown = team('M-C', 'Showdown Ladder', 'Peak 3rd');
  const mcUnknown = team('M-C', '', '');
  for (const [higher, lower] of [
    [mcMaster, mbCut],
    [mcCut, mbCut],
    [mcMaster, mbChampions],
    [mcShowdown, mcMaster],
    [mcMaster, mcUnknown],
    [mbCut, mcUnknown],
  ])
    assert.ok(compareTeams(higher, lower, 'M-C') < 0);
  assert.equal(
    evidence({ event: 'Worlds', rank: 'Champion', sourceUrl: '' }, 'M-B', 'M-C')
      .platform,
    'Tournament'
  );
  assert.equal(
    evidence({ event: 'Worlds', rank: '101st', sourceUrl: '' }, 'M-B', 'M-C')
      .level,
    3
  );
  assert.equal(
    evidence({ event: '', rank: 'Champion', sourceUrl: '' }, 'M-C', 'M-C')
      .level,
    4
  );
});
