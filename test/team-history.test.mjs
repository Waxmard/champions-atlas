import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkpointTeam,
  differences,
  restoreTeam,
} from '../src/lib/team-history.ts';
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
});

test('grouped saves checkpoint once, keep originals, and restore without mutation', () => {
  const storage = memory(),
    initial = newSavedTeam(sourceTeam());
  initial.members[0].mystery = 'keep';
  saveTeam(storage, initial);
  const group = { id: 'visit-1', label: 'Edited Pokemon0' };
  let candidate = readSavedTeams(storage)[0];
  candidate.members[0].item = 'Orb';
  let saved = saveTeam(storage, candidate, group)[0];
  candidate = structuredClone(saved);
  candidate.members[0].ability = 'Ability';
  saved = saveTeam(storage, candidate, group)[0];
  assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].name, 'Published');
  assert.equal(saved.history[0].members[0].item, null);
  assert.equal(saved.members[0].item, 'Orb');
  candidate = structuredClone(saved);
  candidate.name = 'Renamed';
  saved = saveTeam(storage, candidate, {
    id: 'visit-2',
    label: 'Renamed team',
  })[0];
  assert.equal(saved.history.length, 2);
  assert.equal(saved.history[1].name, 'Published');
  const restored = restoreTeam(saved, saved.history[0].id);
  assert.equal(restored.name, 'Published');
  assert.equal(restored.members[0].item, null);
  assert.equal(restored.original.creator, 'author');
  assert.equal(restored.id, initial.id);
  const roundTrip = saveTeam(storage, restored, {
    id: 'restore-1',
    label: 'Restored version',
  })[0];
  assert.equal(roundTrip.history.length, 3);
  assert.equal(roundTrip.history[2].members[0].item, 'Orb');
  assert.equal(roundTrip.members[0].mystery, 'keep');
  assert.throws(() => restoreTeam(saved, 'gone'), /no longer available/);
});

test('no-op, invalid candidate, corrupt storage, and failed writes preserve data', () => {
  const storage = memory(),
    saved = newSavedTeam(sourceTeam());
  saveTeam(storage, saved);
  const raw = storage.raw();
  saveTeam(storage, readSavedTeams(storage)[0], { id: 'noop', label: 'noop' });
  assert.equal(storage.raw(), raw);
  assert.equal(readSavedTeams(storage)[0].history.length, 0);
  const invalid = structuredClone(readSavedTeams(storage)[0]);
  invalid.members[0].pokemon = '!!!';
  assert.throws(() => saveTeam(storage, invalid));
  assert.equal(storage.raw(), raw);
  assert.throws(() => readSavedTeams({ getItem: () => '{broken' }));
  assert.throws(() =>
    saveTeam({ getItem: () => '{broken', setItem: () => assert.fail() }, saved)
  );
});

test('history defaults legacy origin without inventing it and retains custom starting metadata', () => {
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
  assert.deepEqual(custom.history, []);
  assert.deepEqual(custom.original.sheetIds, []);
  assert.equal(custom.original.replicaCode, null);
  const legacy = newSavedTeam(sourceTeam());
  delete legacy.history;
  delete legacy.origin;
  const loaded = readSavedTeams({ getItem: () => JSON.stringify([legacy]) })[0];
  assert.equal(loaded.origin, undefined);
  assert.deepEqual(loaded.history, []);
});

test('twenty-one editing groups expire only the oldest checkpoint', () => {
  const storage = memory(),
    base = newSavedTeam(sourceTeam());
  saveTeam(storage, base);
  let current = readSavedTeams(storage)[0];
  for (let i = 0; i < 21; i++) {
    const next = structuredClone(current);
    next.name = 'Edit ' + i;
    current = saveTeam(storage, next, { id: 'g' + i, label: 'Edit ' + i })[0];
  }
  assert.equal(current.history.length, 20);
  assert.equal(current.history[0].id, 'g1');
  assert.equal(current.original.name, 'Published');
  assert.equal(current.name, 'Edit 20');
});

test('failed writes preserve caller and storage and retry the same group', () => {
  const storage = memory();
  const initial = saveTeam(storage, newSavedTeam(sourceTeam()))[0];
  const candidate = structuredClone(initial);
  candidate.name = 'Pending';
  const before = structuredClone(candidate),
    raw = storage.raw();
  const group = { id: 'retry', label: 'Edited team' };
  assert.throws(
    () =>
      saveTeam(
        {
          ...storage,
          setItem: () => {
            throw new Error('Quota');
          },
        },
        candidate,
        group
      ),
    /Quota/
  );
  assert.deepEqual(candidate, before);
  assert.equal(storage.raw(), raw);
  const saved = saveTeam(storage, candidate, group)[0];
  assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].id, group.id);
  assert.deepEqual(saved.history[0].members, initial.members);
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

