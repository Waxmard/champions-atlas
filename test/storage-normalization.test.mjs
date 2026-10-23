import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { normalize, pokemonId } from '../src/lib/catalog.ts';
import { decodeCurrentSetCloud } from '../src/lib/current-set-sync.ts';
import { canonicalMember } from '../src/lib/paste.ts';
import {
  applyGuardedStorageWrites,
  composeSyncCache,
  migrateStoredData,
  readSyncCache,
  readSyncCacheSnapshot,
  syncRecordKey,
  writeSyncCache,
} from '../src/lib/storage-migration.ts';
import { storageKey } from '../src/lib/workbench.ts';
import {
  currentSetsKey,
  inspectCurrentSets,
  inspectRawCurrentSet,
  readCurrentSets,
  readCurrentSetsValue,
  rebaseStagedCurrentSets,
  resolveLegacyDuplicates,
  stageCurrentSets,
} from '../src/lib/current-sets.ts';

function member(changes = {}) {
  return {
    pokemon: 'Pikachu',
    item: 'Light Ball',
    ability: 'Static',
    moves: ['Protect', 'Thunderbolt'],
    nature: 'Adamant',
    spread: '2 HP / 32 Atk / 32 Spe',
    ...changes,
  };
}

function legacyRegistry() {
  const base = member({
    pokemon: 'Garchomp',
    item: 'Life Orb',
    ability: 'Rough Skin',
    moves: ['Protect', 'Earthquake'],
  });
  return [
    { id: 'garchomp', member: base },
    {
      id: 'garchompmegaz',
      member: {
        ...base,
        pokemon: 'Garchomp-Mega-Z',
        item: 'Garchompite Z',
        ability: 'Sand Force',
        set: 'Garchomp-Mega-Z @ Garchompite Z\nAbility: Sand Force\nAdamant Nature\nEVs: 2 HP / 32 Atk / 32 Spe\n- Protect\n- Earthquake',
        customMetadata: { source: 'legacy', preserved: true },
      },
    },
  ];
}

function fakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  let writes = 0;
  return {
    get entries() {
      return entries;
    },
    get writes() {
      return writes;
    },
    storage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        writes += 1;
        entries.set(key, value);
      },
      removeItem: (key) => {
        writes += 1;
        entries.delete(key);
      },
    },
  };
}

test('canonicalMember reorders spreads and their EVs line only', () => {
  const original = member({
    spread: '32 Spe / 32 Atk / 2 HP',
    set: [
      'Pika @ Light Ball',
      'Ability: Static',
      'EVs: 32 Spe / 32 Atk / 2 HP',
      'Adamant Nature',
      '- Protect',
      '- Thunderbolt',
      'Custom note',
    ].join('\n'),
  });
  const canonical = canonicalMember(original);

  assert.equal(canonical.spread, '2 HP / 32 Atk / 32 Spe');
  assert.equal(
    canonical.set,
    [
      'Pika @ Light Ball',
      'Ability: Static',
      'EVs: 2 HP / 32 Atk / 32 Spe',
      'Adamant Nature',
      '- Protect',
      '- Thunderbolt',
      'Custom note',
    ].join('\n')
  );
  assert.equal(original.spread, '32 Spe / 32 Atk / 2 HP');
});

test('canonicalMember drops zeroes, rescales legacy spreads, and fixes nature casing', () => {
  assert.equal(
    canonicalMember(member({ spread: '0 HP / 32 Atk / 32 Spe' })).spread,
    '32 Atk / 32 Spe'
  );
  assert.equal(
    canonicalMember(member({ spread: '252 Atk / 252 Spe / 4 HP' })).spread,
    '1 HP / 32 Atk / 32 Spe'
  );
  const relaxed = canonicalMember(
    member({ nature: 'adamant', set: 'Pika\nadamant Nature\n- Protect' })
  );
  assert.equal(relaxed.nature, 'Adamant');
  assert.equal(relaxed.set, 'Pika\nAdamant Nature\n- Protect');
  assert.equal(
    canonicalMember(member({ nature: 'Not a nature' })).nature,
    'Not a nature'
  );
  assert.equal(canonicalMember(member({ nature: null })).nature, null);
});

