import assert from 'node:assert/strict';
import test from 'node:test';
import { pokemonId } from '../src/lib/catalog.ts';
import {
  currentSetsKey,
  currentSetsSnapshot,
  mergeCurrentSets,
  readCurrentSets,
  reuseCurrentSet,
  saveCurrentSet,
  stageCurrentSets,
} from '../src/lib/current-sets.ts';
import {
  balanceChampionsStat,
  championsSpreadTotal,
} from '../src/lib/paste.ts';

const readError =
  'Current Pokémon sets could not be read. Existing data has been left untouched.';

function member(pokemon, changes = {}) {
  return {
    pokemon,
    item: 'Item',
    ability: 'Ability',
    moves: ['Protect', 'Fake Out'],
    nature: 'Adamant',
    spread: '32 HP / 32 Spe / 2 Atk',
    ...changes,
  };
}

function entry(value) {
  return { id: pokemonId(value.pokemon), member: value };
}

function memoryStorage(initial = null, setError = null) {
  let value = initial;
  let writes = 0;
  return {
    get value() {
      return value;
    },
    get writes() {
      return writes;
    },
    storage: {
      getItem(key) {
        assert.equal(key, currentSetsKey);
        return value;
      },
      setItem(key, next) {
        assert.equal(key, currentSetsKey);
        if (setError) throw setError;
        writes += 1;
        value = next;
      },
    },
  };
}

function serialized(...members) {
  return JSON.stringify(members.map(entry));
}

test('balancing moves only the selected EV stat toward 66 within its bounds', () => {
  const under = { HP: 20, Atk: 0, Def: 32, SpA: 0, SpD: 0, Spe: 10 };
  const before = structuredClone(under);
  const filled = balanceChampionsStat(under, 'HP');
  assert.deepEqual(filled, { ...under, HP: 24 });
  assert.equal(championsSpreadTotal(filled), 66);
  assert.deepEqual(under, before);

  const over = { HP: 28, Atk: 0, Def: 32, SpA: 0, SpD: 0, Spe: 10 };
  const reduced = balanceChampionsStat(over, 'HP');
  assert.deepEqual(reduced, { ...over, HP: 24 });
  assert.equal(championsSpreadTotal(reduced), 66);
  assert.deepEqual(over, { HP: 28, Atk: 0, Def: 32, SpA: 0, SpD: 0, Spe: 10 });

  assert.deepEqual(balanceChampionsStat(under, 'Def'), under);
  const unreachable = { HP: 2, Atk: 32, Def: 32, SpA: 0, SpD: 0, Spe: 10 };
  const unreachableBefore = structuredClone(unreachable);
  const bounded = balanceChampionsStat(unreachable, 'HP');
  assert.deepEqual(bounded, { ...unreachable, HP: 0 });
  assert.equal(championsSpreadTotal(bounded), 74);
  assert.deepEqual(unreachable, unreachableBefore);
  const complete = {
    HP: 24,
    Atk: 0,
    Def: 32,
    SpA: 0,
    SpD: 0,
    Spe: 10,
  };
  const completeBefore = structuredClone(complete);
  assert.deepEqual(balanceChampionsStat(complete, 'HP'), complete);
  assert.deepEqual(complete, completeBefore);
});

