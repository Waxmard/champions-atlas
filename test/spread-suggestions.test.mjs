import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogSpreadSuggestions,
  originalSpreadSuggestion,
} from '../src/lib/workbench.ts';

const team = (
  id,
  regulation,
  members,
  publishedAt = '2026-01-01',
  reports = []
) => ({ id, regulation, publishedAt, reports, members });
const member = (pokemon, nature = 'Modest', spread = null, extra = {}) => ({
  pokemon,
  item: null,
  ability: 'Levitate',
  nature,
  spread,
  moves: ['Hydro Pump'],
  ...extra,
});
const raichu = {
  pokemon: 'Raichu',
  item: 'Raichunite Y',
  ability: 'Lightning Rod',
  nature: 'Timid',
  spread: '18 HP / 25 Def / 23 Spe',
  moves: ['Thunderbolt'],
};
const self = member('Rotom-Wash', 'Modest');
const modestSpreads = [
  '31 HP / 4 Def / 31 SpA',
  '30 HP / 5 Def / 31 SpA',
  '29 HP / 6 Def / 31 SpA',
  '28 HP / 7 Def / 31 SpA',
  '27 HP / 8 Def / 31 SpA',
  '26 HP / 9 Def / 31 SpA',
];
const boldSpread = '31 HP / 13 Def / 16 SpD / 6 Spe';
const source = (
  id,
  spread,
  {
    regulation = 'M-C',
    publishedAt = '2026-01-01',
    reports = [],
    teammates = [],
  } = {}
) =>
  team(
    id,
    regulation,
    [member('Rotom-Wash', 'Modest', spread), ...teammates],
    publishedAt,
    reports
  );
const natureCatalog = [
  ...modestSpreads.map((spread, i) => source('modest-' + i, spread)),
  ...Array.from({ length: 3 }, (_, i) =>
    team('timid-common-' + i, 'M-C', [
      member('Rotom-Wash', 'Timid', '31 HP / 4 Def / 30 SpA / 1 Spe'),
    ])
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    team('timid-other-' + i, 'M-C', [
      member('Rotom-Wash', 'Timid', '30 HP / 5 Def / 30 SpA / 1 Spe'),
    ])
  ),
  team('bold', 'M-B', [member('Rotom-Wash', 'Bold', boldSpread)]),
  team('incomplete-bold', 'M-C', [member('Rotom-Wash', 'Bold', '31 HP')]),
  team('other-form', 'M-C', [member('Rotom-Heat', 'Bold', boldSpread)]),
];
const selected = (nature, teams = natureCatalog, limit = 5, teammates = []) =>
  catalogSpreadSuggestions({ ...self, nature }, teams, 'M-C', limit, teammates);
const spreadList = (suggestions) =>
  suggestions.map(({ nature, spread }) => [nature, spread]);

test('catalog suggestions are limited to the canonical current Nature', () => {
  const modest = selected('Modest');
  assert.equal(modest.length, 5);
  assert.equal(
    new Set(modest.map(({ nature, spread }) => nature + '|' + spread)).size,
    5
  );
  assert.ok(modest.every(({ nature }) => nature === 'Modest'));
  assert.deepEqual(selected('mOdEsT'), modest);

  const bold = selected('Bold');
  assert.deepEqual(spreadList(bold), [['Bold', boldSpread]]);
  assert.equal(bold[0].currentCount, 0);
  assert.equal(bold[0].totalCount, 1);
  assert.equal(bold[0].speed, 112);
  assert.deepEqual(
    bold[0].deltas.map(({ stat, from, to }) => [stat, from, to]),
    [
      ['HP', 0, 31],
      ['Def', 0, 13],
      ['SpD', 0, 16],
      ['Spe', 0, 6],
    ]
  );
  assert.equal(bold[0].movedPoints, 33);
});

