import assert from 'node:assert/strict';
import test from 'node:test';
import { pokemonId } from '../src/lib/catalog.ts';
import {
  currentSetsKey,
  currentSetsSnapshot,
  mergeCurrentSets,
  prepareCurrentSets,
  readCurrentSets,
  saveCurrentSets,
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
    spread: '32 HP / 2 Atk / 32 Spe',
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
    replace(next) {
      value = next;
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
  let plan = prepareCurrentSets(store.storage, [member('Mawile')]);
  saveCurrentSets(store.storage, plan, new Set());

  const mega = member('Mawile-Mega', {
    item: 'Mawilite',
    set: 'Exact Mawile-Mega @ Mawilite\n- Protect\nCustom line',
    metadata: { source: 'saved' },
  });
  plan = prepareCurrentSets(store.storage, [mega]);
  assert.deepEqual(
    plan.overwritten.map(({ id }) => id),
    ['mawile']
  );
  let sets = saveCurrentSets(store.storage, plan, new Set(['mawile']));
  assert.deepEqual(sets, [entry(mega)]);

  const second = member('Pikachu');
  plan = prepareCurrentSets(store.storage, [second]);
  sets = saveCurrentSets(store.storage, plan, new Set());
  assert.deepEqual(sets.map(({ id }) => id).sort(), ['mawile', 'pikachu']);
  plan = prepareCurrentSets(store.storage, [structuredClone(second)]);
  assert.deepEqual(plan.overwritten, []);
  saveCurrentSets(store.storage, plan, new Set());

  const replacement = member('Mawile', { item: 'New item' });
  plan = prepareCurrentSets(store.storage, [replacement]);
  assert.deepEqual(
    plan.overwritten.map(({ id }) => id),
    ['mawile']
  );
  sets = saveCurrentSets(store.storage, plan, new Set(['mawile']));
  assert.deepEqual(sets.find(({ id }) => id === 'mawile').member, replacement);
  assert.deepEqual(sets.find(({ id }) => id === 'pikachu').member, second);

  plan = prepareCurrentSets(store.storage, [member('Floette')]);
  saveCurrentSets(store.storage, plan, new Set());
  plan = prepareCurrentSets(store.storage, [member('Floette-Eternal')]);
  saveCurrentSets(store.storage, plan, new Set());
  plan = prepareCurrentSets(store.storage, [member('Floette-Eternal-Mega')]);
  assert.deepEqual(
    plan.overwritten.map(({ id }) => id),
    ['floetteeternal']
  );
  sets = saveCurrentSets(store.storage, plan, new Set(['floetteeternal']));
  assert.deepEqual(
    sets
      .filter(({ id }) => id.startsWith('floette'))
      .map(({ id, member }) => [id, member.pokemon]),
    [
      ['floette', 'Floette'],
      ['floetteeternal', 'Floette-Eternal-Mega'],
    ]
  );
  const writes = store.writes;
  plan = prepareCurrentSets(store.storage, []);
  assert.deepEqual(saveCurrentSets(store.storage, plan, new Set()), sets);
  assert.equal(store.writes, writes);
});

test('current-set saves neither offer nor rewrite cosmetic-only differences', () => {
  const incoming = member('Pikachu', {
    item: 'Leftovers',
    ability: 'Static',
    moves: ['Protect', 'Fake Out'],
    nature: 'Adamant',
    spread: '32 HP / 2 Atk / 32 Spe',
  });
  const stored = {
    ...incoming,
    item: 'leftovers',
    moves: ['Fake Out', 'Protect'],
  };
  const store = memoryStorage(serialized(stored));
  const before = readCurrentSets(store.storage);
  const writes = store.writes;

  let plan = prepareCurrentSets(store.storage, [incoming]);
  assert.deepEqual(plan.overwritten, []);
  assert.deepEqual(saveCurrentSets(store.storage, plan, new Set()), before);
  assert.equal(store.writes, writes);

  const defining = { ...incoming, spread: '32 HP / 4 Atk / 30 Spe' };
  plan = prepareCurrentSets(store.storage, [defining]);
  assert.deepEqual(
    plan.overwritten.map(({ id }) => id),
    ['pikachu']
  );
  const sets = saveCurrentSets(store.storage, plan, new Set(['pikachu']));
  assert.deepEqual(sets, [entry(defining)]);
  assert.equal(store.writes, writes + 1);
});

