import assert from 'node:assert/strict';
import test from 'node:test';
import { differences, restoreTeam } from '../src/lib/team-history.ts';
import {
  catalogSuggestions,
  originalMemberFor,
  originalSpreadSuggestion,
  newSavedTeam,
  newCustomTeam,
  readSavedTeams,
  saveTeam,
} from '../src/lib/workbench.ts';

const member = (pokemon, extra = {}) => ({
  pokemon,
  item: null,
  ability: null,
  moves: [],
  nature: null,
  spread: null,
  ...extra,
});
const sourceTeam = () => ({
  id: 'catalog-id',
  sheetIds: ['sheet'],
  name: 'Published',
  creator: 'author',
  regulation: 'M-C',
  publishedAt: 'date',
  pasteUrl: '',
  replicaCode: null,
  replicaStatus: '',
  reports: [],
  members: Array.from({ length: 6 }, (_, i) =>
    member('Pokemon' + i, { mystery: i, moves: ['Protect'] })
  ),
  paste: null,
  pasteNotes: null,
});
const memory = () => {
  let raw = null;
  return {
    getItem: () => raw,
    setItem: (_, next) => {
      raw = next;
    },
    raw: () => raw,
  };
};

test('diff is identity aligned, needs a known selected value, and reports no full-set or roster rows', () => {
  const before = Array.from({ length: 6 }, (_, i) => member('Pokemon' + i));
  assert.deepEqual(differences(before, structuredClone(before).reverse()), []);
  const after = structuredClone(before);
  after[0].item = 'Item';
  before[1].item = 'Leftovers';
  after[1].item = 'Choice Band';
  before[2].item = 'Focus Sash';
  after[2].item = null;
  before[3].moves = ['Protect'];
  after[3].moves = [];
  before[4].moves = [];
  after[4].moves = ['Protect'];
  after[5] = member('Replacement');
  assert.deepEqual(differences(before, after), [
    {
      pokemon: 'Pokemon1',
      field: 'Item',
      before: 'Leftovers',
      after: 'Choice Band',
    },
    {
      pokemon: 'Pokemon2',
      field: 'Item',
      before: 'Focus Sash',
      after: 'Unknown',
    },
    {
      pokemon: 'Pokemon3',
      field: 'Moves',
      before: 'Protect',
      after: 'Unknown',
    },
  ]);
  assert.deepEqual(
    differences(
      [{ ...before[0], set: 'Pokemon0 @ Item' }],
      [{ ...structuredClone(before[0]), set: 'Pokemon0 @ Other Item' }]
    ),
    []
  );

  const swap = (beforeMoves, afterMoves) =>
    differences(
      [member('Weavile', { moves: beforeMoves })],
      [member('Weavile', { moves: afterMoves })]
    );
  assert.deepEqual(swap(['Knock Off', 'Taunt'], ['Knock Off', 'Sludge Bomb']), [
    {
      pokemon: 'Weavile',
      field: 'Moves',
      before: 'Taunt',
      after: 'Sludge Bomb',
    },
  ]);
  assert.deepEqual(swap(['Protect'], ['Protect', 'Fake Out']), [
    { pokemon: 'Weavile', field: 'Moves', before: 'None', after: 'Fake Out' },
  ]);
  assert.deepEqual(swap(['Protect', 'Fake Out'], ['Protect']), [
    { pokemon: 'Weavile', field: 'Moves', before: 'Fake Out', after: 'None' },
  ]);
  assert.deepEqual(swap(['Protect', 'Fake Out'], ['fakeout', 'Protect']), []);
  assert.deepEqual(swap([], ['Protect']), []);
});

test('grouped saves retain the stored original and restore without mutation', () => {
  const storage = memory(),
    initial = newSavedTeam(sourceTeam());
  initial.members[0].mystery = 'keep';
  saveTeam(storage, initial);
  let candidate = readSavedTeams(storage)[0];
  candidate.members[0].item = 'Orb';
  let saved = saveTeam(storage, candidate)[0];
  candidate = structuredClone(saved);
  candidate.members[0].ability = 'Ability';
  saved = saveTeam(storage, candidate)[0];
  assert.equal(saved.members[0].item, 'Orb');
  candidate = structuredClone(saved);
  candidate.name = 'Renamed';
  saved = saveTeam(storage, candidate)[0];
  const restored = restoreTeam(saved);
  assert.equal(restored.name, 'Published');
  assert.equal(restored.members[0].item, null);
  assert.equal(restored.original.creator, 'author');
  assert.equal(restored.id, initial.id);
  const roundTrip = saveTeam(storage, restored)[0];
  assert.equal(roundTrip.members[0].item, null);
});

