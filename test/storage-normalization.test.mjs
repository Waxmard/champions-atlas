import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalMember } from '../src/lib/paste.ts';
import { migrateStoredData } from '../src/lib/storage-migration.ts';
import { storageKey } from '../src/lib/workbench.ts';
import { currentSetsKey } from '../src/lib/current-sets.ts';

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