test('bulk current-set saves six new snapshots with one write', () => {
  const unrelated = member('Ditto', {
    set: 'Ditto @ Leftovers\n- Protect',
    metadata: { source: 'unrelated' },
  });
  const store = memoryStorage(serialized(unrelated));
  const members = [
    'Pikachu',
    'Eevee',
    'Gengar',
    'Snorlax',
    'Sylveon',
    'Weavile',
  ].map((pokemon) =>
    member(pokemon, { metadata: { source: 'batch' }, set: `${pokemon} set` })
  );
  const before = structuredClone(members);
  const plan = prepareCurrentSets(store.storage, members);
  assert.deepEqual(plan.overwritten, []);
  const saved = saveCurrentSets(store.storage, plan, new Set());
  assert.equal(store.writes, 1);
  assert.equal(saved.length, 7);
  assert.deepEqual(saved.find(({ id }) => id === 'ditto').member, unrelated);
  for (const value of members)
    assert.deepEqual(
      saved.find(({ id }) => id === pokemonId(value.pokemon)).member,
      value
    );
  assert.deepEqual(members, before);
});

test('bulk current-set preparation isolates snapshots and cancellation writes nothing', () => {
  const original = serialized(
    member('Weavile', { item: 'Old item' }),
    member('Eevee', { ability: 'Old ability' }),
    member('Pikachu'),
    member('Ditto', { set: 'Exact unrelated text' })
  );
  const incoming = [
    member('Sylveon'),
    member('Weavile', {
      item: 'New item',
      set: 'Weavile @ New item\n- Protect',
      metadata: { source: 'batch' },
    }),
    member('Pikachu'),
    member('Eevee', { ability: 'New ability', nature: null, spread: null }),
  ];
  const before = structuredClone(incoming);
  const expectedIds = ['eevee', 'weavile'];
  const accepted = memoryStorage(original);
  const plan = prepareCurrentSets(accepted.storage, incoming);
  assert.deepEqual(
    plan.overwritten.map(({ id }) => id),
    expectedIds
  );
  assert.notStrictEqual(plan.incoming[1].member, incoming[1]);
  assert.notStrictEqual(
    plan.overwritten[0].member,
    plan.current.find(({ id }) => id === 'eevee').member
  );
  incoming[1].item = 'Caller mutation';
  plan.overwritten[0].member.ability = 'Displayed mutation';
  plan.overwritten.reverse();
  assert.deepEqual(plan.incoming[1].member, before[1]);
  assert.equal(
    plan.current.find(({ id }) => id === 'eevee').member.ability,
    'Old ability'
  );
  const result = saveCurrentSets(accepted.storage, plan, new Set(expectedIds));
  assert.equal(accepted.writes, 1);
  assert.deepEqual(result.find(({ id }) => id === 'weavile').member, before[1]);
  assert.deepEqual(result.find(({ id }) => id === 'eevee').member, before[3]);

  const cancelled = memoryStorage(original);
  const cancelledPlan = prepareCurrentSets(cancelled.storage, incoming);
  assert.deepEqual(
    cancelledPlan.overwritten.map(({ id }) => id).sort(),
    expectedIds
  );
  assert.equal(cancelled.value, original);
  assert.equal(cancelled.writes, 0);
});

test('selective current-set saves replace only selected conflicts and add new slots', () => {
  const oldWeavile = member('Weavile', { item: 'Old Weavile' });
  const oldWhimsicott = member('Whimsicott', { item: 'Old Whimsicott' });
  const ditto = member('Ditto', { item: 'Unrelated' });
  const original = serialized(oldWeavile, oldWhimsicott, ditto);
  const weavile = member('Weavile', { item: 'New Weavile' });
  const whimsicott = member('Whimsicott', { item: 'New Whimsicott' });
  const sylveon = member('Sylveon', { item: 'New Pokémon' });
  const choices = [
    ['Weavile only', ['weavile']],
    ['Whimsicott only', ['whimsicott']],
    ['both conflicts', ['weavile', 'whimsicott']],
    ['neither conflict', []],
  ];
  for (const [name, selected] of choices) {
    const store = memoryStorage(original);
    const plan = prepareCurrentSets(store.storage, [
      weavile,
      whimsicott,
      sylveon,
    ]);
    assert.deepEqual(
      plan.overwritten.map(({ id }) => id),
      ['weavile', 'whimsicott'],
      name
    );
    const saved = saveCurrentSets(store.storage, plan, new Set(selected));
    assert.equal(store.writes, 1, name);
    const savedById = new Map(saved.map(({ id, member }) => [id, member]));
    assert.deepEqual(
      [...savedById.keys()].sort(),
      ['ditto', 'sylveon', 'weavile', 'whimsicott'],
      name
    );
    assert.deepEqual(
      ['weavile', 'whimsicott', 'sylveon', 'ditto'].map((id) =>
        savedById.get(id)
      ),
      [
        selected.includes('weavile') ? weavile : oldWeavile,
        selected.includes('whimsicott') ? whimsicott : oldWhimsicott,
        sylveon,
        ditto,
      ],
      name
    );
  }
});

