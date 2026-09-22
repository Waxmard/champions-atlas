import assert from 'node:assert/strict';
import test from 'node:test';
import {
  differences,
  exportPaste,
  isMegaSpecies,
  newCustomTeam,
  newSavedTeam,
  pokemonSuggestions,
  readSavedTeams,
  saveTeam,
  setText,
  storageKey,
  catalogSuggestions,
  resolveSavedTeamId,
  speciesMember,
} from '../src/lib/workbench.ts';
import {
  championsSpreadTotal,
  formatChampionsSpread,
  NATURES,
  natureEffect,
  parseChampionsSpread,
  parseCustomPaste,
  parsePaste,
  parseSetBlock,
} from '../src/lib/paste.ts';

const member = (pokemon, item = 'Item') => ({
  pokemon,
  item,
  ability: 'Ability',
  nature: 'Adamant',
  spread: '32 HP',
  moves: ['Protect', 'Fake Out'],
});
const team = (id = 'original', regulation = 'M-B') => ({
  id,
  name: id,
  regulation,
  publishedAt: '2026-09-01',
  paste: null,
  pasteUrl: 'https://pokepast.es/0000000000000000',
  members: Array.from({ length: 6 }, (_, i) => member(`Pokemon${i}`)),
  reports: [],
});

test('saved team preserves original and raw export fields', () => {
  const source = team();
  source.members[0].set =
    'Nickname (Pokemon0) @ Item\nAbility: Ability\nIVs: 0 Atk\nEVs: 32 HP\nAdamant Nature\n- Protect\n- Fake Out';
  const saved = newSavedTeam(source);
  saved.changeSlot = 5;
  const snapshot = JSON.stringify(saved.original);
  saved.members[5] = member('Replacement');
  assert.equal(JSON.stringify(saved.original), snapshot);
  assert.equal(saved.members[5].pokemon, 'Replacement');
  const paste = exportPaste(saved.members);
  assert.match(paste, /Nickname \(Pokemon0\)/);
  assert.doesNotMatch(paste, /IVs:/);
  assert.equal(parsePaste(paste).length, 6);
});

test('diff aligns species despite reordered slots, and distinguishes missing information from known changes', () => {
  const before = team().members;
  const after = structuredClone(before).reverse();
  assert.deepEqual(differences(before, after), []);
  after[0].item = null;
  after[1].moves = ['Protect'];
  after[2] = member('Replacement');
  const rows = differences(before, after);
  assert.ok(
    rows.some((row) => row.pokemon === 'Pokemon5' && row.after === 'Unknown')
  );
  assert.ok(
    rows.some((row) => row.field === 'Moves' && row.after === 'Protect')
  );
  assert.equal(rows.filter((row) => row.field === 'Pokémon').length, 2);
});

test('saved teams round-trip, preserve other teams, and never overwrite corrupt or unavailable storage', () => {
  let value = null;
  const storage = {
    getItem: (key) => {
      assert.equal(key, storageKey);
      return value;
    },
    setItem: (_, next) => {
      value = next;
    },
  };
  const first = newSavedTeam(team());
  saveTeam(storage, first);
  const second = newSavedTeam(team('second'));
  saveTeam(storage, second);
  first.name = 'Edited';
  saveTeam(storage, first);
  assert.equal(readSavedTeams(storage).length, 2);
  assert.equal(
    readSavedTeams(storage).find((team) => team.id === first.id).name,
    'Edited'
  );
  const original = value;
  assert.throws(
    () =>
      saveTeam(
        {
          ...storage,
          setItem: () => {
            throw new Error('Quota exceeded');
          },
        },
        first
      ),
    /Quota/
  );
  assert.equal(value, original);
  value = '{broken';
  assert.throws(() => saveTeam(storage, first));
  assert.equal(value, '{broken');
  value = JSON.stringify([{ ...first, members: [] }]);
  assert.throws(() => readSavedTeams(storage), /untouched/);
});