test('missing or invalid Nature, form, pair, and nonpositive limits return no rows', () => {
  for (const nature of [null, '', 'not-a-nature'])
    assert.deepEqual(selected(nature), []);
  const withoutNature = { ...self };
  delete withoutNature.nature;
  assert.deepEqual(
    catalogSpreadSuggestions(withoutNature, natureCatalog, 'M-C'),
    []
  );
  assert.deepEqual(selected('Careful'), []);
  assert.deepEqual(
    catalogSpreadSuggestions(
      member('Missingno', 'Modest'),
      natureCatalog,
      'M-C'
    ),
    []
  );
  assert.deepEqual(selected('Modest', natureCatalog, 0), []);
  assert.deepEqual(selected('Modest', natureCatalog, -1), []);
});

test('team overlap and matched details rank the actual source teams', () => {
  const pikachu = member('Pikachu', 'Timid');
  const gholdengo = member('Gholdengo', 'Modest');
  const shared = [pikachu, gholdengo];
  const champion = source('champion-zero-overlap', modestSpreads[0], {
    reports: [
      {
        event: 'Champions ranked battles',
        rank: 'Champion Tier',
        sourceUrl: '',
      },
    ],
  });
  const twoShared = source('two-shared', modestSpreads[1], {
    teammates: [member('Pikachu', 'Bold'), member('Gholdengo', 'Bold')],
  });
  assert.deepEqual(
    spreadList(
      catalogSpreadSuggestions(self, [champion, twoShared], 'M-C', 5, shared)
    ),
    [
      ['Modest', modestSpreads[1]],
      ['Modest', modestSpreads[0]],
    ]
  );

  const detailed = member('Pikachu', 'Timid', '31 HP / 31 Atk / 4 Spe', {
    item: 'Light Ball',
    ability: 'Static',
    moves: ['Protect', 'Fake Out'],
  });
  const sparse = member('Pikachu', 'Bold', null, {
    item: 'Choice Scarf',
    ability: 'Lightning Rod',
    moves: ['Thunderbolt'],
  });
  const detailTeams = [
    source('a-sparse', modestSpreads[0], { teammates: [sparse] }),
    source('z-detailed', modestSpreads[1], { teammates: [detailed] }),
  ];
  assert.deepEqual(
    spreadList(
      catalogSpreadSuggestions(self, detailTeams, 'M-C', 5, [detailed])
    ),
    [
      ['Modest', modestSpreads[1]],
      ['Modest', modestSpreads[0]],
    ]
  );
  const matchingRoster = member('Pikachu', null, null, {
    ability: null,
    moves: [],
  });
  const matchingSourceMember = member('Pikachu', 'Hardy', null, {
    ability: null,
    moves: [],
  });
  const comparedSources = [
    source('a-weak-first', modestSpreads[0], {
      teammates: [matchingSourceMember],
    }),
    source('z-best-fit', modestSpreads[0], {
      reports: [
        {
          event: 'Champions ranked battles',
          rank: 'Champion Tier',
          sourceUrl: '',
        },
      ],
      teammates: [matchingSourceMember],
    }),
    source('b-peer', modestSpreads[1], {
      reports: [
        {
          event: 'Champions ranked battles',
          rank: 'Master Ball Rank 1',
          sourceUrl: '',
        },
      ],
      teammates: [matchingSourceMember],
    }),
  ];
  assert.deepEqual(
    spreadList(
      catalogSpreadSuggestions(self, comparedSources, 'M-C', 5, [
        matchingRoster,
      ])
    ),
    [
      ['Modest', modestSpreads[0]],
      ['Modest', modestSpreads[1]],
    ]
  );
});

