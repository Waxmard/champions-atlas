import assert from 'node:assert/strict';
import test from 'node:test';
import { isMegaSpecies } from '../src/lib/catalog.ts';
import { knownName } from '../src/lib/canonical-names.ts';
import { resolveBattleForm } from '../src/lib/battle-forms.ts';
import {
  memberValidationError,
  parseTeamPaste,
} from '../src/lib/member-validation.ts';
import { catalogSuggestions } from '../src/lib/workbench.ts';
import {
  pokemonSuggestions,
  swapIdeas,
  swapSuggestions,
  swapTargets,
} from '../src/lib/swap-suggestions.ts';

const SPREAD = '32 HP / 32 Atk / 1 Def / 1 SpD';
const set = (pokemon, overrides = {}) => ({
  pokemon,
  item: 'Leftovers',
  ability: 'Intimidate',
  nature: 'Adamant',
  spread: SPREAD,
  moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'],
  ...overrides,
});
const team = (id, members, overrides = {}) => ({
  id,
  name: id,
  regulation: 'M-C',
  publishedAt: '2026-09-01',
  paste: null,
  pasteUrl: '',
  reports: [],
  sheetIds: [],
  creator: '',
  replicaCode: null,
  replicaStatus: '',
  pasteNotes: null,
  members,
  ...overrides,
});
const core = () => [set('Sneasler'), set('Kingambit'), set('Gholdengo')];

test('knownName resolves real names and rejects changed unknown ones', () => {
  assert.equal(knownName('item', 'Leftovers'), 'Leftovers');
  assert.equal(knownName('item', 'leftovers'), 'Leftovers');
  assert.equal(knownName('move', 'fakeout'), 'Fake Out');
  assert.equal(knownName('ability', 'grassysurge'), 'Grassy Surge');
  for (const [kind, value] of [
    ['item', 'No Item Info'],
    ['ability', 'Poison Tourch'],
    ['move', 'Last Respect'],
  ])
    assert.equal(knownName(kind, value), undefined);

  const accepted = set('Incineroar', { spread: null });
  const check = (next) =>
    memberValidationError(next, accepted, [], 'structured');
  assert.deepEqual(check({ ...accepted, item: 'asdf' }), {
    field: 'item',
    message: 'Choose a known item.',
  });
  assert.deepEqual(check({ ...accepted, ability: 'asdf' }), {
    field: 'ability',
    message: 'Choose a known ability.',
  });
  assert.deepEqual(check({ ...accepted, moves: ['Protect', 'asdf'] }), {
    field: 'moves',
    message: 'Choose a known move.',
  });
  assert.deepEqual(check({ ...accepted, pokemon: 'asdf' }), {
    field: 'pokemon',
    message: 'Choose a known Pokémon.',
  });
  assert.equal(check({ ...accepted, item: 'leftovers' }), null);
  assert.equal(check({ ...accepted, moves: ['fakeout'] }), null);

  for (const [field, value] of [
    ['item', 'No Item Info'],
    ['ability', 'Poison Tourch'],
  ]) {
    const legacy = { ...accepted, [field]: value };
    assert.equal(
      memberValidationError(legacy, legacy, [], 'structured'),
      null,
      `${value} stays valid when unchanged`
    );
  }
  const legacyMove = { ...accepted, moves: ['Last Respect'] };
  assert.equal(
    memberValidationError(legacyMove, legacyMove, [], 'structured'),
    null
  );
});

test('parseTeamPaste rejects unknown names on new members only', () => {
  const six = (first) =>
    [first, 'Rillaboom', 'Sneasler', 'Kingambit', 'Gholdengo', 'Gardevoir']
      .map((header) => [header, 'Ability: Intimidate', '- Fake Out'].join('\n'))
      .join('\n\n');
  assert.throws(
    () => parseTeamPaste(six('Incineroar @ asdf'), []),
    /Choose a known item/
  );

  const legacy = set('Incineroar', {
    item: 'No Item Info',
    ability: null,
    spread: null,
    moves: ['Fake Out'],
  });
  const [parsed] = parseTeamPaste(six('Incineroar @ No Item Info'), [legacy]);
  assert.equal(parsed.item, 'No Item Info');
  assert.equal(parsed.pokemon, 'Incineroar');
});