test('no-op, invalid candidate, corrupt storage, and failed writes preserve data', () => {
  const storage = memory(),
    saved = newSavedTeam(sourceTeam());
  saveTeam(storage, saved);
  const raw = storage.raw();
  saveTeam(storage, readSavedTeams(storage)[0]);
  assert.equal(storage.raw(), raw);
  const invalid = structuredClone(readSavedTeams(storage)[0]);
  invalid.members[0].pokemon = '!!!';
  assert.throws(() => saveTeam(storage, invalid));
  assert.equal(storage.raw(), raw);
  assert.throws(() => readSavedTeams({ getItem: () => '{broken' }));
  assert.throws(() =>
    saveTeam({ getItem: () => '{broken', setItem: () => assert.fail() }, saved)
  );
});

test('legacy origin defaults without inventing it and retains custom starting metadata', () => {
  const custom = newCustomTeam(
    'Mine',
    'M-C',
    Array.from(
      { length: 6 },
      (_, i) =>
        'P' +
        i +
        ' @ Item\nAbility: Ability\nEVs: 32 HP\nAdamant Nature\n- One\n- Two\n- Three\n- Four'
    ).join('\n\n')
  );
  assert.equal(custom.origin, 'custom');
  assert.deepEqual(custom.original.sheetIds, []);
  assert.equal(custom.original.replicaCode, null);
  const legacy = newSavedTeam(sourceTeam());
  legacy.history = [
    {
      id: 'legacy',
      savedAt: '2026-10-01T00:00:00.000Z',
      label: 'Edit',
      name: legacy.name,
      members: legacy.members,
    },
  ];
  delete legacy.origin;
  const loaded = readSavedTeams({ getItem: () => JSON.stringify([legacy]) })[0];
  assert.equal(loaded.origin, undefined);
  assert.equal(loaded.history, undefined);
});

test('failed writes preserve caller and storage', () => {
  const storage = memory();
  const initial = saveTeam(storage, newSavedTeam(sourceTeam()))[0];
  const candidate = structuredClone(initial);
  candidate.name = 'Pending';
  const before = structuredClone(candidate),
    raw = storage.raw();
  assert.throws(
    () =>
      saveTeam(
        {
          ...storage,
          setItem: () => {
            throw new Error('Quota');
          },
        },
        candidate
      ),
    /Quota/
  );
  assert.deepEqual(candidate, before);
  assert.equal(storage.raw(), raw);
  const saved = saveTeam(storage, candidate)[0];
  assert.equal(saved.name, 'Pending');
});

test('invalid incoming sources and originals cannot hide behind retained fields', () => {
  const storage = memory(),
    saved = saveTeam(storage, newSavedTeam(sourceTeam()))[0];
  const raw = storage.raw();
  for (const mutate of [
    (t) => {
      t.sources = [{ name: 'Bad', pasteUrl: 'javascript:bad' }];
    },
    (t) => {
      t.original.creator = 42;
    },
    (t) => {
      t.original.members = [];
    },
  ]) {
    const candidate = structuredClone(saved);
    mutate(candidate);
    assert.throws(() => saveTeam(storage, candidate));
    assert.equal(storage.raw(), raw);
  }
});

test('stale metadata copies cannot replace stored provenance', () => {
  const storage = memory(),
    initial = saveTeam(storage, newSavedTeam(sourceTeam()))[0];
  const edited = saveTeam(storage, { ...initial, name: 'Edited' })[0];
  const stale = structuredClone(edited);
  stale.original.creator = 'Wrong';
  stale.origin = 'custom';
  stale.sources = [
    { name: 'Extra', pasteUrl: 'https://pokepast.es/1234567890abcdef' },
  ];
  const metadata = saveTeam(storage, stale)[0];
  assert.deepEqual(metadata.original, initial.original);
  assert.equal(metadata.origin, 'catalog');
  assert.deepEqual(metadata.sources, stale.sources);
  stale.name = 'Next';
  const next = saveTeam(storage, stale)[0];
  assert.deepEqual(next.original, initial.original);
});