test('result evidence outranks pair frequency when team fit is equal', () => {
  const champion = source('z-champion', modestSpreads[0], {
    reports: [
      {
        event: 'Champions ranked battles',
        rank: 'Champion Tier',
        sourceUrl: '',
      },
    ],
  });
  const noResults = Array.from({ length: 4 }, (_, i) =>
    source('a-no-result-' + i, modestSpreads[1])
  );
  assert.deepEqual(
    spreadList(catalogSpreadSuggestions(self, [champion, ...noResults], 'M-C')),
    [
      ['Modest', modestSpreads[0]],
      ['Modest', modestSpreads[1]],
    ]
  );
});

test('one spread uses one best source rather than combining fit and credentials', () => {
  const pikachu = member('Pikachu', null, null, {
    ability: null,
    moves: [],
  });
  const championReport = [
    {
      event: 'Champions ranked battles',
      rank: 'Champion Tier',
      sourceUrl: '',
    },
  ];
  const splitSources = [
    source('a-split-champion', modestSpreads[0], {
      reports: championReport,
    }),
    source('z-split-match', modestSpreads[0], {
      teammates: [
        member('Pikachu', 'Hardy', null, { ability: null, moves: [] }),
      ],
    }),
    source('b-peer-champion-match', modestSpreads[1], {
      reports: championReport,
      teammates: [
        member('Pikachu', 'Hardy', null, { ability: null, moves: [] }),
      ],
    }),
  ];
  assert.deepEqual(
    spreadList(
      catalogSpreadSuggestions(self, splitSources, 'M-C', 5, [pikachu])
    ),
    [
      ['Modest', modestSpreads[1]],
      ['Modest', modestSpreads[0]],
    ]
  );
});

test('roster-specific ordering does not contaminate the shared catalog cache', () => {
  const pikachu = member('Pikachu', null);
  const gholdengo = member('Gholdengo', null);
  const catalog = [
    source('pikachu-source', modestSpreads[0], { teammates: [pikachu] }),
    source('gholdengo-source', modestSpreads[1], { teammates: [gholdengo] }),
  ];
  const forPikachu = () =>
    catalogSpreadSuggestions(self, catalog, 'M-C', 5, [pikachu]).map(
      ({ spread }) => spread
    );
  const forGholdengo = catalogSpreadSuggestions(self, catalog, 'M-C', 5, [
    gholdengo,
  ]).map(({ spread }) => spread);
  const firstPikachu = forPikachu();
  assert.deepEqual(firstPikachu, [modestSpreads[0], modestSpreads[1]]);
  assert.deepEqual(forGholdengo, [modestSpreads[1], modestSpreads[0]]);
  assert.deepEqual(forPikachu(), firstPikachu);
  assert.equal(catalogSpreadSuggestions(self, catalog, 'M-C', 5, []).length, 2);
});

test('current and total observations break ties before source date and ID', () => {
  const catalog = [
    source('b-total-rich', modestSpreads[0], { publishedAt: '2026-01-01' }),
    ...Array.from({ length: 3 }, (_, i) =>
      source('old-total-rich-' + i, modestSpreads[0], { regulation: 'M-B' })
    ),
    source('c-current-rich-1', modestSpreads[1], {
      publishedAt: '2025-01-01',
    }),
    source('c-current-rich-2', modestSpreads[1], {
      publishedAt: '2025-01-01',
    }),
    source('a-total-poor', modestSpreads[2], { publishedAt: '2027-01-01' }),
    source('old-total-poor', modestSpreads[2], { regulation: 'M-B' }),
  ];
  const results = catalogSpreadSuggestions(self, catalog, 'M-C');
  assert.deepEqual(
    results.map(({ spread, currentCount, totalCount }) => ({
      spread,
      currentCount,
      totalCount,
    })),
    [
      { spread: modestSpreads[1], currentCount: 2, totalCount: 2 },
      { spread: modestSpreads[0], currentCount: 1, totalCount: 4 },
      { spread: modestSpreads[2], currentCount: 1, totalCount: 2 },
    ]
  );
});