test('old saved teams load without retaining obsolete locks or losing original and edits', () => {
  const saved = newSavedTeam(team());
  saved.members[0].set =
    'Pokemon0 @ Item\nAbility: Ability\nLevel: 50\nTera Type: Fire\nIVs: 0 Atk\nEVs: 32 HP\nAdamant Nature\n- Protect';
  saved.original.members[0].set = saved.members[0].set;
  saved.original.paste = saved.members[0].set;
  saved.original.cachedAt = '2026-09-01T00:00:00Z';
  saved.members[0].flavor = 'keep-member';
  saved.sources[0].note = 'keep-source';
  const { changeSlot, ...old } = saved;
  assert.equal(changeSlot, null);
  const raw = JSON.stringify([
    {
      ...old,
      targetRegulation: 'M-C',
      locks: [{ pokemon: 'Pokemon0', item: '', ability: '', moves: [] }],
    },
  ]);
  assert.deepEqual(readSavedTeams({ getItem: () => raw }), [saved]);
  const loaded = readSavedTeams({ getItem: () => raw })[0];
  assert.equal(loaded.original.paste, saved.original.paste);
  assert.equal(loaded.original.cachedAt, '2026-09-01T00:00:00Z');
  assert.equal(loaded.members[0].flavor, 'keep-member');
  assert.equal(loaded.sources[0].note, 'keep-source');
  assert.match(loaded.original.paste, /Level: 50/);
  for (const text of [
    setText(loaded.members[0]),
    exportPaste(loaded.members),
    exportPaste(loaded.original.members),
  ]) {
    assert.doesNotMatch(text, /IVs:|Level:|Tera Type:/);
    assert.match(text, /Ability: Ability/);
    assert.match(text, /EVs: 32 HP/);
    assert.match(text, /- Protect/);
  }
  let stored = raw;
  const storage = {
    getItem: (key) => (key === storageKey ? stored : null),
    setItem: (_, next) => {
      stored = next;
    },
  };
  saveTeam(storage, loaded);
  const reloaded = readSavedTeams(storage)[0];
  assert.equal(reloaded.changeSlot, null);
  assert.equal(reloaded.original.cachedAt, '2026-09-01T00:00:00Z');
  assert.equal(reloaded.members[0].flavor, 'keep-member');
  assert.equal(reloaded.sources[0].note, 'keep-source');
  assert.equal(reloaded.original.paste, saved.original.paste);
  assert.throws(
    () =>
      readSavedTeams({
        getItem: () => JSON.stringify([{ ...saved, changeSlot: 6 }]),
      }),
    /untouched/
  );
});

test('saveTeam rejects empty-normalizing and duplicate species without touching storage', () => {
  let value = null;
  const storage = {
    getItem: (key) => {
      assert.equal(key, storageKey);
      return value;
    },
    setItem: (_, next) => {
      value = next;
    },
  };
  saveTeam(storage, newSavedTeam(team()));
  const original = value;

  const empty = newSavedTeam(team('empty'));
  empty.members[0].pokemon = '!!!';
  assert.throws(() => saveTeam(storage, empty), /untouched/);
  assert.equal(value, original);

  const duplicate = newSavedTeam(team('duplicate'));
  duplicate.members[0].pokemon = 'Pikachu';
  duplicate.members[1].pokemon = 'pikachu';
  assert.throws(() => saveTeam(storage, duplicate), /untouched/);
  assert.equal(value, original);
});

test('readSavedTeams rejects oversized and duplicate-ID storage', () => {
  const many = JSON.stringify(
    Array.from({ length: 51 }, (_, i) => newSavedTeam(team(`team${i}`)))
  );
  assert.throws(() => readSavedTeams({ getItem: () => many }), /untouched/);

  const a = newSavedTeam(team());
  const b = newSavedTeam(team());
  b.id = a.id;
  assert.throws(
    () => readSavedTeams({ getItem: () => JSON.stringify([a, b]) }),
    /Duplicate saved team IDs/
  );
});