test('bulk current-set saves reject duplicate Browse identities', () => {
  const original = serialized(member('Ditto'));
  for (const members of [
    [member('Mawile'), member('Mawile-Mega')],
    [member('Floette-Eternal'), member('Floette-Eternal-Mega')],
  ]) {
    const store = memoryStorage(original);
    const before = structuredClone(members);
    assert.throws(() => prepareCurrentSets(store.storage, members), {
      message: 'Cannot save two sets for the same Pokémon at once.',
    });
    assert.deepEqual(members, before);
    assert.equal(store.value, original);
    assert.equal(store.writes, 0);
  }
});

test('bulk current-set saves keep ordinary Floette separate from Eternal', () => {
  const store = memoryStorage();
  const plan = prepareCurrentSets(store.storage, [
    member('Floette'),
    member('Floette-Eternal'),
  ]);
  const saved = saveCurrentSets(store.storage, plan, new Set());
  assert.deepEqual(saved.map(({ id }) => id).sort(), [
    'floette',
    'floetteeternal',
  ]);
  assert.deepEqual(saved.map(({ member }) => member.pokemon).sort(), [
    'Floette',
    'Floette-Eternal',
  ]);
  assert.equal(store.writes, 1);
});

test('current-set commits with no eligible changes return latest data without writing', () => {
  const identical = member('Pikachu');
  const store = memoryStorage(serialized(identical));
  for (const [members, conflicts] of [
    [[identical], []],
    [[member('Pikachu', { item: 'New' })], ['pikachu']],
    [[], []],
  ]) {
    const plan = prepareCurrentSets(store.storage, members);
    assert.deepEqual(
      plan.overwritten.map(({ id }) => id),
      conflicts
    );
    assert.deepEqual(saveCurrentSets(store.storage, plan, new Set()), [
      entry(identical),
    ]);
  }
  assert.equal(store.writes, 0);

  const unreadable = memoryStorage(serialized(identical));
  const plan = prepareCurrentSets(unreadable.storage, [
    member('Pikachu', { item: 'New' }),
  ]);
  unreadable.replace('{');
  assert.throws(() => saveCurrentSets(unreadable.storage, plan, new Set()), {
    message: readError,
  });
  assert.equal(unreadable.value, '{');
  assert.equal(unreadable.writes, 0);
});

test('current-set commits reject replacement IDs that were not offered', () => {
  const store = memoryStorage(serialized(member('Weavile', { item: 'Old' })));
  assert.throws(
    () =>
      saveCurrentSets(
        store.storage,
        prepareCurrentSets(store.storage, [member('Weavile', { item: 'New' })]),
        new Set(['ditto'])
      ),
    {
      message:
        'Cannot replace a Pokémon set that was not offered for replacement.',
    }
  );
  assert.equal(store.writes, 0);
});

test('bulk current-set commits reject affected races without partial writes', () => {
  const oldWeavile = member('Weavile', { item: 'Old item' });
  const ditto = member('Ditto', { item: 'Original unrelated item' });
  const original = serialized(oldWeavile, ditto);
  const desired = member('Weavile', { item: 'New item' });
  const raceMessage =
    'Current Pokémon sets changed while confirming. Try saving again.';
  const cases = [
    [
      'changed selected slot',
      [desired, member('Sylveon')],
      [member('Weavile', { item: 'Concurrent item' }), ditto],
      ['weavile'],
      ['weavile'],
    ],
    ['deleted selected slot', [desired], [ditto], ['weavile'], ['weavile']],
    [
      'concurrently filled new slot',
      [desired, member('Sylveon'), member('Gengar')],
      [oldWeavile, ditto, member('Sylveon', { item: 'Concurrent item' })],
      ['weavile'],
      ['weavile'],
    ],
    [
      'changed previously identical slot',
      [oldWeavile, member('Sylveon')],
      [member('Weavile', { item: 'Concurrent item' }), ditto],
      [],
      [],
    ],
    [
      'deleted previously identical slot',
      [oldWeavile, member('Sylveon')],
      [ditto],
      [],
      [],
    ],
  ];
  for (const [name, members, latest, conflicts, selected] of cases) {
    const store = memoryStorage(original);
    const plan = prepareCurrentSets(store.storage, members);
    assert.deepEqual(
      plan.overwritten.map(({ id }) => id),
      conflicts,
      name
    );
    store.replace(serialized(...latest));
    const concurrent = store.value;
    assert.throws(
      () => saveCurrentSets(store.storage, plan, new Set(selected)),
      { message: raceMessage },
      name
    );
    assert.equal(store.value, concurrent, name);
    assert.equal(store.writes, 0, name);
  }

  const unrelated = memoryStorage(original);
  const plan = prepareCurrentSets(unrelated.storage, [
    desired,
    member('Sylveon'),
  ]);
  const concurrent = serialized(
    oldWeavile,
    member('Ditto', { item: 'Concurrent unrelated item' }),
    member('Gengar')
  );
  unrelated.replace(concurrent);
  const merged = saveCurrentSets(unrelated.storage, plan, new Set(['weavile']));
  assert.equal(unrelated.writes, 1);
  const mergedById = new Map(merged.map(({ id, member }) => [id, member]));
  assert.deepEqual(
    ['ditto', 'gengar', 'sylveon', 'weavile'].map((id) => mergedById.get(id)),
    [
      member('Ditto', { item: 'Concurrent unrelated item' }),
      member('Gengar'),
      member('Sylveon'),
      desired,
    ]
  );

  const alreadyDesired = memoryStorage(original);
  const alreadyDesiredPlan = prepareCurrentSets(alreadyDesired.storage, [
    desired,
  ]);
  const concurrentDesired = serialized(
    desired,
    member('Ditto', { item: 'Concurrent unrelated item' })
  );
  alreadyDesired.replace(concurrentDesired);
  assert.deepEqual(
    saveCurrentSets(
      alreadyDesired.storage,
      alreadyDesiredPlan,
      new Set(['weavile'])
    ),
    JSON.parse(concurrentDesired)
  );
  assert.equal(alreadyDesired.writes, 0);
});