test('catalog spreads aggregate current-regulation observations for the selected nature', () => {
  const catalog = [
    team('cur-1', 'M-C', [
      { ...raichu, spread: '18 HP / 25 Def / 23 Spe', nature: 'Timid' },
    ]),
    team('cur-2', 'M-C', [
      { ...raichu, spread: '18 HP / 25 Def / 23 Spe', nature: 'Timid' },
    ]),
    team('old-1', 'M-B', [
      { ...raichu, spread: '4 HP / 30 Atk / 32 Spe', nature: 'Adamant' },
    ]),
    team('old-2', 'M-B', [
      { ...raichu, spread: '4 HP / 30 Atk / 32 Spe', nature: 'Adamant' },
    ]),
    team('old-3', 'M-B', [
      { ...raichu, spread: '4 HP / 30 Atk / 32 Spe', nature: 'Adamant' },
    ]),
    team('other-form', 'M-C', [
      {
        ...raichu,
        pokemon: 'Pikachu',
        item: null,
        nature: 'Timid',
        spread: '32 HP / 32 SpA / 2 Spe',
      },
    ]),
    team('incomplete', 'M-C', [
      { ...raichu, spread: '32 HP', nature: 'Timid' },
    ]),
  ];
  const results = catalogSpreadSuggestions(raichu, catalog, 'M-C');
  assert.deepEqual(
    results.map(
      ({ nature, spread, currentCount, totalCount, movedPoints }) => ({
        nature,
        spread,
        currentCount,
        totalCount,
        movedPoints,
      })
    ),
    [
      {
        nature: 'Timid',
        spread: '18 HP / 25 Def / 23 Spe',
        currentCount: 2,
        totalCount: 2,
        movedPoints: 0,
      },
    ]
  );
  assert.equal(typeof results[0].speed, 'number');
  assert.deepEqual(
    catalogSpreadSuggestions(
      { ...raichu, pokemon: 'Missingno' },
      catalog,
      'M-C'
    ),
    []
  );
});

test('own spreads keep the original nature and spread even when already used', () => {
  const original = originalSpreadSuggestion(raichu, raichu);
  assert.deepEqual(original, {
    spread: '18 HP / 25 Def / 23 Spe',
    nature: 'Timid',
    source: 'Original team',
    original: true,
    deltas: [],
    movedPoints: 0,
    speed: 190,
  });
  assert.ok(
    originalSpreadSuggestion({ ...raichu, pokemon: 'Raichu-Mega-Y' }, raichu)
  );
});

test('catalog spreads original recommendations require complete standard sets and valid equal forms', () => {
  for (const original of [
    { ...raichu, spread: '32 HP' },
    { ...raichu, spread: '18 HP / 25 Def / 22 Spe' },
    { ...raichu, nature: 'Legacy' },
    { ...raichu, nature: null },
    { ...raichu, item: null },
    { ...raichu, pokemon: 'Raichu-Mega-X' },
    { ...raichu, pokemon: 'Raichu-Mega-Y', item: 'Raichunite X' },
    { ...raichu, pokemon: 'Unknown' },
  ])
    assert.equal(originalSpreadSuggestion(raichu, original), undefined);
  assert.equal(
    originalSpreadSuggestion(raichu, { ...raichu, nature: 'Adamant' }),
    undefined
  );
  for (const nature of [null, 'Legacy'])
    assert.equal(
      originalSpreadSuggestion({ ...raichu, nature }, raichu),
      undefined
    );
  assert.equal(
    originalSpreadSuggestion({ ...raichu, nature: 'tImId' }, raichu).nature,
    'Timid'
  );
  assert.equal(
    originalSpreadSuggestion(
      { ...raichu, pokemon: 'Unknown' },
      { ...raichu, pokemon: 'Unknown' }
    ),
    undefined
  );
  assert.equal(
    originalSpreadSuggestion(
      { ...raichu, pokemon: 'Raichu-Mega-Y', item: 'Raichunite X' },
      raichu
    ),
    undefined
  );
});