test('catalogSuggestions hides items a teammate already holds', () => {
  const rotom = set('Rotom-Wash', {
    item: 'Leftovers',
    ability: 'Levitate',
    nature: 'Modest',
    moves: ['Hydro Pump'],
  });
  const teammate = set('Incineroar', { item: 'Leftovers' });
  const source = team('source', [
    set('Rotom-Wash', { item: 'Leftovers', ability: 'Levitate' }),
    set('Rotom-Wash', { item: 'Leftovers', ability: 'Levitate' }),
  ]);
  const original = { ...rotom, item: 'Life Orb' };
  const suggestions = catalogSuggestions(
    rotom,
    [source],
    'M-C',
    [teammate],
    undefined,
    '',
    'Rotom-Wash',
    original
  );
  assert.ok(!suggestions.items.some((entry) => entry.value === 'Leftovers'));
  assert.ok(
    suggestions.items.some(
      (entry) => entry.value === 'Life Orb' && entry.original
    )
  );
});

test('catalogSuggestions ranks current usage, merges normalized values, and isolates forms', () => {
  const incineroar = (item, ability = 'Intimidate', moves = ['Fake Out']) => ({
    ...set('Incineroar', { item, ability, moves }),
  });
  const current = team('current', [
    incineroar('Alpha'),
    incineroar('Beta'),
    incineroar('sitrus-berry', 'Blaze', ['Flare Blitz']),
    incineroar('---', '---', ['---']),
    incineroar('Gamma', '---', ['---']),
  ]);
  current.members[3].spread = '---';
  current.members[4].spread = '---';
  const historical = team(
    'historical',
    [
      incineroar('Beta'),
      incineroar('Beta'),
      incineroar('Sitrus Berry', 'Intimidate', ['Fake Out']),
    ],
    { regulation: 'M-B' }
  );
  const otherForm = team('other-form', [incineroar('Heat item')]);
  otherForm.members[0].pokemon = 'Rotom-Heat';
  const wash = team('wash', [incineroar('Wash item')]);
  wash.members[0].pokemon = 'Rotom-Wash';

  const suggestions = catalogSuggestions(
    'Incineroar',
    [current, historical, otherForm, wash],
    'M-C'
  );
  assert.deepEqual(suggestions.items.slice(0, 4), [
    { value: 'Beta', currentCount: 1, totalCount: 3 },
    { value: 'sitrus-berry', currentCount: 1, totalCount: 2 },
    { value: 'Alpha', currentCount: 1, totalCount: 1 },
    { value: 'Gamma', currentCount: 1, totalCount: 1 },
  ]);
  assert.ok(
    suggestions.items
      .slice(4)
      .every((option) => !option.totalCount && !option.currentCount)
  );
  assert.deepEqual(suggestions.abilities.slice(0, 2), [
    { value: 'Intimidate', currentCount: 2, totalCount: 5 },
    { value: 'Blaze', currentCount: 1, totalCount: 1 },
  ]);
  assert.ok(
    suggestions.abilities
      .slice(2)
      .every((option) => !option.totalCount && !option.currentCount)
  );
  assert.deepEqual(suggestions.moves.slice(0, 2), [
    { value: 'Fake Out', currentCount: 2, totalCount: 5 },
    { value: 'Flare Blitz', currentCount: 1, totalCount: 1 },
  ]);
  assert.ok(
    suggestions.moves
      .slice(2)
      .every((option) => !option.totalCount && !option.currentCount)
  );
  const washItems = catalogSuggestions(
    'Rotom-Wash',
    [otherForm, wash],
    'M-C'
  ).items;
  assert.deepEqual(washItems.slice(0, 1), [
    { value: 'Wash item', currentCount: 1, totalCount: 1 },
  ]);
  assert.ok(
    washItems
      .slice(1)
      .every((option) => !option.totalCount && !option.currentCount)
  );
});