test('canonicalMember preserves what it cannot canonicalize and is idempotent', () => {
  const unparseable = canonicalMember(member({ spread: 'lots of speed' }));
  assert.equal(unparseable.spread, 'lots of speed');
  const empty = canonicalMember(
    member({ spread: null, set: 'Pika\nEVs: 2 HP' })
  );
  assert.equal(empty.spread, null);
  assert.equal(empty.set, 'Pika\nEVs: 2 HP');
  const extra = canonicalMember(
    member({ spread: '32 Spe / 2 HP', metadata: { keep: true } })
  );
  assert.deepEqual(extra.metadata, { keep: true });
  assert.deepEqual(canonicalMember(extra), extra);
});

test('canonicalMember canonicalizes item, ability, and move spellings', () => {
  const canonical = canonicalMember(
    member({
      item: 'leftovers',
      ability: 'limber',
      moves: ['u-turn', 'protect'],
      spread: '32 Spe / 2 HP',
      set: [
        'Pika @ leftovers',
        'Ability: limber',
        'adamant Nature',
        'EVs: 32 Spe / 2 HP',
        '- u-turn',
      ].join('\n'),
    })
  );

  assert.equal(canonical.item, 'Leftovers');
  assert.equal(canonical.ability, 'Limber');
  assert.deepEqual(canonical.moves, ['U-turn', 'Protect']);
  assert.equal(
    canonical.set,
    [
      'Pika @ Leftovers',
      'Ability: Limber',
      'Adamant Nature',
      'EVs: 2 HP / 32 Spe',
      '- U-turn',
    ].join('\n')
  );

  const unknown = canonicalMember(
    member({
      item: 'Homebrew Item',
      ability: 'Not Real',
      moves: ['Totally Fake'],
    })
  );
  assert.equal(unknown.item, 'Homebrew Item');
  assert.equal(unknown.ability, 'Not Real');
  assert.deepEqual(unknown.moves, ['Totally Fake']);

  assert.deepEqual(
    canonicalMember(member({ moves: ['Protect', 'Fake Out'] })).moves,
    ['Protect', 'Fake Out']
  );
  assert.equal(
    canonicalMember(member({ item: 'Staraptorite' })).item,
    'Staraptorite'
  );
  assert.equal(
    canonicalMember(member({ set: 'Pika @ leftovers\nMystery @ sitrus berry' }))
      .set,
    'Pika @ Leftovers\nMystery @ sitrus berry'
  );
});

test('migrateStoredData rewrites legacy teams and current sets once', () => {
  const legacy = member({
    pokemon: 'Pokemon0',
    nature: 'adamant',
    spread: '32 Spe / 32 Atk / 2 HP',
    item: 'leftovers',
    ability: 'limber',
    moves: ['protect', 'u-turn'],
  });
  const members = Array.from({ length: 6 }, (_, index) =>
    index === 0
      ? legacy
      : member({
          pokemon: `Pokemon${index}`,
          nature: 'Adamant',
          spread: '32 HP',
        })
  );
  const team = {
    id: 'team',
    name: 'Team',
    original: {
      id: 'team',
      name: 'Team',
      regulation: 'M-B',
      pasteUrl: '',
      members,
      paste: null,
    },
    members,
    changeSlot: null,
    sources: [],
  };
  const store = fakeStorage({
    [storageKey]: JSON.stringify([team]),
    [currentSetsKey]: JSON.stringify([
      { id: 'pikachu', member: { ...legacy, pokemon: 'Pikachu' } },
    ]),
  });

  migrateStoredData(store.storage);
  const rawTeam = store.entries.get(storageKey);
  const rawSets = store.entries.get(currentSetsKey);
  for (const raw of [rawTeam, rawSets]) {
    assert.ok(raw.includes('"item":"Leftovers"'));
    assert.ok(raw.includes('"ability":"Limber"'));
    assert.ok(raw.includes('"moves":["Protect","U-turn"]'));
  }
  const savedTeam = JSON.parse(rawTeam)[0];
  assert.equal(savedTeam.members[0].spread, '2 HP / 32 Atk / 32 Spe');
  assert.equal(savedTeam.members[0].nature, 'Adamant');
  assert.equal(savedTeam.original.members[0].spread, '2 HP / 32 Atk / 32 Spe');
  assert.equal(savedTeam.members[1].spread, '32 HP');
  const savedSets = JSON.parse(store.entries.get(currentSetsKey));
  assert.equal(savedSets[0].member.spread, '2 HP / 32 Atk / 32 Spe');
  assert.equal(savedSets[0].member.nature, 'Adamant');

  const writes = store.writes;
  migrateStoredData(store.storage);
  assert.equal(store.writes, writes);
});

