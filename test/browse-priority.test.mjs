import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBrowseTeams, compareTeams } from '../src/lib/catalog.ts';

const validSpread = '32 HP / 32 Atk / 2 Spe';
const pokemon = [
  'Raichu',
  'Espathra',
  'Archaludon',
  'Politoed',
  'Charizard',
  'Venusaur',
];
const member = (spread = validSpread, extra = {}) => ({
  pokemon: 'Raichu',
  item: null,
  ability: null,
  moves: [],
  nature: null,
  spread,
  ...extra,
});
const report = (event = '', rank = '', sourceUrl = '', entrants) => ({
  event,
  rank,
  sourceUrl,
  ...(entrants === undefined ? {} : { entrants }),
});
const team = (id, options = {}) => ({
  id,
  sheetIds: [],
  name: id,
  creator: '',
  regulation: 'M-C',
  publishedAt: '2026-01-01',
  pasteUrl: '',
  replicaCode: null,
  replicaStatus: '',
  reports: [],
  members: pokemon.map((species) => member(validSpread, { pokemon: species })),
  paste: null,
  pasteNotes: null,
  ...options,
});
const order = (teams, compare = compareBrowseTeams, current = 'M-C') =>
  [...teams].sort((a, b) => compare(a, b, current)).map(({ id }) => id);
const video = 'https://www.youtube.com/watch?v=abcdefghijk';

test('resource groups outrank credentials and publication dates', () => {
  const neither = team('neither', {
    publishedAt: '2026-12-31',
    reports: [report('Champions ranked battles', 'Master Ball 1')],
    members: pokemon.map(() => member(null)),
  });
  const videoOnly = team('video-only', {
    publishedAt: '2026-12-30',
    reports: [report('Champions ranked battles', 'Master Ball 2', video)],
    members: pokemon.map(() => member(null)),
  });
  const evOnly = team('ev-only', {
    publishedAt: '2020-01-01',
    reports: [report('Event', 'not a result')],
  });
  const evVideo = team('ev-video', {
    publishedAt: '2019-01-01',
    reports: [report('', '', video)],
  });
  assert.deepEqual(order([neither, evOnly, videoOnly, evVideo]), [
    'ev-video',
    'ev-only',
    'video-only',
    'neither',
  ]);
});

test('only six complete canonical 66-point spreads qualify', () => {
  const complete = team('complete');
  const incomplete = [
    [
      'missing',
      [validSpread, validSpread, validSpread, validSpread, validSpread, null],
    ],
    [
      'empty-spread',
      [validSpread, validSpread, validSpread, validSpread, validSpread, ''],
    ],
    [
      'malformed',
      [
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        '32 HP / nope',
      ],
    ],
    [
      'under-budget',
      [
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        '32 HP / 31 Atk / 2 Spe',
      ],
    ],
    [
      'over-budget',
      [
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        '32 HP / 32 Atk / 3 Spe',
      ],
    ],
    [
      'out-of-range',
      [
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        validSpread,
        '33 HP / 31 Atk / 2 Spe',
      ],
    ],
    ['five-members', Array(5).fill(validSpread)],
    ['seven-members', Array(7).fill(validSpread)],
    ['empty-roster', []],
  ].map(([id, spreads]) =>
    team(id, {
      members: spreads.map((spread) => member(spread)),
      reports: [report('', '', video)],
    })
  );
  assert.deepEqual(order([complete, ...incomplete]), [
    'complete',
    'empty-roster',
    'empty-spread',
    'five-members',
    'malformed',
    'missing',
    'out-of-range',
    'over-budget',
    'seven-members',
    'under-budget',
  ]);
});