test('suggested sets resolve a Mega stone onto its own form', () => {
  const source = team('mega', [
    set('Sneasler'),
    set('Froslass', {
      item: 'Froslassite',
      ability: 'Snow Cloak',
      moves: ['Shadow Ball'],
    }),
    set('Froslass-Mega', {
      item: 'Froslassite',
      ability: 'Snow Cloak',
      moves: ['Shadow Ball'],
    }),
  ]);
  const [suggestion] = pokemonSuggestions([set('Sneasler')], [source], 'M-C');
  assert.equal(suggestion.pokemon, 'Froslass');
  assert.equal(suggestion.member.item, 'Froslassite');
  assert.equal(suggestion.consensus, true);
  assert.equal(suggestion.consensusSupport, 2);
  assert.equal(resolveBattleForm(suggestion.member).pokemon, 'Froslass-Mega');
});

test('a team fitting more teammates outranks a more common form', () => {
  const teammates = [
    set('Sneasler'),
    set('Kingambit'),
    set('Gholdengo'),
    set('Incineroar'),
    set('Rillaboom'),
  ];
  const wide = team('wide', [
    ...teammates,
    set('Dragonite', { item: 'Life Orb' }),
  ]);
  const narrow = [0, 1, 2].map((_, index) =>
    team(`narrow-${index}`, [
      set('Sneasler'),
      set('Kingambit'),
      set('Gholdengo'),
      set('Gardevoir', { item: 'Life Orb' }),
    ])
  );
  const suggestions = pokemonSuggestions(teammates, [wide, ...narrow], 'M-C');
  assert.equal(suggestions[0].pokemon, 'Dragonite');
  assert.equal(suggestions[0].sharedTeammates, 5);
  assert.equal(suggestions[0].support, 1);
  assert.equal(suggestions[1].pokemon, 'Gardevoir');
  assert.equal(suggestions[1].support, 3);
});

test('support count outranks matching details', () => {
  const teammates = [set('Sneasler'), set('Kingambit'), set('Gholdengo')];
  const detailed = team('detailed', [
    ...teammates,
    set('Froslass', { item: 'Life Orb' }),
  ]);
  const loose = (id) =>
    team(id, [
      set('Sneasler', { item: 'Life Orb' }),
      set('Kingambit', { item: 'Life Orb' }),
      set('Gholdengo', { item: 'Life Orb' }),
      set('Gardevoir', { item: 'Life Orb' }),
    ]);
  const [first, second] = pokemonSuggestions(
    teammates,
    [detailed, loose('loose-a'), loose('loose-b')],
    'M-C'
  );
  assert.equal(first.pokemon, 'Gardevoir');
  assert.equal(first.support, 2);
  assert.equal(first.sharedTeammates, 3);
  assert.equal(second.pokemon, 'Froslass');
  assert.ok(second.matchingDetails > first.matchingDetails);
});

test('teams sharing one complete set produce a consensus suggestion', () => {
  const rillaboom = set('Rillaboom', {
    item: 'Miracle Seed',
    ability: 'Grassy Surge',
    nature: 'Adamant',
    moves: ['Grassy Glide', 'Wood Hammer', 'Fake Out', 'U-turn'],
  });
  const teams = [
    team('a', [...core(), rillaboom]),
    team('b', [...core(), structuredClone(rillaboom)]),
  ];
  const [suggestion] = pokemonSuggestions(core(), teams, 'M-C');
  assert.equal(suggestion.pokemon, 'Rillaboom');
  assert.equal(suggestion.consensus, true);
  assert.equal(suggestion.consensusSupport, 2);
  assert.equal(suggestion.support, 2);
  assert.equal(suggestion.sharedTeammates, 3);
  assert.deepEqual(suggestion.member, rillaboom);
});