test('full detached provenance survives reload and restore returns the original state', () => {
  const source = sourceTeam();
  Object.assign(source, {
    pasteUrl: 'https://pokepast.es/1234567890abcdef',
    replicaCode: 'CODE',
    replicaStatus: 'Verified',
    pasteNotes: 'Notes',
    pasteError: 'Historical warning',
    reports: [
      { event: 'Cup', rank: '1', sourceUrl: 'https://example.com/result' },
    ],
    extraEvidence: { retained: true },
  });
  source.members.forEach((m, i) => {
    m.set = m.pokemon + '\nIVs: ' + i + ' Atk\n- Protect';
  });
  const baseline = structuredClone(source),
    storage = memory();
  saveTeam(storage, newSavedTeam(source));
  source.members = [];
  source.creator = 'Refreshed catalog';
  const loaded = readSavedTeams(storage)[0];
  assert.deepEqual(loaded.original, baseline);
  const candidate = structuredClone(loaded);
  candidate.name = 'Changed';
  candidate.members.reverse();
  candidate.members[0].mystery = { edited: true };
  candidate.members[0].set += '\nShiny: Yes';
  const edited = saveTeam(storage, candidate)[0];
  const restored = saveTeam(storage, restoreTeam(edited))[0];
  assert.deepEqual(restored.members, baseline.members);
  assert.deepEqual(restored.original, baseline);
  assert.deepEqual(restored.sources, loaded.sources);
  assert.equal(restored.id, loaded.id);
});

test('custom and legacy starting originals survive edits without inferred origin', () => {
  const custom = newCustomTeam(
    'Custom',
    'M-C',
    Array.from(
      { length: 6 },
      (_, i) =>
        'Pokemon' +
        i +
        ' @ Item\nAbility: Ability\nEVs: 32 HP\nAdamant Nature\n- One\n- Two\n- Three\n- Four'
    ).join('\n\n')
  );
  const legacy = newSavedTeam(sourceTeam());
  delete legacy.origin;
  delete legacy.original.creator;
  for (const initial of [custom, legacy]) {
    const storage = memory();
    const saved = saveTeam(storage, initial)[0];
    const edited = saveTeam(storage, { ...saved, name: 'First' })[0];
    const second = saveTeam(storage, { ...edited, name: 'Second' })[0];
    assert.equal(second.origin, initial.origin);
    assert.deepEqual(second.original, initial.original);
  }
});

test('original recommendations prefer exact identity then only successful equal battle forms', () => {
  const self = member('Raichu-Mega-Y');
  const resolved = member('Raichu', { item: 'Raichunite Y' });
  const exact = member('raichu mega y', { item: 'Rare item' });
  assert.equal(originalMemberFor(self, [resolved, exact]), exact);
  assert.equal(originalMemberFor(self, [resolved]), resolved);
  assert.equal(originalMemberFor(self, [member('Raichu')]), undefined);
  assert.equal(originalMemberFor(self, [member('Raichu-Mega-X')]), undefined);
  const invalid = member('Raichu-Mega-Y', { item: 'Raichunite X' });
  assert.equal(originalMemberFor(resolved, [invalid]), undefined);
  const unknown = member('Unlisted-Species', { item: 'Rare item' });
  assert.equal(
    originalMemberFor(member('unlisted species'), [unknown]),
    unknown
  );
  assert.equal(
    originalMemberFor(member('Other unknown'), [unknown]),
    undefined
  );
});

