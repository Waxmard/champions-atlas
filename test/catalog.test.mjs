import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesTeam,
  readFilters,
  writeFilters,
  compareTeams,
  evidence,
  normalize,
  bestEvidence,
  evidenceGrade,
  isCustomRulesTeam,
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

test('achievement ranking parses platform evidence and preserves boundaries', () => {
  const report = (event, rank) => ({ event, rank, sourceUrl: '' });
  const grade = (event, rank, regulation = 'M-C', current = 'M-C') =>
    evidenceGrade(evidence(report(event, rank), regulation, current).level);
  assert.equal(
    evidence(report('Worlds', 'Champion'), 'M-B', 'M-C').platform,
    'Tournament'
  );
  assert.equal(
    evidence(report('Sunday Showdown #1', '1st'), 'M-C', 'M-C').platform,
    'Tournament'
  );
  assert.equal(
    evidence(report('Intimidators Ladder Tour', 'Champion'), 'M-C', 'M-C')
      .platform,
    'Tournament'
  );
  assert.equal(grade('Showdown Ladder', 'Champion'), 'reported');
  assert.equal(grade('Champions ranked battles', 'Reported #0'), 'reported');
  assert.equal(
    grade('Champions ranked battles', 'Reported #9007199254740992'),
    'reported'
  );
  assert.equal(grade('Champions ranked battles', 'Reported #100'), 'strong');
  assert.equal(grade('Champions ranked battles', 'Reported #101'), 'strong');
  assert.equal(grade('Showdown Ladder', 'Peak #100'), 'strong');
  assert.equal(grade('Showdown Ladder', 'Peak #101'), 'reported');
  assert.equal(grade('Showdown Ladder', 'Master Ball'), 'reported');
  assert.equal(grade('Worlds', '101st', 'M-B', 'M-C'), 'reported');
});

test('current elite credentials and event stature outrank ordinary placements', () => {
  const result = (regulation, event, rank, publishedAt = '2026-01-01') => ({
    ...team(regulation, event, rank),
    publishedAt,
  });
  const ordered = [
    result('M-C', 'Champions ranked battles', 'Champion Tier'),
    result('M-C', 'Champions ranked battles', 'Master Ball Rank 1'),
    result('M-B', 'Champions ranked battles', 'Champion Tier'),
    result('M-B', 'Champions ranked battles', 'Master Ball Rank 1'),
    result('M-C', 'Champions ranked battles', 'Master Ball Rank 2'),
    result('M-C', 'Champions ranked battles', 'Master Ball Rank 3'),
    result('M-C', 'Champions ranked battles', 'Master Ball Rank 4'),
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.ok(compareTeams(ordered[i], ordered[i + 1], 'M-C') < 0);
    assert.ok(compareTeams(ordered[i + 1], ordered[i], 'M-C') > 0);
  }
  const rank1 = result('M-C', 'Champions ranked battles', 'Reported #1');
  const rank100 = result('M-C', 'Champions ranked battles', 'Reported #100');
  const rank101 = result('M-C', 'Champions ranked battles', 'Reported #101');
  assert.ok(compareTeams(rank1, rank100, 'M-C') < 0);
  assert.ok(compareTeams(rank100, rank101, 'M-C') < 0);
  assert.ok(
    compareTeams(
      result('M-C', 'Champions ranked battles', 'Master Ball Rank 1'),
      result('M-B', 'Champions ranked battles', 'Reported #1'),
      'M-C'
    ) < 0
  );
  assert.ok(
    compareTeams(
      rank100,
      result('M-B', 'Champions ranked battles', 'Champion Tier'),
      'M-C'
    ) < 0
  );
  const worlds9 = result('M-B', 'Worlds 2026', '9th');
  const ordinary8 = {
    ...result('M-C', 'Small event', '8th'),
    reports: [
      { event: 'Small event', rank: '8th', sourceUrl: '', entrants: 8 },
    ],
  };
  const unknownWinner = result('M-C', 'Small event', 'Winner');
  assert.ok(compareTeams(worlds9, ordinary8, 'M-C') < 0);
  assert.ok(compareTeams(worlds9, unknownWinner, 'M-C') < 0);
  assert.ok(
    compareTeams(
      result('M-B', 'Worlds', '9th'),
      result('M-B', 'Baltimore Regional 2027', '1st'),
      'M-C'
    ) < 0
  );
  assert.equal(
    evidenceGrade(
      evidence(
        {
          event: 'World Cup of Regional Games',
          rank: 'Champion',
          sourceUrl: '',
        },
        'M-C',
        'M-C'
      ).level
    ),
    'reported'
  );
});

test('best evidence and custom-rule grade use selected source and current regulation', () => {
  const mixed = team('M-C', 'Small event', 'Winner');
  mixed.reports.push({
    event: 'Champions ranked battles',
    rank: 'Reported #1',
    sourceUrl: 'rank',
  });
  assert.equal(bestEvidence(mixed, 'M-C').label, 'Reported #1');
  const custom = { ...mixed, id: 'poch-tournament-6ab431f2e905c1db68748c9c-1' };
  assert.equal(evidenceGrade(bestEvidence(custom, 'M-C').level), 'reported');
  const cache = team('M-C', 'Champions ranked battles', 'Master Ball');
  assert.equal(evidenceGrade(bestEvidence(cache, 'M-C').level), 'qualified');
  assert.equal(evidenceGrade(bestEvidence(cache, 'M-B').level), 'reported');
  assert.equal(
    isCustomRulesTeam({
      reports: [{ event: 'Mudkip’s Marsh Pit #6', rank: '1st', sourceUrl: '' }],
    }),
    true
  );
});