test('differing sets assemble the modal item, ability, spread, and moves', () => {
  const rilla = (overrides) =>
    set('Rillaboom', {
      ability: 'Grassy Surge',
      item: 'Miracle Seed',
      nature: 'Adamant',
      moves: ['Grassy Glide', 'Wood Hammer', 'Fake Out', 'U-turn'],
      ...overrides,
    });
  const teams = [
    team('a', [...core(), rilla({})]),
    team('b', [
      ...core(),
      rilla({ moves: ['Grassy Glide', 'Wood Hammer', 'Knock Off', 'Protect'] }),
    ]),
    team('c', [...core(), rilla({ ability: 'Unburden', nature: 'Jolly' })]),
    team('d', [
      ...core(),
      rilla({ item: 'Life Orb', ability: 'Grassy Surge' }),
    ]),
    team('e', [
      ...core(),
      rilla({ item: 'Life Orb', ability: 'Grassy Surge' }),
    ]),
  ];
  const [suggestion] = pokemonSuggestions(core(), teams, 'M-C');
  assert.equal(suggestion.consensus, false);
  assert.equal(suggestion.consensusSupport, 0);
  assert.equal(suggestion.member.item, 'Miracle Seed');
  assert.equal(suggestion.member.ability, 'Grassy Surge');
  assert.equal(suggestion.member.nature, 'Adamant');
  assert.equal(suggestion.member.spread, SPREAD);
  assert.deepEqual(suggestion.member.moves, [
    'Grassy Glide',
    'Wood Hammer',
    'Fake Out',
    'U-turn',
  ]);
});

test('assembly steps past an item another teammate already holds', () => {
  const teammates = [...core(), set('Incineroar', { item: 'Miracle Seed' })];
  const rillaboom = set('Rillaboom', {
    ability: 'Grassy Surge',
    item: 'Miracle Seed',
    moves: ['Grassy Glide'],
  });
  const teams = [
    team('a', [...teammates, rillaboom]),
    team('b', [...teammates, structuredClone(rillaboom)]),
    team('c', [
      ...teammates,
      set('Rillaboom', {
        ability: 'Grassy Surge',
        item: 'Life Orb',
        moves: ['Wood Hammer'],
      }),
    ]),
  ];
  const [suggestion] = pokemonSuggestions(teammates, teams, 'M-C');
  assert.equal(suggestion.member.item, 'Life Orb');
  assert.equal(suggestion.consensus, false);

  const held = [...teammates, set('Pikachu', { item: 'Life Orb' })];
  assert.deepEqual(pokemonSuggestions(held, teams, 'M-C'), []);
});

test('pokemonSuggestions stops offering a third Mega', () => {
  const megaTeam = team('mega', [
    set('Dragonite-Mega', { item: 'Dragoninite', ability: 'Multiscale' }),
    set('Garchomp-Mega-Z', { item: 'Garchompite Z', ability: 'Rough Skin' }),
    set('Froslass-Mega', { item: 'Froslassite', ability: 'Snow Cloak' }),
    ...core(),
  ]);
  const twoMegas = pokemonSuggestions(
    [
      set('Dragonite-Mega', { item: 'Dragoninite', ability: 'Multiscale' }),
      set('Garchomp-Mega-Z', { item: 'Garchompite Z', ability: 'Rough Skin' }),
    ],
    [megaTeam],
    'M-C'
  );
  assert.ok(twoMegas.length > 0);
  assert.ok(twoMegas.every((suggestion) => !isMegaSpecies(suggestion.pokemon)));

  const oneMega = pokemonSuggestions(
    [set('Dragonite-Mega', { item: 'Dragoninite', ability: 'Multiscale' })],
    [megaTeam],
    'M-C'
  );
  assert.ok(
    oneMega.some((suggestion) => suggestion.pokemon === 'Froslass-Mega')
  );
});

test('search filters Pokémon before the six-result limit', () => {
  const roster = [
    'Aerodactyl',
    'Archaludon',
    'Dragonite',
    'Froslass',
    'Gardevoir',
    'Gholdengo',
    'Incineroar',
    'Tyranitar',
  ];
  const source = team('many', [
    set('Pikachu'),
    ...roster.map((name) => set(name, { item: 'Life Orb' })),
  ]);
  assert.equal(
    pokemonSuggestions(
      [set('Pikachu')],
      [source],
      'M-C',
      undefined,
      undefined,
      'Tyranitar'
    )[0].pokemon,
    'Tyranitar'
  );
});