test('migrateStoredData leaves unreadable data untouched', () => {
  const store = fakeStorage({
    [storageKey]: '{"not":"a team list"',
    [currentSetsKey]: '{"not":"a set list"',
  });
  migrateStoredData(store.storage);
  assert.equal(store.writes, 0);
  assert.equal(store.entries.get(storageKey), '{"not":"a team list"');
  assert.equal(store.entries.get(currentSetsKey), '{"not":"a set list"');
});
function syncCacheRecord(fields) {
  return JSON.stringify({
    base: null,
    local: [],
    setsBase: null,
    setsLocal: [],
    ...fields,
  });
}
test('Mega-Z duplicates keep the canonical slot and drop the legacy one', () => {
  const pairs = [
    ['Garchomp', 'Garchomp-Mega-Z'],
    ['Lucario', 'Lucario-Mega-Z'],
    ['Absol', 'Absol-Mega-Z'],
  ];
  for (const [base, megaZ] of pairs) {
    const sets = [
      { id: pokemonId(base), member: member({ pokemon: base }) },
      { id: normalize(megaZ), member: member({ pokemon: megaZ }) },
    ];
    assert.deepEqual(
      resolveLegacyDuplicates(inspectCurrentSets(sets)).map(
        ({ originalId, id }) => [originalId, id]
      ),
      [[pokemonId(base), pokemonId(base)]]
    );
    const store = fakeStorage({
      [storageKey]: '[]',
      [currentSetsKey]: JSON.stringify(sets),
    });
    assert.deepEqual(readCurrentSets(store.storage), [
      { id: pokemonId(base), member: sets[0].member },
    ]);

    migrateStoredData(store.storage);
    assert.equal(store.writes, 1);
    assert.deepEqual(JSON.parse(store.entries.get(currentSetsKey)), [
      { id: pokemonId(base), member: sets[0].member },
    ]);
    migrateStoredData(store.storage);
    assert.equal(store.writes, 1);
  }
});

test('a lone legacy Mega-Z slot normalizes without touching its member', () => {
  const lone = [
    { id: 'garchompmegaz', member: member({ pokemon: 'Garchomp-Mega-Z' }) },
  ];
  assert.deepEqual(inspectRawCurrentSet(lone[0]), {
    originalId: 'garchompmegaz',
    id: 'garchomp',
    member: lone[0].member,
  });
  assert.deepEqual(readCurrentSetsValue(lone), [
    { id: 'garchomp', member: lone[0].member },
  ]);
  const read = fakeStorage({
    [currentSetsKey]: JSON.stringify(lone),
  });
  assert.deepEqual(readCurrentSets(read.storage), [
    { id: 'garchomp', member: lone[0].member },
  ]);
});

test('invalid registries reject without startup writes', () => {
  const error =
    'Current Pokémon sets could not be read. Existing data has been left untouched.';
  const savedTeams = '{ "saved": ["must", "stay", "byte-for-byte"] }';
  const pikachu = (changes) => ({ id: 'pikachu', member: member(changes) });
  const invalid = [
    [pikachu(), pikachu()],
    [{ id: 'unrelated', member: member({ pokemon: 'Garchomp-Mega-Z' }) }],
    [pikachu({ moves: ['Protect', 'protect'] })],
    [pikachu({ moves: ['A', 'B', 'C', 'D', 'E'] })],
    Array.from({ length: 1501 }, () => pikachu()),
    [{ id: 'pikachu', member: {} }],
  ];

  for (const sets of invalid) {
    const rawSets = JSON.stringify(sets);
    const store = fakeStorage({
      [storageKey]: savedTeams,
      [currentSetsKey]: rawSets,
    });
    assert.throws(() => readCurrentSets(store.storage), { message: error });
    migrateStoredData(store.storage);
    assert.equal(store.writes, 0);
    assert.equal(store.entries.get(currentSetsKey), rawSets);
    assert.equal(store.entries.get(storageKey), savedTeams);
  }
});

