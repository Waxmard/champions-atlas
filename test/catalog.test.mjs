import assert from 'node:assert/strict';
import test from 'node:test';
import {
  browsePokemon,
  getMemberOptions,
  matchesTeam,
  readFilters,
  teamHeading,
  writeFilters,
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

test('team headings compact possessive team names and keep structured results', () => {
  const cases = [
    [
      "maGicaUra's Ranked Season M-4 1st Place Team",
      [['Ranked Season M-4', '1st']],
      { title: 'maGicaUra', context: 'Ranked Season M-4 · 1st' },
    ],
    [
      "online's Ranked Season M-6 Top 8 Team",
      [['Ranked Season M-6', '6th']],
      { title: 'online', context: 'Ranked Season M-6 · 6th' },
    ],
    [
      "Atalanta's Ranked Season M-4 68th & 100th Place Team",
      [['Ranked Season M-4', '68th & 100th']],
      { title: 'Atalanta', context: 'Ranked Season M-4 · 68th & 100th' },
    ],
    [
      "JPTK-VGC's 2027 Global Challenge I Top 4 Team",
      [
        ['2027 Global Challenge I (Seniors)', '3rd'],
        ['YouTube video', ''],
      ],
      {
        title: 'JPTK-VGC',
        context: '2027 Global Challenge I (Seniors) · 3rd',
      },
    ],
    [
      "noahampalaya's 2027 Global Challenge I (Seniors) Top 8 Team",
      [['2027 Global Challenge I (Seniors)', '7th']],
      {
        title: 'noahampalaya',
        context: '2027 Global Challenge I (Seniors) · 7th',
      },
    ],
    [
      "CloverBells' Raichu-Y Frosslass Team",
      [['Video', '']],
      { title: 'CloverBells', context: 'Raichu-Y Frosslass' },
    ],
    [
      "Nirinbo's Battle Cruise Top 8 Team",
      [['TeamAqua ASD Battle Cruise', 'Top 8']],
      { title: 'Nirinbo', context: 'Battle Cruise · Top 8' },
    ],
    [
      "Trimoxis' Gdańsk Regional 2027 Top 64 Team",
      [
        ['Gdańsk Regional 2027', '41st'],
        ['Gdańsk Regional 2027', ''],
      ],
      { title: 'Trimoxis', context: 'Gdańsk Regional 2027 · 41st' },
    ],
    [
      "javivarela56's Gdańsk Regional 2027 Champion Team",
      [
        ['Gdańsk Regional 2027', 'Champion'],
        ['Gdańsk Regional 2027', ''],
      ],
      { title: 'javivarela56', context: 'Gdańsk Regional 2027 · Champion' },
    ],
    [
      "Matteo B.'s Nice Regional 2027 Champion (Seniors) Team",
      [
        ['Nice Regional 2027', 'Champion'],
        ['Nice Regional 2027', ''],
      ],
      {
        title: 'Matteo B.',
        context: 'Nice Regional 2027 (Seniors) · Champion',
      },
    ],
    [
      "Chompy's Recreation of Andrew Cavanah's Louisville Regional 2027 Top 64 Team",
      [
        ['Video', ''],
        ['YouTube video', ''],
      ],
      {
        title: 'Chompy',
        context:
          "Recreation of Andrew Cavanah's Louisville Regional 2027 · Top 64",
      },
    ],
    [
      "Wowyang's TeraSquare #97 Runner Up Team",
      [['', '']],
      { title: 'Wowyang', context: 'TeraSquare #97 · Runner Up' },
    ],
    [
      "O'Brien's Cup Team",
      [['Cup', '1st']],
      { title: "O'Brien", context: 'Cup · 1st' },
    ],
    [
      "Player's Cup 1st Place Team V1",
      [['Cup', '1st']],
      { title: 'Player V1', context: 'Cup · 1st' },
    ],
    [
      "Player's Cup 3rd Place Team (Annihilape)",
      [['Cup', '  3rd  ']],
      { title: 'Player (Annihilape)', context: 'Cup · 3rd' },
    ],
    [
      'Mary Jane’s Cup champion place tEaM v12 (Annihilape)',
      [['Cup', 'Winner']],
      { title: 'Mary Jane v12 (Annihilape)', context: 'Cup · Winner' },
    ],
    [
      "Player's Cup Champion Team",
      [['Cup', '1st']],
      { title: 'Player', context: 'Cup · 1st' },
    ],
    [
      "Player's Cup Runner Up Team",
      [['Cup', '2nd']],
      { title: 'Player', context: 'Cup · 2nd' },
    ],
    [
      "Player's Cup Runner-Up Team",
      [['Cup', '2nd']],
      { title: 'Player', context: 'Cup · 2nd' },
    ],
    [
      "Player's Cup 2nd Team",
      [['Cup', '2nd']],
      { title: 'Player', context: 'Cup · 2nd' },
    ],
    [
      "Player's Cup 4th Team",
      [['Cup', '4th']],
      { title: 'Player', context: 'Cup · 4th' },
    ],
    [
      "Player's Cup 11th Team",
      [['Cup', '11th']],
      { title: 'Player', context: 'Cup · 11th' },
    ],
    [
      "Player's Round (+) [A] Team",
      [['Round (+) [A]', '']],
      { title: 'Player', context: 'Round (+) [A]' },
    ],
    [
      "Player Cup Partner's Cup Team",
      [['Cup', '']],
      { title: 'Player Cup Partner', context: 'Cup' },
    ],
    [
      "Player's Cup Finalist Team",
      [['Cup', '1st']],
      { title: 'Player', context: 'Cup Finalist' },
    ],
    [
      "Player's Cup Top Eight Team",
      [['Cup', '1st']],
      { title: 'Player', context: 'Cup Top Eight' },
    ],
    [
      "Player's Cup 1st and 2nd Place Team",
      [['Cup', '1st']],
      { title: 'Player', context: 'Cup 1st and 2nd Place' },
    ],
    [
      "Player's Cup 1st Place Team",
      [],
      { title: 'Player', context: 'Cup · 1st' },
    ],
    [
      "Player's Cup 1st Place Team",
      [['cup', '1st']],
      { title: 'Player', context: 'Cup · 1st' },
    ],
  ];
  for (const [name, reports, expected] of cases) {
    const source = {
      name,
      creator: 'Jude Lee',
      reports: reports.map(([event, rank]) => ({ event, rank, sourceUrl: '' })),
    };
    const original = structuredClone(source);
    assert.deepEqual(teamHeading(name, source), expected, name);
    assert.deepEqual(source, original);
  }
});

test('team headings leave renamed, custom, and unrecognized names unchanged', () => {
  const name = "Player's Cup 1st Place Team";
  const source = {
    name,
    reports: [{ event: 'Cup', rank: '1st', sourceUrl: '' }],
  };
  assert.deepEqual(teamHeading(name, null), { title: name, context: '' });
  assert.deepEqual(teamHeading('My custom team', null), {
    title: 'My custom team',
    context: '',
  });
  assert.deepEqual(teamHeading('My renamed team', source), {
    title: 'My renamed team',
    context: '',
  });

  for (const unrecognized of [
    "Player's Cup 1st Place Team Extra",
    "Player's Cup Team V",
    "Player's Cup Team V1 V2",
    "Player's Cup Team (A) (B)",
    "Player's Cup Team (A) V1",
    "'s Cup Team",
    '’s Cup Team',
    ' Cup Team',
    '  Cup Team',
    'Two Word Name Cup Team',
    "ayoitsbenji's WCG VGC Challenge Champion Team (Recreation of MichaelderBeste's VR October Challenge Champion Team)",
    'Player  Team',
    'Player   Team',
  ]) {
    assert.deepEqual(
      teamHeading(unrecognized, { name: unrecognized, reports: [] }),
      { title: unrecognized, context: '' },
      unrecognized
    );
  }
});

test('team headings reject conflicting ranks and ignore blank or unmatched reports', () => {
  const name = "Player's Cup Champion Team";
  const report = { event: 'Cup', rank: '1st', sourceUrl: '' };
  const compacted = { title: 'Player', context: 'Cup · 1st' };
  for (const reports of [
    [report, { ...report, rank: ' 1st ', sourceUrl: 'other' }],
    [{ ...report, event: 'Another event' }, report],
    [report, { ...report, rank: '' }],
    [report, { ...report, event: 'Cup Champion' }],
  ]) {
    const source = { name, reports };
    const original = structuredClone(source);
    assert.deepEqual(teamHeading(name, source), compacted);
    assert.deepEqual(source, original);
  }
  assert.deepEqual(
    teamHeading(name, { name, reports: [report, { ...report, rank: '2nd' }] }),
    { title: name, context: '' }
  );
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
    true
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

test('filter URLs preserve unrelated parameters and reject malformed constraints', () => {
  const filters = [
    {
      pokemon: 'Incineroar',
      item: 'Safety Goggles',
      ability: 'Intimidate',
      move: 'Fake Out',
    },
  ];
  const params = writeFilters(
    new URLSearchParams('ref=shared&regulation=M-B&page=4'),
    filters
  );
  assert.deepEqual(readFilters(params), filters);
  assert.equal(params.get('ref'), 'shared');
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

test('Browse identities merge Mega aliases without merging functional forms', () => {
  const filter = (pokemon, item = '') => ({
    pokemon,
    item,
    ability: '',
    move: '',
  });
  for (const pokemon of ['Mawile', 'Mawile-Mega']) {
    const fixture = {
      members: [member(pokemon, null), member('Pikachu', 'Mawilite')],
    };
    assert.ok(matchesTeam(fixture, [filter('Mawile')]));
    assert.equal(matchesTeam(fixture, [filter('Mawile', 'Mawilite')]), false);
    fixture.members[0].item = 'Mawilite';
    assert.ok(matchesTeam(fixture, [filter('Mawile', 'Mawilite')]));
  }
  for (const form of ['X', 'Y']) {
    const fixture = {
      members: [member('Charizard-Mega-' + form, 'Charizardite ' + form)],
    };
    assert.ok(matchesTeam(fixture, [filter('Charizard')]));
    assert.ok(
      matchesTeam(fixture, [filter('Charizard', 'Charizardite ' + form)])
    );
    assert.equal(
      matchesTeam(fixture, [
        filter('Charizard', form === 'X' ? 'Charizardite Y' : 'Charizardite X'),
      ]),
      false
    );
  }
  for (const pokemon of [
    'Floette-Eternal',
    'Floette-Eternal-Mega',
    'Floette-Mega',
  ]) {
    const fixture = { members: [member(pokemon, 'Floettite')] };
    assert.ok(matchesTeam(fixture, [filter('Floette-Eternal', 'Floettite')]));
    assert.equal(matchesTeam(fixture, [filter('Floette')]), false);
  }
  assert.equal(
    matchesTeam({ members: [member('Floette', 'Floettite')] }, [
      filter('Floette-Eternal'),
    ]),
    false
  );
  assert.equal(
    matchesTeam({ members: [member('Rotom-Wash', null)] }, [filter('Rotom')]),
    false
  );
  assert.equal(
    matchesTeam({ members: [member('Rotom', null)] }, [filter('Rotom-Wash')]),
    false
  );
  const garchompMembers = [
    member('Garchomp', null),
    member('Garchomp-Mega', 'Garchompite'),
    member('Garchomp-Mega-Z', 'Garchompite Z'),
  ];
  for (const pokemon of ['Garchomp', 'Garchomp-Mega', 'Garchomp-Mega-Z'])
    assert.equal(browsePokemon(pokemon), 'Garchomp');
  assert.ok(
    matchesTeam({ members: garchompMembers }, [
      filter('Garchomp', 'Garchompite'),
      filter('Garchomp', 'Garchompite Z'),
    ])
  );
  assert.equal(
    matchesTeam({ members: garchompMembers.slice(0, 2) }, [
      filter('Garchomp', 'Garchompite Z'),
    ]),
    false
  );
  assert.equal(
    matchesTeam({ members: [garchompMembers[0], garchompMembers[2]] }, [
      filter('Garchomp', 'Garchompite'),
    ]),
    false
  );
  assert.equal(browsePokemon('Porygon-Z'), 'Porygon-Z');
  assert.equal(browsePokemon('Charizard-mEgA-y'), 'Charizard');
  assert.equal(browsePokemon('FLOETTE eternal MEGA'), 'Floette-Eternal');
  assert.equal(browsePokemon('Rotom-Wash'), 'Rotom-Wash');
});

test('member options aggregate observed constraints across merged Browse forms', () => {
  for (const names of [
    ['Mawile', 'Mawile-Mega'],
    ['Charizard', 'Charizard-Mega-X', 'Charizard-Mega-Y'],
    ['Floette-Eternal', 'Floette-Eternal-Mega', 'Floette-Mega'],
  ]) {
    const fixture = [
      {
        members: names.map((pokemon, i) => ({
          ...member(pokemon, ['Leftovers', 'Stone X', 'Stone Y'][i]),
          ability: ['Base ability', 'Mega ability X', 'Mega ability Y'][i],
          moves: [['Protect'], ['Moonblast'], ['Psychic']][i],
        })),
      },
    ];
    const expected = {
      item: ['Leftovers', 'Stone X', 'Stone Y'].slice(0, names.length).sort(),
      ability: ['Base ability', 'Mega ability X', 'Mega ability Y']
        .slice(0, names.length)
        .sort(),
      move: ['Protect', 'Moonblast', 'Psychic'].slice(0, names.length).sort(),
    };
    for (const [field, values] of Object.entries(expected)) {
      for (const name of names)
        assert.deepEqual(getMemberOptions(fixture, name, field), values);
    }
  }
});

test('Garchomp item options rank observed stones before frequency-ranked items', () => {
  const garchomp = [
    ...Array(3).fill(member('Garchomp', 'Life Orb')),
    ...Array(2).fill(member('Garchomp-Mega', 'Choice Scarf')),
    member('Garchomp-Mega', 'Leftovers'),
    member('Garchomp-Mega-Z', 'Sitrus Berry'),
    member('Garchomp-Mega', 'Garchompite'),
    ...Array(2).fill(member('Garchomp-Mega-Z', 'Garchompite Z')),
    member('Garchomp', null),
    member('Garchomp', ''),
    member('Garchomp'),
  ].map((entry, i) => ({
    ...entry,
    ability: ['Static', 'Pressure', 'Static'][i % 3],
    moves: [['Protect'], ['Thunderbolt'], ['Protect']][i % 3],
  }));
  const fixture = garchomp.map((entry) => ({ members: [entry] }));
  const expectedItems = [
    'Garchompite Z',
    'Garchompite',
    'Life Orb',
    'Choice Scarf',
    'Leftovers',
    'Sitrus Berry',
  ];
  for (const pokemon of ['Garchomp', 'Garchomp-Mega', 'Garchomp-Mega-Z'])
    assert.deepEqual(getMemberOptions(fixture, pokemon, 'item'), expectedItems);
  assert.deepEqual(getMemberOptions(fixture, 'Garchomp', 'ability'), [
    'Pressure',
    'Static',
  ]);
  assert.deepEqual(getMemberOptions(fixture, 'Garchomp', 'move'), [
    'Protect',
    'Thunderbolt',
  ]);
  assert.deepEqual(getMemberOptions([], 'Garchomp', 'item'), []);

  const otherCatalog = [{ members: [member('Garchomp', 'Sitrus Berry')] }];
  assert.deepEqual(getMemberOptions(otherCatalog, 'Garchomp-Mega-Z', 'item'), [
    'Sitrus Berry',
  ]);
  assert.deepEqual(
    getMemberOptions(fixture, 'Garchomp', 'item'),
    expectedItems
  );

  const nonApplicableStone = [
    ...Array(3).fill({ members: [member('Pikachu', 'Life Orb')] }),
    { members: [member('Pikachu', 'Garchompite')] },
    { members: [member('Pikachu', null)] },
    { members: [member('Pikachu', '')] },
    { members: [{ ...member('Pikachu'), item: undefined }] },
  ];
  assert.deepEqual(getMemberOptions(nonApplicableStone, 'Pikachu', 'item'), [
    'Life Orb',
    'Garchompite',
  ]);
});

test('legacy Mega URLs restore and write canonical labels without changing constraints', () => {
  for (const [legacy, canonical, stone] of [
    ['Mawile-Mega', 'Mawile', 'Mawilite'],
    ['Charizard-Mega-X', 'Charizard', 'Charizardite X'],
    ['Garchomp-Mega', 'Garchomp', 'Garchompite'],
    ['Garchomp-Mega-Z', 'Garchomp', 'Garchompite Z'],
    ['Floette-Eternal-Mega', 'Floette-Eternal', 'Floettite'],
    ['Floette-Mega', 'Floette-Eternal', 'Floettite'],
  ]) {
    for (const item of ['', stone]) {
      const tuple = [legacy, item, 'Published ability', 'Protect'];
      const params = new URLSearchParams({ member: JSON.stringify(tuple) });
      const expected = {
        pokemon: canonical,
        item,
        ability: tuple[2],
        move: tuple[3],
      };
      assert.deepEqual(readFilters(params), [expected]);
      const written = writeFilters(new URLSearchParams('page=4&ref=shared'), [
        { ...expected, pokemon: legacy },
      ]);
      assert.deepEqual(JSON.parse(written.get('member')), [
        canonical,
        ...tuple.slice(1),
      ]);
      assert.equal(written.has('page'), false);
      assert.equal(written.get('ref'), 'shared');
    }
  }
  for (const names of [
    ['Garchomp', 'Garchomp-Mega-Z'],
    ['Mawile', 'Mawile-Mega'],
    ['Charizard-Mega-X', 'Charizard-Mega-Y'],
    ['Floette-Eternal', 'Floette-Mega'],
    ['Floette-Eternal-Mega', 'Floette-Mega'],
  ]) {
    const params = new URLSearchParams();
    for (const pokemon of names)
      params.append(
        'member',
        JSON.stringify([pokemon, 'Distinct ' + pokemon, '', ''])
      );
    assert.throws(() => readFilters(params), {
      message: 'Invalid or duplicate Pokémon filter.',
    });
  }
});