test('original field choices lead in published order without inflating catalog counts or scores', () => {
  const self = member('Weavile', { item: 'Life Orb', ability: 'Pressure' });
  const original = member('Weavile', {
    item: 'Rare original item',
    ability: 'Pickpocket',
    nature: 'jolly',
    moves: ['Snatch', 'Protect', 'snatch', 'Ice Shard'],
  });
  const catalog = [
    {
      ...sourceTeam(),
      members: [
        member('Weavile', {
          item: 'Life Orb',
          ability: 'Pressure',
          nature: 'Jolly',
          moves: ['Protect', 'Ice Shard', 'Fake Out'],
        }),
      ],
    },
    {
      ...sourceTeam(),
      id: 'old',
      regulation: 'M-B',
      members: [
        member('Weavile', {
          item: 'Focus Sash',
          ability: 'Pickpocket',
          nature: 'Adamant',
          moves: ['Protect', 'Fake Out'],
        }),
      ],
    },
  ];
  const ordinary = catalogSuggestions(self, catalog, 'M-C');
  const promoted = catalogSuggestions(
    self,
    catalog,
    'M-C',
    [],
    undefined,
    '',
    self.pokemon,
    original
  );
  assert.deepEqual(promoted.items[0], {
    value: 'Rare original item',
    currentCount: 0,
    totalCount: 0,
    original: true,
  });
  assert.deepEqual(
    promoted.moves.map(({ value }) => value),
    ['Snatch', 'Protect', 'Ice Shard', 'Fake Out']
  );
  assert.deepEqual(promoted.moves[0], {
    value: 'Snatch',
    currentCount: 0,
    totalCount: 0,
    original: true,
  });
  for (const field of ['items', 'abilities', 'moves', 'natures']) {
    for (const row of ordinary[field]) {
      const actual = promoted[field].find(({ value }) => value === row.value);
      const { original: marker, ...unchanged } = actual;
      assert.deepEqual(unchanged, row);
      if (field === 'abilities' && row.value === 'Pickpocket')
        assert.equal(marker, true);
    }
  }
  assert.equal(promoted.natures[0].value, 'Jolly');
  assert.equal(promoted.natures[0].original, true);
  assert.equal(promoted.moves[1].currentCount, 1);
  assert.equal(promoted.moves[1].totalCount, 2);
  assert.equal(promoted.moves[2].original, true);
  assert.equal(promoted.moves[3].original, undefined);
});

test('original field recommendations reject unrelated forms, unknown values, and nonstandard natures', () => {
  const self = member('Rotom-Wash');
  const unrelated = member('Rotom-Heat', {
    item: 'Rare',
    ability: 'Levitate',
    nature: 'Timid',
    moves: ['Overheat'],
  });
  const choices = (target, original) =>
    catalogSuggestions(
      target,
      [],
      'M-C',
      [],
      undefined,
      '',
      target.pokemon,
      original
    );
  for (const field of ['items', 'abilities', 'moves', 'natures'])
    assert.deepEqual(choices(self, unrelated)[field], []);
  const unknown = member('Unlisted-Species', {
    item: 'Rare',
    ability: '---',
    nature: 'Legacy',
    moves: ['---', 'Unknown', 'Protect'],
  });
  const result = choices(member('unlisted species'), unknown);
  assert.equal(result.items[0].value, 'Rare');
  assert.deepEqual(result.abilities, []);
  assert.deepEqual(result.natures, []);
  assert.deepEqual(
    result.moves.map(({ value }) => value),
    ['Protect']
  );
  assert.deepEqual(
    choices(self, member('Rotom-Wash', { item: 'Unknown' })).items,
    []
  );
});

test('original EV recommendation computes spread deltas and speed without changing the original', () => {
  const self = member('Raichu', {
    item: 'Raichunite Y',
    nature: 'Timid',
    spread: '18 HP / 25 Def / 23 Spe',
  });
  const original = {
    ...self,
    spread: '18 HP / 24 Def / 24 Spe',
    nature: 'timid',
  };
  const unchanged = structuredClone(original);
  const changed = originalSpreadSuggestion(self, original);
  assert.deepEqual(changed.deltas, [
    { stat: 'Def', from: 25, to: 24, delta: -1 },
    { stat: 'Spe', from: 23, to: 24, delta: 1 },
  ]);
  assert.equal(changed.movedPoints, 1);
  assert.equal(changed.speed, 191);
  assert.equal(changed.nature, 'Timid');
  assert.equal(changed.spread, original.spread);
  assert.equal(changed.source, 'Original team');
  assert.equal(changed.original, true);
  assert.deepEqual(original, unchanged);
});