test('guarded writes roll back only values still owned by the operation', () => {
  const values = { one: 'before-one', two: 'before-two' };
  const before = Object.entries(values).map(([key, raw]) => ({ key, raw }));
  const changes = Object.entries(values).map(([key, raw]) => ({
    key,
    before: raw,
    after: `ours-${key}`,
  }));
  const apply = (target, writes = changes, guard) =>
    applyGuardedStorageWrites(target, before, writes, guard);
  const entries = new Map(Object.entries(values));
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem(key, value) {
      if (key === 'two') {
        entries.set('one', 'newer-sibling-write');
        throw new Error('quota');
      }
      entries.set(key, value);
    },
    removeItem: (key) => entries.delete(key),
  };
  assert.throws(() => apply(storage), { message: 'quota' });
  assert.equal(entries.get('one'), 'newer-sibling-write');
  assert.equal(entries.get('two'), 'before-two');
  assert.throws(() => apply(fakeStorage({ one: 'changed' }).storage), {
    message: /In-game sets changed while syncing/,
  });
  const rollback = fakeStorage({ one: 'before-one', two: 'before-two' });
  let ownerChecks = 0;
  assert.throws(
    () =>
      apply(rollback.storage, changes.slice(0, 1), () => {
        if (++ownerChecks === 3) throw new Error('account changed');
      }),
    { message: 'account changed' }
  );
  assert.equal(rollback.entries.get('one'), 'before-one');
  assert.equal(rollback.entries.get('two'), 'before-two');
});

test('staging batches canonical writes and persists canonical cache ids', () => {
  const aliases = Array.from({ length: 351 }, (_, i) => {
    const suffix = String(i).padStart(3, '0');
    return {
      id: `migration${suffix}megaz`,
      member: member({ pokemon: `Migration${suffix}-Mega-Z` }),
    };
  });
  const startup = fakeStorage({
    [storageKey]: '[]',
    [currentSetsKey]: JSON.stringify([
      aliases[0],
      { id: 'pikachu', member: member() },
    ]),
  });
  migrateStoredData(startup.storage);
  const startupWrites = startup.writes;
  assert.deepEqual(
    JSON.parse(startup.entries.get(currentSetsKey)).map(({ id }) => id),
    ['migration000', 'pikachu']
  );
  migrateStoredData(startup.storage);
  assert.equal(startup.writes, startupWrites);

  const remote = readCurrentSetsValue(aliases);
  const stored = {
    setIds: aliases.map(({ id }) => id).sort(),
    entries: aliases,
  };
  const first = stageCurrentSets(remote, remote, stored);
  const writeIds = first.writes.map(({ id }) => id);
  const deferredId = aliases.at(-1).id;
  assert.equal(first.writes.length, 350);
  assert.deepEqual(writeIds, [...writeIds].sort());
  assert.deepEqual(first.pendingIds, [remote.at(-1).id]);
  assert.deepEqual(first.setIds, [...writeIds, deferredId].sort());
  assert.ok(first.writes.every(({ id }) => id === pokemonId(id)));
  const rebased = rebaseStagedCurrentSets(remote, remote, first, stored);
  assert.ok(rebased.base.some(({ id }) => id === deferredId));
  const working = fakeStorage({
    [currentSetsKey]: JSON.stringify(rebased.local),
  });
  assert.ok(
    JSON.parse(working.entries.get(currentSetsKey)).some(
      ({ id }) => id === deferredId
    )
  );
  assert.deepEqual(readCurrentSets(working.storage), remote);

  const owner = 'demo:user';
  const cache = fakeStorage({
    [syncRecordKey(owner)]: syncCacheRecord({
      setsBase: rebased.base,
      setsLocal: rebased.local,
      extraRootField: { preserve: true },
    }),
  });
  const record = readSyncCache(cache.storage, owner);
  assert.deepEqual(record.setsLocal, remote);
  assert.deepEqual(record.rawSetsLocal, rebased.local);
  const written = writeSyncCache(cache.storage, owner, {
    base: null,
    local: [],
    setsBase: null,
    setsLocal: remote,
  });
  const reloaded = readSyncCacheSnapshot(cache.storage, owner).root;
  assert.equal(cache.entries.get(syncRecordKey(owner)), written);
  assert.deepEqual([reloaded.setsBase, reloaded.setsLocal], [null, remote]);
  assert.deepEqual(reloaded.extraRootField, { preserve: true });
  assert.equal(
    composeSyncCache(null, {
      base: null,
      local: [],
      setsBase: null,
      setsLocal: remote,
    }),
    JSON.stringify({
      base: null,
      local: [],
      setsBase: null,
      setsLocal: remote,
    })
  );

  const second = stageCurrentSets(
    first.committed,
    readCurrentSets(working.storage),
    {
      setIds: first.setIds,
      entries: [...stored.entries, ...first.writes],
    }
  );
  assert.deepEqual(
    [second.pendingIds, second.writes.map(({ id }) => id), second.setIds],
    [[], [remote.at(-1).id], remote.map(({ id }) => id).sort()]
  );
});

