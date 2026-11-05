import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bestEvidence,
  compareBrowseTeams,
  compareTeams,
  evidence,
  isExcludedMasterBallTeam,
} from '../src/lib/catalog.ts';

const pokemon = [
  'Raichu',
  'Espathra',
  'Archaludon',
  'Politoed',
  'Charizard',
  'Venusaur',
];
const report = (event, rank, entrants, sourceUrl = '') => ({
  event,
  rank,
  sourceUrl,
  ...(entrants === undefined ? {} : { entrants }),
});
const gc = (rank, entrants) =>
  report('2027 Global Challenge I', rank, entrants);
const ladder = (rank) => report('Champions ranked battles', rank);
const showdown = (rank) => report('Showdown Ladder', rank);
const team = (id, reports = [], options = {}) => ({
  id,
  sheetIds: [],
  name: id,
  creator: '',
  regulation: 'M-C',
  publishedAt: '2026-01-01',
  pasteUrl: '',
  replicaCode: null,
  replicaStatus: '',
  reports,
  members: pokemon.map((species) => ({
    pokemon: species,
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread: '32 HP / 32 Atk / 2 Spe',
  })),
  paste: null,
  pasteNotes: null,
  ...options,
});
const order = (teams, compare) =>
  [...teams].sort((a, b) => compare(a, b, 'M-C')).map(({ id }) => id);
const comparators = [compareTeams, compareBrowseTeams];

test('Global Challenge bands preserve each comparator’s existing ladder and community order', () => {
  const teams = [
    team('gc-1', [gc('1st')]),
    team('gc-100', [gc('100th')]),
    team('ladder-1', [ladder('Reported #1')]),
    team('ladder-100', [ladder('Reported #100')]),
    team('master-1', [ladder('Master Ball 1')]),
    team('major', [report('Worlds 2026', '9th')]),
    team('gc-101', [gc('101st')]),
    team('gc-1000', [gc('1000th')]),
    team('master-2', [ladder('Master Ball 2')]),
    team('ladder-101', [ladder('Reported #101')]),
    team('ladder-1000', [ladder('Reported #1000')]),
    team('showdown-100', [showdown('Reported #100')]),
    team('community', [report('Local event', '8th', 32)]),
    team('master-3', [ladder('Master Ball 3')]),
    team('gc-1001', [gc('1001st', 4096)]),
    team('none'),
  ];
  assert.deepEqual(order([...teams].reverse(), compareTeams), [
    'gc-1',
    'gc-100',
    'ladder-1',
    'ladder-100',
    'master-1',
    'major',
    'gc-101',
    'gc-1000',
    'master-2',
    'ladder-101',
    'ladder-1000',
    'showdown-100',
    'community',
    'master-3',
    'gc-1001',
    'none',
  ]);
  assert.deepEqual(order([...teams].reverse(), compareBrowseTeams), [
    'gc-1',
    'gc-100',
    'ladder-1',
    'ladder-100',
    'master-1',
    'major',
    'community',
    'gc-101',
    'gc-1000',
    'master-2',
    'ladder-101',
    'ladder-1000',
    'showdown-100',
    'master-3',
    'gc-1001',
    'none',
  ]);
});

test('each comparator selects its best Global Challenge or community report', () => {
  const reports = [gc('101st'), report('Local event', '8th', 32)];
  const gcRival = team('gc-rival', [gc('500th')]);
  const communityRival = team('community-rival', [
    report('Local event', '4th', 32),
  ]);
  for (const orderedReports of [reports, [...reports].reverse()]) {
    const mixed = team('mixed', orderedReports);
    assert.equal(bestEvidence(mixed, 'M-C').event, '2027 Global Challenge I');
    assert.ok(compareTeams(mixed, gcRival, 'M-C') < 0);
    assert.ok(compareBrowseTeams(mixed, communityRival, 'M-C') > 0);
    assert.ok(compareBrowseTeams(mixed, gcRival, 'M-C') < 0);
  }
});

test('recognized Global Challenge event labels preserve published evidence', () => {
  const events = [
    '2027 Global Challenge I',
    '2027 Global Challenge I (Seniors)',
    '2027 Global Challenge II',
    'Global Challenge 2027',
    'Global Challenge 2027 I',
    'Global Challenge 2027 II',
    '2099 Global Challenge IX',
    'global challenge 2099 x (seniors)',
  ];
  const sourceUrl = 'https://example.com/original-result';
  for (const event of events) {
    const published = report(event, '100th (Seniors)', 64, sourceUrl);
    const snapshot = structuredClone(published);
    const result = bestEvidence(team(event, [published]), 'M-C');
    assert.equal(result.level, 0, event);
    assert.equal(result.platform, 'Tournament', event);
    assert.equal(result.event, event);
    assert.equal(result.label, published.rank);
    assert.equal(result.entrants, 64);
    assert.deepEqual(published, snapshot);
    assert.equal(published.sourceUrl, sourceUrl);
  }
});