test('current-set saves share Browse identities, preserve snapshots, and skip identical writes', () => {
  const store = memoryStorage();
  const mawile = member('Mawile');
  const mawileBefore = structuredClone(mawile);
  saveCurrentSet(store.storage, mawile);
  assert.equal(store.writes, 1);
  const mega = member('Mawile-Mega', {
    item: 'Mawilite',
    set: 'Exact Mawile-Mega @ Mawilite\n- Protect\nCustom line',
    metadata: { source: 'saved' },
  });
  const megaBefore = structuredClone(mega);
  let sets = saveCurrentSet(store.storage, mega);
  assert.equal(store.writes, 2);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, 'mawile');
  assert.deepEqual(sets[0].member, mega);
  assert.deepEqual(mawile, mawileBefore);
  assert.deepEqual(mega, megaBefore);

  const second = member('Pikachu');
  sets = saveCurrentSet(store.storage, second);
  assert.deepEqual(sets.map(({ id }) => id).sort(), ['mawile', 'pikachu']);
  saveCurrentSet(store.storage, structuredClone(second));
  assert.equal(store.writes, 3);

  const replacement = member('Mawile', { item: 'New item' });
  const replacementBefore = structuredClone(replacement);
  sets = saveCurrentSet(store.storage, replacement);
  assert.equal(store.writes, 4);
  assert.equal(sets.length, 2);
  assert.deepEqual(sets.find(({ id }) => id === 'mawile').member, replacement);
  assert.deepEqual(sets.find(({ id }) => id === 'pikachu').member, second);
  assert.deepEqual(replacement, replacementBefore);
  assert.deepEqual(mega, megaBefore);

  saveCurrentSet(store.storage, member('Floette'));
  saveCurrentSet(store.storage, member('Floette-Eternal'));
  saveCurrentSet(store.storage, member('Floette-Eternal-Mega'));
  sets = readCurrentSets(store.storage);
  assert.equal(sets.filter(({ id }) => id === 'floette').length, 1);
  assert.equal(sets.filter(({ id }) => id === 'floetteeternal').length, 1);
  assert.equal(
    sets.find(({ id }) => id === 'floetteeternal').member.pokemon,
    'Floette-Eternal-Mega'
  );
  assert.deepEqual(readCurrentSets({ getItem: () => null }), []);
});

test('current-set registry rejects unreadable data without replacing its original bytes', () => {
  const valid = entry(member('Validmon'));
  const invalid = [
    '{',
    JSON.stringify([valid, valid]),
    JSON.stringify([{ ...valid, id: 'different' }]),
    JSON.stringify([{ ...valid, extra: true }]),
    JSON.stringify([
      entry(member('TooManyMoves', { moves: ['A', 'B', 'C', 'D', 'E'] })),
    ]),
    JSON.stringify([
      entry(member('DuplicateMoves', { moves: ['Fake Out', 'Fake-Out'] })),
    ]),
    JSON.stringify([entry(member('EmptyMove', { moves: [''] }))]),
    JSON.stringify([entry(member('LongId', { pokemon: 'a'.repeat(1501) }))]),
    JSON.stringify([entry(member('LongText', { set: 'x'.repeat(50_001) }))]),
    JSON.stringify(
      Array.from({ length: 1501 }, (_, index) => entry(member(`Mon${index}`)))
    ),
  ];
  for (const original of invalid) {
    const store = memoryStorage(original);
    assert.throws(() => readCurrentSets(store.storage), { message: readError });
    assert.equal(store.value, original);
    assert.equal(store.writes, 0);
  }

  const fullStore = memoryStorage(
    JSON.stringify(
      Array.from({ length: 1500 }, (_, index) =>
        entry(member(`Fullmon${index}`))
      )
    )
  );
  const fullBytes = fullStore.value;
  assert.throws(
    () => saveCurrentSet(fullStore.storage, member('Overflowmon')),
    { message: readError }
  );
  assert.equal(fullStore.value, fullBytes);
  assert.equal(fullStore.writes, 0);

  const oversizedMoveName = member('LongMove', {
    moves: ['x'.repeat(50_001)],
  });
  const candidateStore = memoryStorage(serialized(member('Existing')));
  const original = candidateStore.value;
  assert.throws(
    () => saveCurrentSet(candidateStore.storage, oversizedMoveName),
    { message: readError }
  );
  assert.equal(candidateStore.value, original);
  assert.equal(candidateStore.writes, 0);
});