test('rebasing drops a wire alias the member no longer justifies', () => {
  const [base, megaZ] = legacyRegistry();
  const stored = { setIds: ['garchompmegaz'], entries: [megaZ] };
  const stage = (pending) => ({
    committed: [],
    pendingIds: [pending],
    setIds: ['garchompmegaz'],
    writes: [],
  });
  const local = [{ id: 'garchomp', member: base.member }];
  assert.deepEqual(
    rebaseStagedCurrentSets([], local, stage('garchomp'), stored).local,
    local
  );
  assert.deepEqual(
    rebaseStagedCurrentSets([], [megaZ], stage(megaZ.id), stored).local,
    [megaZ]
  );
});

test('cloud decoding resolves aliases and stages one canonical child', () => {
  const originals = legacyRegistry();
  const uid = 'test';
  const root = `users/${uid}`;
  const document = (entry) => ({
    path: `${root}/pokemonSets/${entry.id}`,
    data: entry,
  });
  const decode = (
    listed,
    probes = [],
    setIds = listed.map(({ data }) => data.id)
  ) =>
    decodeCurrentSetCloud({
      uid,
      manifestPath: `${root}/pokemonSetState/manifest`,
      manifest: {
        schemaVersion: 1,
        setIds: [...setIds].sort(),
        updatedAt: Timestamp.fromMillis(4),
      },
      listed,
      probes,
    });
  const [base, megaZ] = originals;
  const canonicalPath = `${root}/pokemonSets/garchomp`;
  const aliasOnly = decode(
    [document(megaZ)],
    [{ path: canonicalPath, data: null }]
  );
  assert.deepEqual(aliasOnly.canonical, [
    { id: 'garchomp', member: megaZ.member },
  ]);
  assert.deepEqual(aliasOnly.stored.setIds, ['garchompmegaz']);
  const aliasCurrent = readCurrentSetsValue([megaZ]);
  const aliasStage = stageCurrentSets(
    aliasOnly.canonical,
    aliasCurrent,
    aliasOnly.stored
  );
  assert.deepEqual(
    [aliasStage.writes, aliasStage.setIds],
    [aliasCurrent, ['garchomp']]
  );

  const stale = {
    ...base,
    member: { ...base.member, item: 'Choice Scarf' },
  };
  const both = decode([document(stale), document(megaZ)]);
  assert.deepEqual(both.canonical, [{ id: 'garchomp', member: stale.member }]);
  assert.ok(both.stored.entries.some(({ id }) => id === 'garchompmegaz'));
  const desired = [{ id: 'garchomp', member: base.member }];
  const bothStage = stageCurrentSets(both.canonical, desired, both.stored);
  assert.deepEqual(bothStage.writes, desired);
  assert.deepEqual(bothStage.setIds, ['garchomp']);

  const raw = {
    id: 'pikachu',
    member: member({
      nature: 'adamant',
      spread: '32 Spe / 32 Atk / 2 HP',
    }),
  };
  const rawDecoded = decode([document(raw)]);
  assert.equal(rawDecoded.entries[0].member.nature, 'adamant');
  assert.deepEqual(rawDecoded.stored.entries, [raw]);
  const canonicalRaw = [{ id: raw.id, member: canonicalMember(raw.member) }];
  assert.deepEqual(
    stageCurrentSets(rawDecoded.canonical, canonicalRaw, rawDecoded.stored)
      .writes,
    canonicalRaw
  );

  const invalidMember = {
    ...megaZ,
    member: { ...megaZ.member, moves: ['Protect', 'Protect'] },
  };
  const invalid = [
    () => decode([], [], ['garchompmegaz']),
    () =>
      decode(
        [{ path: `${root}/pokemonSets/garchomp`, data: megaZ }],
        [],
        ['garchompmegaz']
      ),
    () => decode([document(invalidMember)]),
    () => decode([document(megaZ)]),
    () => decode([document(megaZ)], [], ['garchompmegaz', 'garchompmegaz']),
  ];
  for (const run of invalid)
    assert.throws(run, {
      message: /Cloud current Pokémon sets could not be read/,
    });
});