test('Global Challenge placement forms qualify at their stated boundaries', () => {
  const cases = [
    ['Champion', 0],
    ['Winner', 0],
    ['Runner up', 0],
    ['1st', 0],
    ['Top 100', 0],
    ['100th', 0],
    ['100', 0],
    ['Reported #100', 0],
    ['100 (Seniors)', 0],
    ['Top 100 (Seniors)', 0],
    ['Reported #100 (Seniors)', 0],
    ['101st', 1],
    ['Top 101', 1],
    ['101', 1],
    ['Reported #101', 1],
    ['101st (Seniors)', 1],
    ['Top 1000', 1],
    ['1000th', 1],
    ['1000', 1],
    ['Reported #1000', 1],
  ];
  const ladderTop = team('ladder-top', [ladder('Reported #1')]);
  const major = team('major', [report('Worlds 2026', '9th')]);
  const masterTwo = team('master-two', [ladder('Master Ball 2')]);
  for (const [rank, level] of cases) {
    const result = gc(rank);
    assert.equal(evidence(result, 'M-C', 'M-C').level, level, rank);
    const placed = team(`gc-${rank}`, [result]);
    for (const compare of comparators) {
      if (level === 0) {
        assert.ok(compare(placed, ladderTop, 'M-C') < 0, rank);
      } else {
        assert.ok(compare(major, placed, 'M-C') < 0, rank);
        assert.ok(compare(placed, masterTwo, 'M-C') < 0, rank);
      }
    }
  }
  const finishes = [
    team('third', [gc('3rd')]),
    team('runner-up', [gc('Runner up')]),
    team('winner', [gc('Winner')]),
  ];
  for (const compare of comparators)
    assert.deepEqual(order(finishes, compare), [
      'winner',
      'runner-up',
      'third',
    ]);
});

test('unbounded, invalid, and lower Global Challenge claims stay generic', () => {
  const ranks = [
    '',
    'Top cut',
    '1710 rating',
    'Peak #1',
    'Season finish #1',
    '0',
    '0th',
    'Top 0',
    'Reported #0',
    '-1',
    '9007199254740991',
    '9007199254740992',
    '9007199254740992nd',
    'Reported #9007199254740993',
    '1001',
    '1001st',
    'Top 1001',
    'Reported #1001',
  ];
  const lowerMaster = team('master-three', [ladder('Master Ball 3')]);
  for (const rank of ranks) {
    const published = gc(rank, 4096);
    const result = evidence(published, 'M-C', 'M-C');
    assert.equal(result.level, 3, rank);
    assert.equal(result.platform, 'Tournament', rank);
    assert.equal(result.label, rank);
    assert.equal(result.entrants, 4096);
    const generic = team(`gc-${rank}`, [published]);
    for (const compare of comparators)
      assert.ok(compare(lowerMaster, generic, 'M-C') < 0, rank);
  }
});

test('similarly named events do not acquire Global Challenge bands', () => {
  const events = [
    'Global Challenge',
    '1999 Global Challenge I',
    '2100 Global Challenge I',
    '2027 Global Challenge I side event',
    '2027 Global Challenge I (Juniors)',
    '2027 Global Challenge Qualifier',
    'International Global Challenge 2027',
  ];
  const lowerMaster = team('master-three', [ladder('Master Ball 3')]);
  for (const event of events) {
    const result = report(event, '1st');
    assert.equal(evidence(result, 'M-C', 'M-C').level, 3, event);
    const ordinary = team(event, [result]);
    for (const compare of comparators)
      assert.ok(compare(lowerMaster, ordinary, 'M-C') < 0, event);
  }
  const community = team('community', [
    report('2027 Global Challenge I side event', '1st', 64),
  ]);
  const gc101 = team('gc-101', [gc('101st')]);
  assert.ok(compareTeams(gc101, community, 'M-C') < 0);
  assert.ok(compareBrowseTeams(community, gc101, 'M-C') < 0);
});