test('bulk current-set commits preserve updates and deletions to skipped conflicts', () => {
  const original = serialized(
    member('Weavile', { item: 'Old Weavile' }),
    member('Whimsicott', { item: 'Old Whimsicott' }),
    member('Ditto', { item: 'Original unrelated' })
  );
  const incoming = [
    member('Weavile', { item: 'New Weavile' }),
    member('Whimsicott', { item: 'New Whimsicott' }),
    member('Sylveon'),
  ];
  for (const skipped of [
    member('Whimsicott', { item: 'Concurrent skipped update' }),
    undefined,
  ]) {
    const store = memoryStorage(original);
    const plan = prepareCurrentSets(store.storage, incoming);
    const latest = [
      member('Weavile', { item: 'Old Weavile' }),
      ...(skipped ? [skipped] : []),
      member('Ditto', { item: 'Concurrent unrelated' }),
    ];
    store.replace(serialized(...latest));
    const saved = saveCurrentSets(store.storage, plan, new Set(['weavile']));
    assert.equal(store.writes, 1);
    const savedById = new Map(saved.map(({ id, member }) => [id, member]));
    assert.deepEqual(
      [...savedById.keys()].sort(),
      skipped
        ? ['ditto', 'sylveon', 'weavile', 'whimsicott']
        : ['ditto', 'sylveon', 'weavile']
    );
    assert.deepEqual(
      ['ditto', 'sylveon', 'weavile', ...(skipped ? ['whimsicott'] : [])].map(
        (id) => savedById.get(id)
      ),
      [latest.at(-1), incoming[2], incoming[0], ...(skipped ? [skipped] : [])]
    );
  }
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
    assert.throws(() => readCurrentSets(store.storage), {
      message: readError,
    });
    assert.throws(() => prepareCurrentSets(store.storage, [member('Newmon')]), {
      message: readError,
    });
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
    () => prepareCurrentSets(fullStore.storage, [member('Overflowmon')]),
    { message: readError }
  );
  assert.equal(fullStore.value, fullBytes);
  assert.equal(fullStore.writes, 0);

  const oversizedMoveName = member('LongMove', {
    moves: ['x'.repeat(50_001)],
  });
  const candidateStore = memoryStorage(serialized(member('Existing')));
  const original = candidateStore.value;
  const invalidMembers = [member('Newmon'), oversizedMoveName];
  const invalidMembersBefore = structuredClone(invalidMembers);
  assert.throws(
    () => prepareCurrentSets(candidateStore.storage, invalidMembers),
    { message: readError }
  );
  assert.deepEqual(invalidMembers, invalidMembersBefore);
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
    () => prepareCurrentSets(inaccessible, [member('Newmon')]),
    (error) => error === denied
  );
  assert.equal(bytes, original);
  assert.equal(setAttempts, 0);

  const quota = new Error('quota exceeded');
  const store = memoryStorage(original, quota);
  const plan = prepareCurrentSets(store.storage, [member('Newmon')]);
  assert.throws(
    () => saveCurrentSets(store.storage, plan, new Set()),
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
  const newBatch = stageCurrentSets([], newEntries, {
    setIds: [],
    entries: [],
  });
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
  const first = stageCurrentSets(remote, desired, {
    setIds: remote.map(({ id }) => id),
    entries: remote,
  });
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
  const second = stageCurrentSets(first.committed, restored, {
    setIds: first.setIds,
    entries: first.committed,
  });
  assert.deepEqual(second.pendingIds, []);
  assert.equal(
    currentSetsSnapshot(second.committed),
    currentSetsSnapshot(desired)
  );
});