test('direct HTTPS video forms count, while invalid URLs and video IDs do not', () => {
  const accepted = [
    'https://youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://m.youtube.com/watch?v=abcdefghijk',
    'https://youtu.be/abcdefghijk',
    'https://youtube.com/live/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
  ];
  for (const [index, url] of accepted.entries()) {
    const withVideo = team(`valid-${index}`, {
      reports: [report('', '', url)],
    });
    const withoutVideo = team(`plain-${index}`);
    assert.ok(compareBrowseTeams(withVideo, withoutVideo, 'M-C') < 0, url);
  }

  const rejected = [
    'https://youtube.com/@channel',
    'https://youtube.com/playlist?list=abcdefghijk',
    'https://youtube.com/watch?v=abcdefghij',
    'https://youtube.com/watch?v=abcdefghijkl',
    'https://youtube.com/live/not_an_id!',
    'http://youtube.com/watch?v=abcdefghijk',
    'https://youtube.com.evil.test/watch?v=abcdefghijk',
    'https://evil-youtube.com/watch?v=abcdefghijk',
    'not a URL',
    '',
  ];
  for (const [index, url] of rejected.entries()) {
    const withBadUrl = team(`same-${index}`, {
      reports: [report('', '', url)],
    });
    const withoutVideo = team(`same-${index}`);
    assert.equal(compareBrowseTeams(withBadUrl, withoutVideo, 'M-C'), 0, url);
  }
});

test('provenance videos count and multiple qualifying videos equal one', () => {
  const fromProvenance = team('provenance', {
    members: pokemon.map((_, index) =>
      member(
        validSpread,
        index === 0
          ? {
              spreadSource: {
                videoUrls: [video],
                pasteUrl: '',
                sourceSet: '',
                originalSet: '',
                appliedSignature: '',
                borrowedNature: false,
              },
            }
          : {}
      )
    ),
  });
  const one = team('one', { reports: [report('', '', video)] });
  const many = team('many', {
    reports: [
      report('', '', video),
      report('', '', 'https://youtu.be/zyxwvutsrqp'),
    ],
  });
  assert.ok(compareBrowseTeams(fromProvenance, team('no-video'), 'M-C') < 0);
  const sameOne = team('same', { reports: [report('', '', video)] });
  const sameMany = team('same', {
    reports: [
      report('', '', video),
      report('', '', 'https://youtu.be/zyxwvutsrqp'),
    ],
  });
  assert.equal(compareBrowseTeams(sameOne, sameMany, 'M-C'), 0);
  assert.ok(
    compareBrowseTeams(one, many, 'M-C') !== 0,
    'distinct IDs retain deterministic ID ordering'
  );
});

test('Browse achievement bands have the specified order', () => {
  const cases = [
    team('champions-top', {
      reports: [report('Champions ranked battles', 'Reported #100')],
    }),
    team('tier', { reports: [report('Ladder', 'Champion Tier')] }),
    team('mb1', {
      reports: [report('Champions ranked battles', 'Master Ball 1')],
    }),
    team('major', { reports: [report('Worlds 2026', '9th')] }),
    team('community', { reports: [report('Local event', '8th', '', 32)] }),
    team('mb2', {
      reports: [report('Champions ranked battles', 'Master Ball 2')],
    }),
    team('champions-101', {
      reports: [report('Champions ranked battles', 'Reported #101')],
    }),
    team('showdown-100', {
      reports: [report('Showdown Ladder', 'Reported #100')],
    }),
    team('mb3', {
      reports: [report('Champions ranked battles', 'Master Ball 3')],
    }),
    team('other', { reports: [report('Local event', 'Champion')] }),
    team('none'),
  ];
  assert.deepEqual(
    order([...cases].reverse()),
    cases.map(({ id }) => id)
  );
});

test('qualifying tournament aliases and boundaries beat only qualifying community finishes', () => {
  const qualifying = [
    team('worlds-alias', {
      reports: [report('Worlds 2026 San Francisco', 'Top cut')],
    }),
    team('regional-alias', {
      reports: [report('Frankfurt Regional Championships', '8th')],
    }),
    team('community', { reports: [report('Event', '8th', '', 32)] }),
  ];
  const weak = [
    team('worlds-too-low', { reports: [report('Worlds', '33rd')] }),
    team('regional-too-low', {
      reports: [report('Baltimore Regional 2027', '9th')],
    }),
    team('event-no-entrants', { reports: [report('Event', '1st')] }),
    team('event-small-field', { reports: [report('Event', '8th', '', 31)] }),
    team('unsupported-event', {
      reports: [report('World Rankings Open', 'Champion')],
    }),
  ];
  const secondCommunity = team('community-second', {
    reports: [report('Event', '2nd', '', 32)],
  });
  assert.deepEqual(order([...weak, ...qualifying, secondCommunity]), [
    'worlds-alias',
    'regional-alias',
    'community-second',
    'community',
    'event-no-entrants',
    'event-small-field',
    'regional-too-low',
    'unsupported-event',
    'worlds-too-low',
  ]);
});