test('specific search matches the resolved form and keeps every slot', () => {
  const draft = [
    set('Incineroar'),
    set('Rillaboom'),
    set('Sneasler'),
    set('Kingambit'),
    set('Gholdengo'),
    set('Dragonite'),
  ];
  const one = team('one', [
    set('Incineroar'),
    set('Garchomp', { item: 'Life Orb' }),
  ]);
  const two = team('two', [
    set('Rillaboom'),
    set('Garchomp', { item: 'Sitrus Berry' }),
  ]);
  const both = team('both', [
    set('Incineroar', { item: 'Leftovers' }),
    set('Rillaboom', { item: 'Leftovers' }),
    set('Garchomp', { item: 'Rocky Helmet' }),
  ]);
  const results = swapSuggestions(draft, [one, two, both], 'M-C', 'Garchomp');
  assert.deepEqual(
    results.map(({ slot }) => slot).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5]
  );
  assert.equal(results[0].slot, 2);
  assert.equal(results[0].sharedTeammates, 2);
  assert.equal(results[0].member.item, 'Rocky Helmet');
  assert.equal(results[3].slot, 5);
  assert.equal(results[4].sharedTeammates, 1);

  assert.deepEqual(swapSuggestions(draft, [one], 'M-C', 'Missing'), []);
  assert.deepEqual(
    swapSuggestions(
      draft,
      [
        team('mega-only', [
          set('Froslass', { item: 'Froslassite' }),
          set('Sneasler'),
        ]),
      ],
      'M-C',
      'Froslass'
    ),
    []
  );
  assert.equal(
    swapSuggestions(
      draft,
      [
        team('mega-only', [
          set('Froslass', { item: 'Froslassite' }),
          set('Sneasler'),
        ]),
      ],
      'M-C',
      'Froslass-Mega'
    ).length,
    5
  );
});

test('swap ideas need three shared teammates and keep one row per slot', () => {
  const draft = [
    set('Incineroar'),
    set('Rillaboom'),
    set('Sneasler'),
    set('Kingambit'),
    set('Gholdengo'),
    set('Dragonite'),
  ];
  const strong = team('strong', [
    set('Incineroar', { item: 'Life Orb' }),
    set('Rillaboom', { item: 'Life Orb' }),
    set('Sneasler', { item: 'Life Orb' }),
    set('Garchomp', { item: 'Life Orb' }),
  ]);
  const weak = team('weak', [
    set('Gholdengo', { item: 'Life Orb' }),
    set('Gardevoir'),
  ]);
  const ideas = swapIdeas(draft, [strong, weak], 'M-C');
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.sharedTeammates >= 3));
  assert.equal(new Set(ideas.map(({ slot }) => slot)).size, ideas.length);
  assert.ok(ideas.length <= 4);
  assert.deepEqual(
    ideas.map(({ pokemon }) => pokemon),
    ['Garchomp']
  );

  const crowded = [0, 1, 2, 3, 4].map((index) =>
    team(`crowded-${index}`, [
      set('Incineroar', { item: 'Life Orb' }),
      set('Rillaboom', { item: 'Life Orb' }),
      set('Sneasler', { item: 'Life Orb' }),
      set(`Pokemon${index}`),
    ])
  );
  assert.equal(swapIdeas(draft, crowded, 'M-C').length, 0);
});

test('unknown source names are skipped instead of suggested', () => {
  const source = team('typos', [
    ...core(),
    set('Gardevoir', { item: 'No Item Info' }),
    set('Aerodactyl', { moves: ['Last Respect'] }),
    set('Tyranitar', { item: 'Life Orb' }),
  ]);
  const suggestions = pokemonSuggestions(core(), [source], 'M-C');
  assert.deepEqual(
    suggestions.map(({ pokemon }) => pokemon),
    ['Tyranitar']
  );
  for (const { member } of suggestions) {
    assert.ok(!member.item || knownName('item', member.item));
    assert.ok(!member.ability || knownName('ability', member.ability));
    for (const move of member.moves) assert.ok(knownName('move', move));
    assert.equal(resolveBattleForm(member).error, null);
  }
});