test('current-set storage errors propagate and failed writes leave stored bytes unchanged', () => {
  const denied = new Error('storage denied');
  const original = serialized(member('Existing'));
  let bytes = original;
  let setAttempts = 0;
  const inaccessible = {
    getItem() {
      throw denied;
    },
    setItem(_key, next) {
      setAttempts += 1;
      bytes = next;
    },
  };
  assert.throws(
    () => saveCurrentSet(inaccessible, member('Newmon')),
    (error) => error === denied
  );
  assert.equal(bytes, original);
  assert.equal(setAttempts, 0);

  const quota = new Error('quota exceeded');
  const store = memoryStorage(original, quota);
  assert.throws(
    () => saveCurrentSet(store.storage, member('Newmon')),
    (error) => error === quota
  );
  assert.equal(store.value, original);
  assert.equal(store.writes, 0);

  for (const legacy of [
    member('LegacyNull', { nature: null, spread: null }),
    member('LegacyPartial', { nature: null, spread: '32 HP' }),
  ]) {
    assert.deepEqual(readCurrentSets({ getItem: () => serialized(legacy) }), [
      entry(legacy),
    ]);
  }
});

test('selective reuse changes only its fields and preserves current raw lines and metadata', () => {
  const current = member('Rotom-Wash', {
    item: 'Leftovers',
    ability: 'Levitate',
    nature: 'Bold',
    spread: '32 HP / 32 Def / 2 SpD',
    moves: ['Protect', 'Will-O-Wisp'],
    set: [
      'Bongo (Rotom-Wash) @ Leftovers',
      'Ability: Levitate',
      'EVs: 32 HP / 32 Def / 2 SpD',
      'Bold Nature',
      '- Protect',
      '- Will-O-Wisp',
      'Hidden Power: Ice',
    ].join('\n'),
    metadata: { keep: true },
  });
  const saved = member('Rotom-Wash-Mega', {
    item: 'Choice Specs',
    ability: 'Different Ability',
    nature: 'Modest',
    spread: '32 SpA / 32 Spe / 2 HP',
    moves: ['Hydro Pump', 'Thunderbolt'],
    set: 'Rotom-Wash-Mega @ Choice Specs\n- Hydro Pump',
  });
  const before = structuredClone(current);
  const savedBefore = structuredClone(saved);
  const evs = reuseCurrentSet(current, saved, 'evs');
  assert.equal(evs.pokemon, current.pokemon);
  assert.equal(evs.item, current.item);
  assert.equal(evs.ability, current.ability);
  assert.equal(evs.nature, saved.nature);
  assert.equal(evs.spread, saved.spread);
  assert.deepEqual(evs.moves, current.moves);
  assert.deepEqual(evs.metadata, current.metadata);
  assert.equal(evs.set.split('\n')[0], 'Bongo (Rotom-Wash) @ Leftovers');
  assert.ok(evs.set.split('\n').includes('Hidden Power: Ice'));
  assert.ok(evs.set.split('\n').includes('EVs: 32 SpA / 32 Spe / 2 HP'));
  assert.ok(evs.set.split('\n').includes('Modest Nature'));

  const moves = reuseCurrentSet(current, saved, 'moves');
  assert.deepEqual(moves.moves, saved.moves);
  assert.equal(moves.item, current.item);
  assert.equal(moves.ability, current.ability);
  assert.equal(moves.nature, current.nature);
  assert.equal(moves.spread, current.spread);
  assert.equal(moves.set.split('\n')[0], 'Bongo (Rotom-Wash) @ Leftovers');
  assert.ok(moves.set.split('\n').includes('Hidden Power: Ice'));
  assert.ok(moves.set.split('\n').includes('EVs: 32 HP / 32 Def / 2 SpD'));
  assert.ok(moves.set.split('\n').includes('Bold Nature'));
  assert.deepEqual(
    moves.set.split('\n').filter((line) => line.startsWith('- ')),
    ['- Hydro Pump', '- Thunderbolt']
  );
  assert.deepEqual(moves.metadata, current.metadata);

  const all = reuseCurrentSet(current, saved, 'all');
  assert.deepEqual(all, saved);
  assert.notStrictEqual(all, saved);
  assert.notStrictEqual(all.moves, saved.moves);
  assert.deepEqual(current, before);
  assert.deepEqual(saved, savedBefore);
  assert.throws(
    () => reuseCurrentSet(current, member('Rotom-Heat'), 'evs'),
    /does not match/
  );
});