test('best Browse report is selected across reports independent of input order', () => {
  const community = report('Local event', '8th', '', 32);
  const mb2 = report('Champions ranked battles', 'Master Ball 2');
  const both = team('both', { reports: [mb2, community] });
  const communityOnly = team('both', { reports: [community] });
  const reversed = team('both', { reports: [community, mb2] });
  assert.ok(
    compareBrowseTeams(both, team('mb2', { reports: [mb2] }), 'M-C') < 0
  );
  assert.equal(compareBrowseTeams(both, communityOnly, 'M-C'), 0);
  assert.equal(compareBrowseTeams(reversed, communityOnly, 'M-C'), 0);
});

test('Showdown labels remain below qualifying tournaments without Bo1 inference', () => {
  const tournament = team('tournament', {
    reports: [report('Worlds', 'Top cut')],
  });
  const showdown = [
    'Showdown Ladder',
    'Showdown Ladder (Bo1)',
    'Showdown Ladder (Bo3)',
  ].map((event) => team(event, { reports: [report(event, 'Reported #1')] }));
  for (const candidate of showdown)
    assert.ok(compareBrowseTeams(tournament, candidate, 'M-C') < 0);
  assert.deepEqual(order(showdown), [
    'Showdown Ladder',
    'Showdown Ladder (Bo1)',
    'Showdown Ladder (Bo3)',
  ]);
});

test('custom-rule and unknown-regulation guards precede resource groups', () => {
  const resourceRich = team('resource-rich');
  const custom = team('poch-tournament-6ab431f2e905c1db68748c9c-1', {
    reports: [report('Mudkip’s Marsh Pit #6', 'Champion', video)],
  });
  const unknown = team('unknown', {
    regulation: 'Unknown',
    reports: [report('', '', video)],
  });
  assert.deepEqual(order([resourceRich, custom, unknown]), [
    'resource-rich',
    'unknown',
    'poch-tournament-6ab431f2e905c1db68748c9c-1',
  ]);
});

test('current regulation precedes merit within a band, then merit, date, and ID break ties', () => {
  const currentWorseMerit = team('current', {
    regulation: 'M-C',
    reports: [report('Champions ranked battles', 'Reported #2')],
  });
  const historicalBetterMerit = team('historical', {
    regulation: 'M-B',
    reports: [report('Champions ranked battles', 'Reported #1')],
  });
  assert.ok(
    compareBrowseTeams(currentWorseMerit, historicalBetterMerit, 'M-C') < 0
  );
  const merit = [
    team('rank-2', {
      reports: [report('Champions ranked battles', 'Reported #2')],
    }),
    team('rank-1', {
      reports: [report('Champions ranked battles', 'Reported #1')],
    }),
  ];
  assert.deepEqual(order(merit), ['rank-1', 'rank-2']);
  const dated = [
    team('older', { publishedAt: '2025-01-01' }),
    team('newer', { publishedAt: '2026-01-01' }),
  ];
  assert.deepEqual(order(dated), ['newer', 'older']);
  const ids = [team('z'), team('a')];
  assert.deepEqual(order(ids), ['a', 'z']);
});

test('cache recomputes unspecified Master Ball qualification for a changed current regulation', () => {
  const unspecified = team('unspecified', {
    reports: [report('Champions ranked battles', 'Master Ball')],
  });
  const other = team('other', { reports: [report('Local event', 'Champion')] });
  assert.ok(compareBrowseTeams(unspecified, other, 'M-C') < 0);
  assert.ok(compareBrowseTeams(unspecified, other, 'M-B') > 0);
});

test('resource-first ranking is Browse-only', () => {
  const evRichLowResult = team('ev-rich', {
    reports: [report('Other event', 'result')],
  });
  const credentialRichNoEv = team('credential-rich', {
    members: pokemon.map(() => member(null)),
    reports: [report('Champions ranked battles', 'Master Ball 1')],
  });
  assert.ok(compareTeams(credentialRichNoEv, evRichLowResult, 'M-C') < 0);
  assert.ok(compareBrowseTeams(evRichLowResult, credentialRichNoEv, 'M-C') < 0);
});