test('the role tiebreak never outranks a sourced result', () => {
  const tags = {
    teams: { role: { archetype: 'balance', speedMode: 'faster', roles: {} } },
  };
  const teammates = [set('Sneasler')];
  const fillsRole = team('role', [
    set('Sneasler'),
    set('Incineroar', { item: 'Life Orb', moves: ['Tailwind', 'Fake Out'] }),
  ]);
  const proven = team(
    'evidence',
    [
      set('Sneasler'),
      set('Rillaboom', { item: 'Life Orb', ability: 'Grassy Surge' }),
    ],
    { reports: [{ event: 'Worlds', rank: 'Champion', sourceUrl: '' }] }
  );
  const ranked = pokemonSuggestions(
    teammates,
    [fillsRole, proven],
    'M-C',
    undefined,
    tags
  );
  assert.deepEqual(
    ranked.map((s) => s.pokemon),
    ['Rillaboom', 'Incineroar']
  );

  const unproven = team('evidence-tied', [
    set('Sneasler'),
    set('Rillaboom', { item: 'Life Orb', ability: 'Grassy Surge' }),
  ]);
  const tied = pokemonSuggestions(
    teammates,
    [fillsRole, unproven],
    'M-C',
    undefined,
    tags
  );
  assert.equal(tied[0].member.pokemon, 'Incineroar');
  assert.equal(tied[0].roleFill, true);
  assert.equal(tied[0].role, null);

  const withStub = pokemonSuggestions(
    teammates,
    [fillsRole, unproven],
    'M-C',
    undefined,
    { teams: {} }
  );
  assert.equal(withStub[0].member.pokemon, 'Rillaboom');
  assert.deepEqual(
    withStub.map((s) => [s.role, s.archetype, s.roleFill]),
    withStub.map(() => [null, null, false])
  );
});

test('swap targets list current-regulation forms the team is missing', () => {
  const teams = [
    team('current', [
      set('Sneasler'),
      set('Gardevoir'),
      set('Froslass', { item: 'Froslassite' }),
    ]),
    team('old', [set('Aerodactyl'), set('Tyranitar')], { regulation: 'M-B' }),
  ];
  const oneMega = swapTargets(
    [set('Sneasler'), set('Dragonite', { item: 'Dragoninite' })],
    teams,
    'M-C'
  );
  assert.deepEqual(oneMega, ['Froslass-Mega', 'Gardevoir']);

  const twoMegas = swapTargets(
    [
      set('Dragonite', { item: 'Dragoninite' }),
      set('Garchomp', { item: 'Garchompite Z' }),
    ],
    teams,
    'M-C'
  );
  assert.deepEqual(twoMegas, ['Gardevoir', 'Sneasler']);
});

test('only current-regulation teams feed suggestions', () => {
  const s = (p, item, ability, mv) =>
    set(p, { item, ability, ...(mv ? { moves: [mv] } : {}) });
  const control = team(
    'control',
    [
      s('Pikachu', 'Light Ball', 'Static', 'Volt Switch'),
      set('Rotom-Wash', { ability: 'Levitate', moves: ['Hydro Pump'] }),
      s('Archaludon', 'Assault Vest', 'Stamina', 'Electro Shot'),
      s('Incineroar', 'Safety Goggles', 'Intimidate'),
      s('Rillaboom', 'Miracle Seed', 'Grassy Surge', 'Grassy Glide'),
      s('Gholdengo', 'Choice Specs', 'Good as Gold', 'Make It Rain'),
    ],
    { reports: [{ event: 'Ranked', rank: 'Master Ball 1', sourceUrl: '' }] }
  );
  const old = team(
    'old',
    [set('Pikachu'), set('Tyranitar', { item: 'Life Orb' })],
    { regulation: 'M-B' }
  );
  const suggestions = pokemonSuggestions(
    [control.members[0]],
    [control, old],
    'M-C'
  );
  assert.deepEqual(
    suggestions.map(({ pokemon }) => pokemon),
    ['Archaludon', 'Gholdengo', 'Incineroar', 'Rillaboom', 'Rotom-Wash']
  );
  const sources = new Map(control.members.map((e) => [e.pokemon, e]));
  for (const { pokemon, member } of suggestions)
    assert.deepEqual(member, sources.get(pokemon));

  const swapTeam = team('swap', [
    set('Incineroar', { item: 'Life Orb' }),
    set('Gholdengo', { item: 'Life Orb' }),
  ]);
  const draft = [
    ...control.members.slice(0, 5),
    set('Tyranitar', { item: 'Rocky Helmet' }),
  ];
  const swapped = swapSuggestions(draft, [swapTeam], 'M-C', 'Gholdengo');
  assert.equal(swapped[0].slot, 0);
  assert.equal(swapped[0].member.pokemon, 'Gholdengo');
  assert.equal(swapped[0].member.item, 'Life Orb');
  assert.deepEqual(
    swapped.map(({ slot }) => slot),
    [0, 1, 2, 4, 5]
  );
});