test('current-set snapshots ignore order and merges reconcile whole entries without deletions', () => {
  const pikachu = member('Pikachu');
  const eevee = member('Eevee');
  const vaporeon = member('Vaporeon');
  const snorlax = member('Snorlax');
  const base = [pikachu, eevee, vaporeon, snorlax].map(entry);
  const localPikachu = member('Pikachu', { item: 'Local item' });
  const localSnorlax = member('Snorlax', { item: 'Local item' });
  const localOnly = member('Sylveon');
  const remotePikachu = member('Pikachu', { item: 'Remote item' });
  const remoteEevee = member('Eevee', { item: 'Remote item' });
  const remoteVaporeon = member('Vaporeon', { item: 'Remote item' });
  const remoteOnly = member('Leafeon');
  const local = [localPikachu, eevee, localSnorlax, localOnly].map(entry);
  const remote = [
    remotePikachu,
    remoteEevee,
    remoteVaporeon,
    snorlax,
    remoteOnly,
  ].map(entry);
  const merged = mergeCurrentSets(base, local, remote);
  const byId = new Map(merged.map((item) => [item.id, item.member]));
  assert.deepEqual(byId.get('pikachu'), localPikachu);
  assert.deepEqual(byId.get('eevee'), remoteEevee);
  assert.deepEqual(byId.get('vaporeon'), remoteVaporeon);
  assert.deepEqual(byId.get('snorlax'), localSnorlax);
  assert.deepEqual(byId.get('sylveon'), localOnly);
  assert.deepEqual(byId.get('leafeon'), remoteOnly);
  assert.equal(
    currentSetsSnapshot(merged),
    currentSetsSnapshot([...merged].reverse())
  );

  const initial = mergeCurrentSets(null, [entry(pikachu)], [entry(eevee)]);
  assert.deepEqual(
    initial.map(({ id }) => id),
    ['eevee', 'pikachu']
  );

  const captured = [entry(member('Pikachu', { item: 'First save' }))];
  const newer = [entry(member('Pikachu', { item: 'Second save' }))];
  const inFlight = mergeCurrentSets(captured, newer, captured);
  assert.deepEqual(inFlight, newer);
  assert.notEqual(currentSetsSnapshot(inFlight), currentSetsSnapshot(captured));
});

test('current-set staging commits at most 350 sorted changes and rebases deferred entries', () => {
  const newEntries = Array.from({ length: 350 }, (_, index) =>
    entry(member(`Newmon${String(index).padStart(4, '0')}`))
  );
  const newBatch = stageCurrentSets([], newEntries);
  assert.equal(newBatch.committed.length, 350);
  assert.deepEqual(newBatch.pendingIds, []);
  assert.equal(
    currentSetsSnapshot(newBatch.committed),
    currentSetsSnapshot(newEntries)
  );

  const remote = Array.from({ length: 351 }, (_, index) =>
    entry(
      member(`Changedmon${String(index).padStart(4, '0')}`, {
        item: 'Old item',
      })
    )
  );
  const desired = remote.map(({ member: value }) =>
    entry({ ...value, item: 'New item' })
  );
  const first = stageCurrentSets(remote, desired);
  assert.equal(first.committed.length, 351);
  assert.equal(first.pendingIds.length, 1);
  assert.equal(first.pendingIds[0], desired[350].id);
  assert.deepEqual(
    first.committed.find(({ id }) => id === desired[350].id),
    remote[350]
  );

  const rebased = mergeCurrentSets(desired, desired, first.committed);
  const pending = desired.filter(({ id }) => first.pendingIds.includes(id));
  const restored = [
    ...rebased.filter(({ id }) => !first.pendingIds.includes(id)),
    ...pending,
  ];
  assert.deepEqual(
    restored.find(({ id }) => id === pending[0].id),
    pending[0]
  );
  const second = stageCurrentSets(first.committed, restored);
  assert.deepEqual(second.pendingIds, []);
  assert.equal(
    currentSetsSnapshot(second.committed),
    currentSetsSnapshot(desired)
  );
});