test('custom teams validate paste and preserve independent snapshots and empty source metadata through storage', () => {
  const paste = Array.from(
    { length: 6 },
    (_, i) =>
      `Pokemon${i} @ Item\nAbility: Ability\nEVs: 32 HP\nAdamant Nature\n- One\n- Two\n- Three\n- Four`
  ).join('\n\n');
  const custom = newCustomTeam('  Mine  ', 'M-C', paste);
  assert.throws(() => newCustomTeam('  ', 'M-C', paste), /name/);
  assert.throws(
    () => newCustomTeam('Mine', 'M-C', paste.replace('EVs: 32 HP\n', '')),
    /missing EVs/
  );
  assert.equal(custom.name, 'Mine');
  assert.equal(custom.original.name, 'Mine');
  assert.equal(custom.original.id, custom.id);
  assert.equal(custom.original.pasteUrl, '');
  assert.deepEqual(custom.sources, []);
  assert.equal(parseCustomPaste(custom.original.paste).length, 6);
  custom.members[0].item = 'Changed';
  assert.equal(custom.original.members[0].item, 'Item');
  let raw = null;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => (raw = value),
  };
  saveTeam(storage, custom);
  assert.deepEqual(readSavedTeams(storage), [custom]);
  const invalid = { ...custom, sources: [{ name: 'No URL', pasteUrl: '' }] };
  assert.throws(() => saveTeam(storage, invalid), /untouched/);
});