test('Master Ball exclusions distinguish other results from weak or provenance reports', () => {
  const mb3 = ladder('Master Ball Rank 3');
  const mb4 = ladder('Master Ball 4');
  const cases = [
    ['Master Ball 3 alone', [mb3], true],
    ['Master Ball 4 alone', [mb4], true],
    [
      'collections and videos are not results',
      [
        mb4,
        report(' Example Collection ', '1st'),
        report('Example VIDEO ', '1st'),
      ],
      true,
    ],
    [
      'low ladder position and rating',
      [mb3, ladder('Reported #44823'), ladder('1710 rating')],
      true,
    ],
    ['Champions 1000', [mb3, ladder('Reported #1000')], false],
    ['global position 3 retains', [mb3, ladder('Reported #3')], false],
    ['global position 4 retains', [mb3, ladder('Reported #4')], false],
    ['Champions 1001', [mb3, ladder('Reported #1001')], true],
    ['Showdown 100', [mb3, showdown('Reported #100')], false],
    ['Showdown 101', [mb3, showdown('Reported #101')], true],
    [
      'Showdown Master Ball 3 is not a result',
      [mb3, showdown('Master Ball 3')],
      true,
    ],
    ['Master Ball 1', [mb3, ladder('Master Ball 1')], false],
    ['Master Ball 2', [mb3, ladder('Master Ball 2')], false],
    ['Champion Tier', [mb3, ladder('Champion Tier')], false],
    ['another tournament', [mb3, report('Local tournament', '17th')], false],
    [
      'collection within an event name is a result',
      [mb3, report('Example Collection Cup', '17th')],
      false,
    ],
    ['Global Challenge 1001', [mb3, gc('1001st')], false],
    ['another lower division', [mb3, mb4], true],
    ['bare Master Ball does not retain', [mb3, ladder('Master Ball')], true],
    ['blank event does not retain', [mb3, report('   ', '1st')], true],
    ['blank Global Challenge rank does not retain', [mb3, gc('')], true],
    [
      'blank rank does not retain',
      [mb3, report('Local tournament', '  ')],
      true,
    ],
    ['no reports', [], false],
    ['bare Master Ball alone', [ladder('Master Ball')], false],
    ['global position 3 alone', [ladder('Reported #3')], false],
    ['global position 4 alone', [ladder('Reported #4')], false],
    ['non-Master Ball rank alone', [ladder('Rank 3')], false],
  ];
  for (const [name, reports, expected] of cases) {
    const snapshot = structuredClone(reports);
    assert.equal(
      isExcludedMasterBallTeam(team(name, reports), 'M-C'),
      expected,
      name
    );
    assert.equal(
      isExcludedMasterBallTeam(team(name, [...reports].reverse()), 'M-C'),
      expected,
      `${name}, reversed`
    );
    assert.deepEqual(reports, snapshot, name);
  }
});

test('Master Ball removal uses recognized ladder labels and explicit trimmed divisions', () => {
  const events = [
    'Ladder',
    'Ranked Ladder',
    'Champions Ladder',
    'Champions ranked battles',
    'Ranked Season M-1',
    'Champions ranked battles — Season M-2',
    'Champions ranked battles — Shared team',
  ];
  for (const event of events) {
    for (const rank of [' Master Ball 3 ', ' masterball rank 4 ']) {
      assert.equal(
        isExcludedMasterBallTeam(
          team(event, [report(` ${event} `, rank)]),
          'M-C'
        ),
        true,
        `${event}: ${rank}`
      );
    }
  }
  for (const event of [
    'Showdown Ladder',
    'Community Ladder',
    'Champions ranked battles extra',
  ])
    assert.equal(
      isExcludedMasterBallTeam(
        team(event, [report(event, 'Master Ball 3')]),
        'M-C'
      ),
      false,
      event
    );
  for (const rank of [
    'Rank 3',
    'Master Ball',
    'Master Ball 5',
    'Reported #3',
    '3rd',
  ])
    assert.equal(
      isExcludedMasterBallTeam(team(rank, [ladder(rank)]), 'M-C'),
      false,
      rank
    );
});

test('unknown regulation follows known teams despite Global Challenge results and Browse resources', () => {
  const ordinary = team('ordinary', [report('Local event', 'result')], {
    members: pokemon.map((species) => ({ pokemon: species, spread: null })),
  });
  const unknown = team('unknown', [gc('1st')], { regulation: 'Unknown' });
  for (const compare of comparators)
    assert.deepEqual(order([unknown, ordinary], compare), [
      'ordinary',
      'unknown',
    ]);
});

test('current regulation, placement, date, and ID remain tie breakers', () => {
  const current = team('current', [gc('1000th')]);
  const historical = team('historical', [gc('101st')], { regulation: 'M-B' });
  const historicalTop = team('historical-top', [gc('100th')], {
    regulation: 'M-B',
  });
  const better = team('better', [gc('101st')]);
  const older = team('older', [gc('101st')], { publishedAt: '2025-01-01' });
  const idA = team('a', [gc('101st')]);
  const idZ = team('z', [gc('101st')]);
  for (const compare of comparators) {
    assert.ok(compare(current, historical, 'M-C') < 0);
    assert.ok(compare(historicalTop, current, 'M-C') < 0);
    assert.ok(compare(better, current, 'M-C') < 0);
    assert.ok(compare(better, older, 'M-C') < 0);
    assert.ok(compare(idA, idZ, 'M-C') < 0);
  }
  assert.ok(compareTeams(idZ, idA, 'M-C', -1) < 0);
});

test('Browse resource groups remain ahead of Global Challenge achievements', () => {
  const video = 'https://www.youtube.com/watch?v=abcdefghijk';
  const noEvs = pokemon.map((species) => ({ pokemon: species, spread: null }));
  const both = team('both', [report('', '', undefined, video)]);
  const evOnly = team('ev-only', [gc('100th')]);
  const videoOnly = team(
    'video-only',
    [report('2027 Global Challenge I', '1st', undefined, video)],
    { members: noEvs }
  );
  const neither = team('neither', [gc('1st')], { members: noEvs });
  assert.deepEqual(
    order([neither, videoOnly, evOnly, both], compareBrowseTeams),
    ['both', 'ev-only', 'video-only', 'neither']
  );
  assert.ok(compareTeams(neither, both, 'M-C') < 0);
});
