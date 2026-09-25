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
  swapSuggestions,
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
  const vrSource = team('vr-source');
  vrSource.pasteUrl = 'https://www.vrpastes.com/qZK7HCqj';
  const vr = newSavedTeam(vrSource);
  const snapshot = structuredClone(vr.original.members);
  saveTeam(storage, vr);
  const reloaded = readSavedTeams(storage).find((saved) => saved.id === vr.id);
  assert.equal(reloaded.original.pasteUrl, vrSource.pasteUrl);
  assert.equal(reloaded.sources[0].pasteUrl, vrSource.pasteUrl);
  assert.deepEqual(reloaded.original.members, snapshot);
  for (const invalid of [
    'https://fakevrpastes.com/qZK7HCqj',
    'https://user@www.vrpastes.com/qZK7HCqj',
    'https://www.vrpastes.com/qZK7HCqj/extra',
    'https://www.vrpastes.com/qZK7HCqj\n',
  ]) {
    const bad = structuredClone(vr);
    bad.sources[0].pasteUrl = invalid;
    const before = value;
    assert.throws(() => saveTeam(storage, bad), /untouched/);
    assert.equal(value, before);
  }
  first.name = 'Edited';
  saveTeam(storage, first);
  assert.equal(readSavedTeams(storage).length, 3);
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
  assert.deepEqual(
    catalogSuggestions('Rotom-Wash', [otherForm, wash], 'M-C').items,
    [{ value: 'Wash item', currentCount: 1, totalCount: 1 }]
  );
});
test('hybrid suggestions link Mega forms and keep stable fields fixed', () => {
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

  const suggestions = catalogSuggestions(
    draftSpecial,
    [t1, t2, t3, t4],
    'M-B',
    teammates
  );
  assert.equal(suggestions.natures[0].value, 'Modest');

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

test('search filters Pokémon before the six-result limit', () => {
  const source = team('many');
  source.members = [
    member('Ally'),
    ...Array.from({ length: 7 }, (_, index) => member(`Choice${index}`)),
  ];
  assert.equal(
    pokemonSuggestions(
      [member('Ally')],
      [source],
      'M-C',
      undefined,
      undefined,
      'Choice6'
    )[0].pokemon,
    'Choice6'
  );
});

test('searched swaps rank each eligible slot and preview its winning catalog set', () => {
  const draft = [
    member('One', 'A'),
    member('Two', 'B'),
    member('Three'),
    member('Four'),
    member('Five'),
    member('Six'),
  ];
  const one = team('one');
  one.members = [member('One', 'A'), member('Target', 'Set One')];
  const two = team('two');
  two.members = [member('Two', 'B'), member('Target', 'Set Two')];
  const both = team('both');
  both.members = [
    member('One', 'Other'),
    member('Two', 'Other'),
    member('Target', 'Set Both'),
  ];
  const results = swapSuggestions(draft, [one, two, both], 'M-C', 'Target');
  assert.deepEqual(
    results.map(({ slot }) => slot),
    [2, 3, 4, 5, 1, 0]
  );
  assert.equal(results[0].member.item, 'Set Both');
  assert.equal(results[0].source.id, 'both');
  assert.equal(results[4].member.item, 'Set One');
  assert.equal(results[5].member.item, 'Set Two');
  assert.deepEqual(
    swapSuggestions(draft, [one, two, both], 'M-C').map(
      ({ pokemon }) => pokemon
    ),
    ['Target']
  );
});

test('swaps require teammate overlap and preserve the two-Mega limit by slot', () => {
  const source = team('mega-swap');
  source.members = [member('Ally'), member('Froslass-Mega')];
  const draft = [
    member('Dragonite-Mega'),
    member('Garchomp-Mega-Z'),
    member('Ally'),
    member('Other'),
    member('Another'),
    member('Last'),
  ];
  assert.deepEqual(
    swapSuggestions(draft, [source], 'M-C', 'Froslass-Mega').map(
      ({ slot }) => slot
    ),
    [0, 1]
  );
  assert.deepEqual(swapSuggestions(draft, [source], 'M-C', 'Missing'), []);
  assert.deepEqual(
    swapSuggestions(
      draft,
      [{ ...source, members: [member('Froslass-Mega')] }],
      'M-C',
      'Froslass-Mega'
    ),
    []
  );
});