test('Favorite teams surface all distinct sets ahead of catalog without averaging and preserve catalog limit', () => {
  const sn = set('Sneasler', { item: 'Focus Sash' });
  const kg = set('Kingambit');
  const teammates = [sn, kg];
  const mvs = ['Protect', 'Tackle', 'Rest', 'Sleep Talk'];
  const favA = {
    id: 'fav-a',
    name: 'Fav Alpha',
    members: [
      sn,
      set('Weavile', { item: 'Choice Band', ability: 'Pressure', moves: mvs }),
    ],
  };
  const favB = {
    id: 'fav-b',
    name: 'Fav Beta',
    members: [
      sn,
      kg,
      set('Weavile', {
        item: 'Clear Amulet',
        ability: 'Pickpocket',
        moves: mvs,
      }),
    ],
  };
  const favZero = {
    id: 'fav-zero',
    name: 'Fav Zero',
    members: [
      set('Pelipper', { item: 'Damp Rock', ability: 'Drizzle', moves: mvs }),
    ],
  };
  const species = ['Gholdengo', 'Incineroar', 'Rillaboom', 'Rotom-Wash'];
  const catTeams = species.map((sp, i) =>
    team(`cat-${i}`, [
      sn,
      set(sp, { item: 'Life Orb', ability: 'Pressure', moves: mvs }),
      set('Weavile', { item: 'Life Orb', ability: 'Pressure', moves: mvs }),
    ])
  );
  const res = pokemonSuggestions(
    teammates,
    catTeams,
    'M-C',
    undefined,
    undefined,
    '',
    { minShared: 1, limit: 3 },
    [favA, favB, favZero]
  );
  assert.equal(res.length, 5);
  assert.deepEqual(
    res.slice(0, 2).map((r) => [r.pokemon, r.favoriteTeamName, r.member.item]),
    [
      ['Weavile', 'Fav Beta', 'Clear Amulet'],
      ['Weavile', 'Fav Alpha', 'Choice Band'],
    ]
  );
  assert.equal(res.filter((r) => !r.favorite).length, 3);

  const queried = pokemonSuggestions(
    teammates,
    catTeams,
    'M-C',
    undefined,
    undefined,
    'pelip',
    { minShared: 1, limit: 3 },
    [favZero]
  );
  assert.equal(queried.length, 1);
  assert.equal(queried[0].pokemon, 'Pelipper');
  assert.equal(queried[0].favorite, true);
  assert.deepEqual(swapTargets(teammates, [], 'M-C', [favZero]), ['Pelipper']);

  const roster = [sn, kg, set('Garchomp', { item: 'Rocky Helmet' })];
  const ideas = swapIdeas(roster, catTeams, 'M-C', undefined, 2, [favA, favB]);
  assert.deepEqual(
    ideas.slice(0, 2).map((x) => x.favoriteTeamName),
    ['Fav Beta', 'Fav Alpha']
  );
  const specific = swapSuggestions(
    roster,
    catTeams,
    'M-C',
    'Pelipper',
    undefined,
    [favZero]
  );
  assert.equal(specific.length, 3);
  assert.ok(
    specific.every((s) => s.favorite && s.favoriteTeamName === 'Fav Zero')
  );
});