test('generateUUID produces valid RFC4122 v4 UUID', () => {
  const team = newSavedTeam({
    id: 'test',
    name: 'Test',
    regulation: 'M-C',
    pasteUrl: '',
    members: [],
    paste: null,
  });
  assert.match(
    team.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test('generateUUID falls back when crypto.randomUUID is undefined (insecure context)', () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', {
    value: undefined,
    configurable: true,
  });
  try {
    assert.equal(typeof crypto.randomUUID, 'undefined');
    const team = newSavedTeam({
      id: 'test',
      name: 'Test',
      regulation: 'M-C',
      pasteUrl: '',
      members: [],
      paste: null,
    });
    assert.match(
      team.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
    else Reflect.deleteProperty(crypto, 'randomUUID');
    assert.equal(typeof crypto.randomUUID, 'function');
  }
});

test('parseSetBlock extracts a set', () => {
  const raw = `Incineroar @ Sitrus Berry
Ability: Intimidate
Careful Nature
EVs: 252 HP / 4 Atk / 156 Def / 76 SpD / 20 Spe
- Fake Out
- Parting Shot
- Knock Off
- Flare Blitz`;
  const parsed = parseSetBlock(raw);
  assert.equal(parsed.pokemon, 'Incineroar');
  assert.equal(parsed.item, 'Sitrus Berry');
  assert.equal(parsed.ability, 'Intimidate');
  assert.equal(parsed.nature, 'Careful');
  assert.equal(parsed.moves.length, 4);
});

test('strict Champions spreads parse, format, and total six ordered stats', () => {
  const spread = parseChampionsSpread(
    '2 Spe / 32 SpA / 0 Def / 32 HP / 0 SpD / 0 Atk'
  );
  assert.deepEqual(spread, {
    HP: 32,
    Atk: 0,
    Def: 0,
    SpA: 32,
    SpD: 0,
    Spe: 2,
  });
  assert.equal(formatChampionsSpread(spread), '32 HP / 32 SpA / 2 Spe');
  for (const total of [64, 65, 66, 67])
    assert.equal(championsSpreadTotal({ ...spread, HP: total - 34 }), total);
  for (const invalid of [
    '33 HP',
    '-1 HP',
    '1.5 HP',
    '1 HP / 2 HP',
    '1 Special',
  ])
    assert.equal(parseChampionsSpread(invalid), null);
});

test('catalogSuggestions ranks current usage, merges normalized values, and isolates forms', () => {
  const incineroar = (item, ability = 'Intimidate', moves = ['Fake Out']) => ({
    ...member('Incineroar', item),
    ability,
    moves,
  });
  const current = team('current', 'M-C');
  current.members = [
    incineroar('Alpha'),
    incineroar('Beta'),
    incineroar('sitrus-berry', 'Blaze', ['Flare Blitz']),
    incineroar('---', '---', ['---']),
    incineroar('Gamma', '---', ['---']),
  ];
  current.members[3].spread = '---';
  current.members[4].spread = '---';
  const historical = team('historical', 'M-B');
  historical.members = [
    incineroar('Beta'),
    incineroar('Beta'),
    incineroar('Sitrus Berry', 'Intimidate', ['Fake Out']),
  ];
  const otherForm = team('other-form', 'M-C');
  otherForm.members = [incineroar('Heat item')];
  otherForm.members[0].pokemon = 'Rotom-Heat';
  const wash = team('wash', 'M-C');
  wash.members = [incineroar('Wash item')];
  wash.members[0].pokemon = 'Rotom-Wash';

  const suggestions = catalogSuggestions(
    'Incineroar',
    [current, historical, otherForm, wash],
    'M-C'
  );
  assert.deepEqual(suggestions.items, [
    { value: 'Beta', currentCount: 1, totalCount: 3 },
    { value: 'sitrus-berry', currentCount: 1, totalCount: 2 },
    { value: 'Alpha', currentCount: 1, totalCount: 1 },
    { value: 'Gamma', currentCount: 1, totalCount: 1 },
  ]);
  assert.deepEqual(suggestions.abilities, [
    { value: 'Intimidate', currentCount: 2, totalCount: 5 },
    { value: 'Blaze', currentCount: 1, totalCount: 1 },
  ]);
  assert.deepEqual(suggestions.moves, [
    { value: 'Fake Out', currentCount: 2, totalCount: 5 },
    { value: 'Flare Blitz', currentCount: 1, totalCount: 1 },
  ]);
  assert.deepEqual(suggestions.spreads, [
    {
      value: '32 HP',
      currentCount: 3,
      totalCount: 6,
      nature: null,
      score: 0,
      size: 'unknown',
      moved: 0,
      deltas: [],
      speed: 80,
    },
  ]);
  assert.deepEqual(
    catalogSuggestions('Rotom-Wash', [otherForm, wash], 'M-C').items,
    [{ value: 'Wash item', currentCount: 1, totalCount: 1 }]
  );
});
test('hybrid suggestions link Mega forms, keep stable fields fixed, and pair nature with EV spread', () => {
  const physicalDnite = (
    spread = '2 HP / 32 Atk / 32 Spe',
    nature = 'Adamant'
  ) => ({
    pokemon: 'Dragonite',
    item: 'Life Orb',
    ability: 'Inner Focus',
    moves: ['Dragon Claw', 'Extreme Speed', 'Superpower', 'Protect'],
    nature,
    spread,
  });
  const megaDnite = (spread = '2 HP / 32 SpA / 32 Spe', nature = 'Modest') => ({
    pokemon: 'Dragonite-Mega',
    item: 'Dragoninite',
    ability: 'Multiscale',
    moves: ['Dragon Pulse', 'Heat Wave', 'Extreme Speed', 'Protect'],
    nature,
    spread,
  });

  const t1 = team('t1', 'M-B');
  t1.members = [megaDnite(), member('Sneasler'), member('Kingambit')];
  const t2 = team('t2', 'M-B');
  t2.members = [
    megaDnite('1 HP / 1 Def / 32 SpA / 32 Spe'),
    member('Sneasler'),
  ];
  const t3 = team('t3', 'M-B');
  t3.members = [physicalDnite(), member('Other')];
  const t4 = team('t4', 'M-B');
  t4.members = [physicalDnite('31 HP / 32 Atk / 3 Spe'), member('Other')];

  const draftSpecial = {
    pokemon: 'Dragonite',
    item: 'Dragoninite',
    ability: 'Multiscale',
    moves: ['Dragon Pulse', 'Heat Wave', 'Extreme Speed', 'Protect'],
    nature: 'Modest',
    spread: '',
  };
  const teammates = [member('Sneasler')];

  // Suggesting spreads for Mega Dragonite with teammates:
  const suggestions = catalogSuggestions(
    draftSpecial,
    [t1, t2, t3, t4],
    'M-B',
    teammates
  );
  assert.ok(
    suggestions.spreads.some(
      (s) => s.value === '2 HP / 32 SpA / 32 Spe' && s.nature === 'Modest'
    )
  );
  assert.ok(
    suggestions.spreads.some(
      (s) =>
        s.value === '1 HP / 1 Def / 32 SpA / 32 Spe' && s.nature === 'Modest'
    )
  );
  assert.equal(suggestions.spreads[0].nature, 'Modest');
  assert.equal(suggestions.spreads[1].nature, 'Modest');

  // Suggesting item for special Dragonite:
  const draftNoItem = {
    ...draftSpecial,
    item: '',
    spread: '2 HP / 32 SpA / 32 Spe',
  };
  const itemSuggestions = catalogSuggestions(
    draftNoItem,
    [t1, t2, t3, t4],
    'M-B',
    teammates
  );
  assert.equal(itemSuggestions.items[0].value, 'Dragoninite');

  // Suggesting Pokemon replacement for slot:
  assert.ok(suggestions.pokemon.length > 0);
  assert.equal(suggestions.pokemon[0].pokemon, 'Kingambit');
  assert.equal(suggestions.pokemon[0].member.pokemon, 'Kingambit');
  assert.ok(suggestions.pokemon[0].member.moves.length > 0);
});

test('resolveSavedTeamId resolves requested, active, and fallback ids', () => {
  const teams = [team('t1'), team('t2')];
  assert.equal(resolveSavedTeamId(teams, 't2', 't1'), 't2');
  assert.equal(resolveSavedTeamId(teams, null, 't2'), 't2');
  assert.equal(resolveSavedTeamId(teams, 'nonexistent', 't2'), 't2');
  assert.equal(resolveSavedTeamId(teams, null, 'nonexistent'), 't1');
  assert.equal(resolveSavedTeamId(teams, null, null), 't1');
  assert.equal(resolveSavedTeamId([], 't1', 't1'), null);
});

test('speciesMember picks the set from the team sharing the most teammates', () => {
  const x = team('x');
  x.members = [
    member('Incineroar', 'Alpha'),
    member('Sneasler'),
    member('Kingambit'),
  ];
  const y = team('y');
  y.members = [member('Incineroar', 'Beta'), member('Sneasler')];
  assert.equal(
    speciesMember(
      'Incineroar',
      [member('Sneasler'), member('Kingambit')],
      [x, y],
      'M-C'
    )?.item,
    'Alpha'
  );
});

test('speciesMember set depends on which teammate is swapped out', () => {
  const x = team('x');
  x.members = [member('Incineroar', 'Alpha'), member('Sneasler')];
  const y = team('y');
  y.members = [member('Incineroar', 'Beta'), member('Rillaboom')];
  // Swapping out Sneasler leaves Rillaboom, so the Rillaboom team (Beta) wins.
  assert.equal(
    speciesMember('Incineroar', [member('Rillaboom')], [x, y], 'M-C')?.item,
    'Beta'
  );
  // Swapping out Rillaboom leaves Sneasler, so the Sneasler team (Alpha) wins.
  assert.equal(
    speciesMember('Incineroar', [member('Sneasler')], [x, y], 'M-C')?.item,
    'Alpha'
  );
});

test('every nature maps to its standard raised and lowered stat', () => {
  const expected = {
    Adamant: 'Atk/SpA',
    Bashful: 'neutral',
    Bold: 'Def/Atk',
    Brave: 'Atk/Spe',
    Calm: 'SpD/Atk',
    Careful: 'SpD/SpA',
    Docile: 'neutral',
    Gentle: 'SpD/Def',
    Hardy: 'neutral',
    Hasty: 'Spe/Def',
    Impish: 'Def/SpA',
    Jolly: 'Spe/SpA',
    Lax: 'Def/SpD',
    Lonely: 'Atk/Def',
    Mild: 'SpA/Def',
    Modest: 'SpA/Atk',
    Naive: 'Spe/SpD',
    Naughty: 'Atk/SpD',
    Quiet: 'SpA/Spe',
    Quirky: 'neutral',
    Rash: 'SpA/SpD',
    Relaxed: 'Def/Spe',
    Sassy: 'SpD/Spe',
    Serious: 'neutral',
    Timid: 'Spe/Atk',
  };
  assert.deepEqual(
    NATURES.map((nature) => {
      const effect = natureEffect(nature);
      return effect ? `${effect.raised}/${effect.lowered}` : 'neutral';
    }),
    NATURES.map((nature) => expected[nature])
  );
  assert.equal(natureEffect('modest')?.raised, 'SpA');
  assert.equal(natureEffect(null), null);
  assert.equal(natureEffect(''), null);
});

test('the role tiebreak never outranks a sourced result', () => {
  const tags = {
    teams: { role: { archetype: 'balance', speedMode: 'faster', roles: {} } },
  };
  const teammates = [member('Sneasler')];

  // Poor evidence, but the team fills a job the draft lacks via Tailwind.
  const fillsRole = team('role', 'M-C');
  fillsRole.members = [
    member('Sneasler'),
    { ...member('Incineroar'), moves: ['Tailwind', 'Fake Out'] },
  ];

  // Better evidence, no role fill beyond what the teammate already covers.
  const proven = team('evidence', 'M-C');
  proven.members = [member('Sneasler'), member('Rillaboom')];
  proven.reports = [{ event: 'Worlds', rank: 'Champion', sourceUrl: '' }];

  const ranked = pokemonSuggestions(
    teammates,
    [fillsRole, proven],
    'M-C',
    undefined,
    tags
  );
  assert.deepEqual(
    ranked.map((suggestion) => suggestion.pokemon),
    ['Rillaboom', 'Incineroar']
  );

  // With evidence equal, the role fill wins again.
  const unproven = team('evidence-tied', 'M-C');
  unproven.members = [member('Sneasler'), member('Rillaboom')];
  const tied = pokemonSuggestions(
    teammates,
    [fillsRole, unproven],
    'M-C',
    undefined,
    tags
  );
  assert.equal(tied[0].member.pokemon, 'Incineroar');

  // The empty stub generated by --if-missing must be completely inert.
  const stub = { teams: {} };
  const withStub = pokemonSuggestions(
    teammates,
    [fillsRole, unproven],
    'M-C',
    undefined,
    stub
  );
  assert.equal(withStub[0].member.pokemon, 'Rillaboom');
  assert.deepEqual(
    withStub.map((suggestion) => [
      suggestion.role,
      suggestion.archetype,
      suggestion.roleFill,
    ]),
    withStub.map(() => [null, null, false])
  );
});

test('isMegaSpecies matches named Mega forms and not similar species', () => {
  assert.equal(isMegaSpecies('Meganium'), false);
  assert.equal(isMegaSpecies('Garchomp-Mega-Z'), true);
  assert.equal(isMegaSpecies('Froslass-Mega'), true);
});

test('pokemonSuggestions stops offering a third Mega', () => {
  const megaTeam = team('mega', 'M-C');
  megaTeam.members = [
    member('Dragonite-Mega'),
    member('Garchomp-Mega-Z'),
    member('Froslass-Mega'),
    member('Incineroar'),
    member('Sneasler'),
    member('Kingambit'),
  ];
  const twoMegas = pokemonSuggestions(
    [member('Dragonite-Mega'), member('Garchomp-Mega-Z')],
    [megaTeam],
    'M-C'
  );
  assert.ok(twoMegas.length > 0);
  assert.ok(twoMegas.every((suggestion) => !isMegaSpecies(suggestion.pokemon)));

  const oneMega = pokemonSuggestions(
    [member('Dragonite-Mega')],
    [megaTeam],
    'M-C'
  );
  assert.ok(
    oneMega.some((suggestion) => suggestion.pokemon === 'Froslass-Mega')
  );
});

test('catalogSuggestions classifies each spread by how far it moves from the draft', () => {
  const target = (spread) => ({
    pokemon: 'Kingambit',
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread,
  });
  const near = team('near', 'M-C');
  near.members = [
    { ...member('Kingambit'), spread: '20 HP / 28 Spe' },
    { ...member('Kingambit'), spread: '24 HP / 15 Atk / 14 SpD / 13 Spe' },
  ];
  const options = catalogSuggestions(
    target('16 HP / 32 Spe'),
    [near],
    'M-C'
  ).spreads;
  assert.deepEqual(
    options.map((option) => option.size),
    ['small', 'large']
  );
  const [smallOption, largeOption] = options;
  assert.equal(smallOption.moved, 8);
  assert.deepEqual(smallOption.deltas, [
    { stat: 'HP', from: 16, to: 20, delta: 4 },
    { stat: 'Spe', from: 32, to: 28, delta: -4 },
  ]);
  assert.equal(largeOption.moved, 56);

  // A blank or zero-total draft is not comparable, so nothing is scored as a change.
  for (const spread of ['', '0 HP']) {
    const sizes = catalogSuggestions(target(spread), [near], 'M-C').spreads.map(
      (option) => option.size
    );
    assert.deepEqual(sizes, ['unknown', 'unknown']);
  }
});