test('checkpoint helper owns no-op, coalescing, and older-group rejection', () => {
  const initial = newSavedTeam(sourceTeam());
  const first = checkpointTeam(
    initial,
    { ...initial, name: 'First' },
    { id: 'first', label: 'First' }
  );
  const second = checkpointTeam(
    first,
    { ...first, name: 'Second' },
    { id: 'second', label: 'Second' }
  );
  assert.deepEqual(
    checkpointTeam(second, second, { id: 'first', label: 'No-op' }).history,
    second.history
  );
  assert.deepEqual(
    checkpointTeam(
      second,
      { ...second, name: 'Third' },
      { id: 'second', label: 'Changed label' }
    ).history,
    second.history
  );
  const snapshot = structuredClone(second);
  assert.throws(
    () =>
      checkpointTeam(
        second,
        { ...second, name: 'Third' },
        { id: 'first', label: 'Old' }
      ),
    /editing session changed elsewhere/
  );
  assert.deepEqual(second, snapshot);
  const storage = memory();
  saveTeam(storage, second);
  const raw = storage.raw();
  assert.throws(
    () =>
      saveTeam(
        storage,
        { ...second, name: 'Third' },
        { id: 'first', label: 'Old' }
      ),
    /editing session changed elsewhere/
  );
  assert.equal(storage.raw(), raw);
});

test('stale metadata copies cannot replace stored provenance or history', () => {
  const storage = memory(),
    initial = saveTeam(storage, newSavedTeam(sourceTeam()))[0];
  const edited = saveTeam(
    storage,
    { ...initial, name: 'Edited' },
    { id: 'visit', label: 'Edit' }
  )[0];
  const stale = structuredClone(edited);
  stale.original.creator = 'Wrong';
  stale.origin = 'custom';
  stale.history = [];
  stale.sources = [
    { name: 'Extra', pasteUrl: 'https://pokepast.es/1234567890abcdef' },
  ];
  const metadata = saveTeam(storage, stale)[0];
  assert.deepEqual(metadata.original, initial.original);
  assert.equal(metadata.origin, 'catalog');
  assert.deepEqual(metadata.history, edited.history);
  assert.deepEqual(metadata.sources, stale.sources);
  stale.name = 'Next';
  const next = saveTeam(storage, stale)[0];
  assert.deepEqual(next.original, initial.original);
  assert.equal(next.history.length, 2);
  assert.deepEqual(next.history[0], edited.history[0]);
});

test('full detached provenance survives reload and restore recovers displaced exact state', () => {
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
  const edited = saveTeam(storage, candidate, { id: 'edit', label: 'Edit' })[0];
  const restored = saveTeam(storage, restoreTeam(edited, 'original'), {
    id: 'restore',
    label: 'Restored original',
  })[0];
  assert.deepEqual(restored.members, baseline.members);
  const recovered = saveTeam(storage, restoreTeam(restored, 'restore'), {
    id: 'recover',
    label: 'Restored version',
  })[0];
  assert.equal(recovered.name, edited.name);
  assert.deepEqual(recovered.members, edited.members);
  assert.deepEqual(recovered.original, baseline);
  assert.deepEqual(recovered.sources, loaded.sources);
  assert.equal(recovered.id, loaded.id);
  assert.deepEqual(recovered.history.slice(0, 2), restored.history);
});

test('malformed histories fail closed at read and save boundaries', () => {
  const initial = newSavedTeam(sourceTeam());
  const revision = {
    id: 'r',
    savedAt: '2026-10-06T00:00:00.000Z',
    label: 'Edit',
    name: initial.name,
    members: initial.members,
  };
  const histories = [
    [{ ...revision, id: '' }],
    [{ ...revision, id: 'x'.repeat(50001) }],
    [{ ...revision, savedAt: 'yesterday' }],
    [{ ...revision, label: 'x'.repeat(50001) }],
    [{ ...revision, name: 'x'.repeat(50001) }],
    [revision, revision],
    Array.from({ length: 21 }, (_, i) => ({ ...revision, id: String(i) })),
    [{ ...revision, members: initial.members.slice(1) }],
    [{ ...revision, members: Array(6).fill(initial.members[0]) }],
  ];
  for (const history of histories) {
    const malformed = { ...initial, history },
      raw = JSON.stringify([malformed]);
    assert.throws(() => readSavedTeams({ getItem: () => raw }));
    assert.throws(() =>
      saveTeam(
        { getItem: () => raw, setItem: () => assert.fail('Must not write') },
        initial
      )
    );
    const storage = memory();
    saveTeam(storage, initial);
    const before = storage.raw();
    assert.throws(() => saveTeam(storage, malformed));
    assert.equal(storage.raw(), before);
  }
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
  delete legacy.history;
  delete legacy.original.creator;
  for (const initial of [custom, legacy]) {
    const storage = memory();
    const saved = saveTeam(storage, initial)[0];
    const edited = saveTeam(storage, { ...saved, name: 'First' })[0];
    const second = saveTeam(storage, { ...edited, name: 'Second' })[0];
    assert.equal(second.origin, initial.origin);
    assert.deepEqual(second.original, initial.original);
    assert.equal(second.history.length, 2);
    assert.notEqual(second.history[0].id, second.history[1].id);
    assert.equal(second.history[0].label, 'Edited team');
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
