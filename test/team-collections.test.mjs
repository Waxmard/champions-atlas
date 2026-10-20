import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveSavedTeamId,
  teamsInUse,
  addCatalogToWishlist,
  useCatalogTeam,
  useWishlistedTeam,
  removeWishlistedTeam,
  rankSavedTeams,
} from '../src/lib/team-collections.ts';
import {
  newSavedTeam,
  readSavedTeams,
  saveTeam,
} from '../src/lib/workbench.ts';

const species = [
  'Weavile',
  'Rotom-Wash',
  'Amoonguss',
  'Incineroar',
  'Landorus-Therian',
  'Flutter Mane',
];
const catalogTeam = (id, name = id, roster = species) => ({
  id,
  name,
  sheetIds: [],
  creator: '',
  regulation: 'M-C',
  publishedAt: '',
  pasteUrl: '',
  replicaCode: null,
  replicaStatus: '',
  reports: [],
  members: roster.map((pokemon) => ({
    pokemon,
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread: null,
  })),
  paste: null,
  pasteNotes: null,
});
const snapshot = (id, name = id, roster = species) => ({
  ...newSavedTeam(catalogTeam(id, name, roster)),
  id,
});
const storage = (teams = []) => ({
  data: JSON.stringify(teams),
  writes: 0,
  getItem() {
    return this.data;
  },
  setItem(_key, value) {
    this.data = value;
    this.writes++;
  },
});
const names = (...labels) =>
  labels.map((name, i) => ({
    ...snapshot(
      String(i),
      name,
      species.map((_, j) => `Other${i}${j}`)
    ),
  }));

test('legacy teams default to My Teams without rewriting; Wishlist is excluded from resolution', () => {
  const legacy = snapshot('legacy');
  delete legacy.collection;
  const s = storage([legacy]);
  assert.equal(readSavedTeams(s)[0].collection, undefined);
  assert.equal(s.writes, 0);
  const list = [
    snapshot('a'),
    { ...snapshot('w'), collection: 'wishlist' },
    snapshot('b'),
  ];
  assert.deepEqual(
    teamsInUse(list).map((x) => x.id),
    ['a', 'b']
  );
});

test('Wishlist deduplicates catalog IDs and promotion preserves the exact saved snapshot', () => {
  const s = storage();
  const first = addCatalogToWishlist(s, catalogTeam('source'));
  const writes = s.writes;
  assert.equal(addCatalogToWishlist(s, catalogTeam('source')).id, first.id);
  assert.equal(s.writes, writes);
  const other = addCatalogToWishlist(s, catalogTeam('other'));
  const changed = {
    ...first,
    name: 'Edited',
    members: first.members.map((m, i) => (i ? m : { ...m, set: 'raw set' })),
    sources: [
      { name: 'Source', pasteUrl: 'https://pokepast.es/abcdef1234567890' },
    ],
  };
  saveTeam(s, changed);
  const before = readSavedTeams(s).find((x) => x.id === first.id);
  const promoted = useWishlistedTeam(s, first.id);
  assert.equal(promoted.collection, 'my-teams');
  assert.equal(promoted.id, first.id);
  assert.deepEqual(promoted.original, before.original);
  assert.deepEqual(promoted.members, before.members);
  assert.deepEqual(promoted.sources, before.sources);
  assert.equal(useWishlistedTeam(s, first.id).name, 'Edited');
  assert.equal(
    readSavedTeams(s).find((x) => x.id === other.id).collection,
    'wishlist'
  );
  assert.throws(
    () => removeWishlistedTeam(s, first.id),
    /no longer in Wishlist/
  );
});

test('catalog Use promotes bookmarks and preserves independent repeated copies', () => {
  const s = storage();
  const bookmark = addCatalogToWishlist(s, catalogTeam('catalog'));
  assert.equal(useCatalogTeam(s, catalogTeam('catalog')).id, bookmark.id);
  const first = useCatalogTeam(s, catalogTeam('unbookmarked'));
  const second = useCatalogTeam(s, catalogTeam('unbookmarked'));
  assert.notEqual(first.id, second.id);
  assert.throws(() => useWishlistedTeam(s, 'absent'), /no longer saved/);
  assert.throws(
    () => removeWishlistedTeam(s, bookmark.id),
    /no longer in Wishlist/
  );
  const result = removeWishlistedTeam(s, 'absent');
  assert.equal(result.length, 3);
  assert.equal(removeWishlistedTeam(s, 'absent').length, result.length);
});

test('invalid collection, corrupt storage, quota, and capacity preserve existing data', () => {
  const invalid = storage([{ ...snapshot('bad'), collection: 'lost' }]);
  const raw = invalid.data;
  assert.throws(() => readSavedTeams(invalid));
  assert.equal(invalid.data, raw);
  const quota = storage();
  quota.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(() => addCatalogToWishlist(quota, catalogTeam('x')), /quota/);
  const full = storage(
    Array.from({ length: 50 }, (_, i) => snapshot(String(i)))
  );
  const fullRaw = full.data;
  assert.throws(() => addCatalogToWishlist(full, catalogTeam('x')));
  assert.equal(full.data, fullRaw);
  const corrupt = storage();
  corrupt.data = '{';
  assert.throws(() => readSavedTeams(corrupt));
});

test('search uses exact, prefix, substring, subsequence tiers, AND terms, and stable ties', () => {
  const teams = names(
    'weavile',
    'weavile squad',
    'good weavile group',
    'w x e x a x v x i x l x e',
    'rotom'
  );
  teams[4].members[0].pokemon = 'Rotom-Wash';
  teams[4].members[1].pokemon = 'Weavile';
  const ranked = rankSavedTeams(teams, 'weavile');
  assert.deepEqual(
    ranked.map((x) => x.id),
    ['0', '4', '1', '2', '3']
  );
  assert.deepEqual(
    rankSavedTeams(teams, 'wv').map((x) => x.id),
    ['0', '1', '2', '3', '4']
  );
  assert.deepEqual(
    rankSavedTeams(teams, 'weavile rotom').map((x) => x.id),
    ['4']
  );
  assert.deepEqual(rankSavedTeams(teams, '!!!'), teams);
  assert.deepEqual(rankSavedTeams(teams, 'nomatch'), []);
});

const wish = (id, roster) => ({
  ...snapshot(id, id, roster),
  collection: 'wishlist',
});
const failing = (teams) => {
  const s = storage(teams);
  s.setItem = () => {
    throw new Error('quota');
  };
  return s;
};

test('requested, active and fallback IDs never resolve to Wishlist entries', () => {
  const list = [wish('w1'), snapshot('a'), wish('w2'), snapshot('b')];
  assert.equal(resolveSavedTeamId(list, 'w1', null), 'a');
  assert.equal(resolveSavedTeamId(list, null, 'w2'), 'a');
  assert.equal(resolveSavedTeamId(list, 'w1', 'w2'), 'a');
  assert.equal(resolveSavedTeamId(list, 'b', 'w2'), 'b');
  assert.equal(resolveSavedTeamId(list, 'w1', 'a'), 'a');
  assert.equal(resolveSavedTeamId([wish('w1'), wish('w2')], null, 'w1'), null);
  assert.equal(resolveSavedTeamId([], null, null), null);
});

test('bookmarking leaves existing My Teams copies untouched and stays idempotent', () => {
  const s = storage();
  const copy = useCatalogTeam(s, catalogTeam('source'));
  const copyBefore = JSON.stringify(
    readSavedTeams(s).find((x) => x.id === copy.id)
  );
  const bookmark = addCatalogToWishlist(s, catalogTeam('source'));
  assert.notEqual(bookmark.id, copy.id);
  assert.equal(bookmark.collection, 'wishlist');
  const afterAdd = s.data;
  const writes = s.writes;
  assert.equal(addCatalogToWishlist(s, catalogTeam('source')).id, bookmark.id);
  assert.equal(s.data, afterAdd);
  assert.equal(s.writes, writes);
  const saved = readSavedTeams(s);
  assert.equal(saved.length, 2);
  assert.equal(JSON.stringify(saved.find((x) => x.id === copy.id)), copyBefore);
  assert.equal(saved.find((x) => x.id === copy.id).collection, undefined);
});

test('removing a bookmark deletes only it with one write; absent IDs write nothing', () => {
  const keep = snapshot('keep');
  const s = storage([keep, wish('w1'), wish('w2')]);
  const remaining = removeWishlistedTeam(s, 'w1');
  assert.deepEqual(
    remaining.map((x) => x.id),
    ['keep', 'w2']
  );
  assert.equal(s.writes, 1);
  assert.deepEqual(
    readSavedTeams(s).map((x) => x.id),
    ['keep', 'w2']
  );
  const raw = s.data;
  assert.deepEqual(
    removeWishlistedTeam(s, 'w1').map((x) => x.id),
    ['keep', 'w2']
  );
  assert.equal(s.writes, 1);
  assert.equal(s.data, raw);
});

test('quota failure during promotion or removal leaves stored bytes unchanged', () => {
  const s = failing([snapshot('keep'), wish('w1')]);
  const raw = s.data;
  assert.throws(() => useWishlistedTeam(s, 'w1'), /quota/);
  assert.throws(() => useCatalogTeam(s, catalogTeam('w1')), /quota/);
  assert.throws(() => removeWishlistedTeam(s, 'w1'), /quota/);
  assert.equal(s.data, raw);
  assert.equal(readSavedTeams(s)[1].collection, 'wishlist');
});

test('at the 50-record cap promotion works but new bookmarks and copies fail untouched', () => {
  const full = [
    ...Array.from({ length: 49 }, (_, i) => snapshot(`t${i}`)),
    wish('w'),
  ];
  const s = storage(full);
  const raw = s.data;
  assert.throws(() => addCatalogToWishlist(s, catalogTeam('new')));
  assert.throws(() => useCatalogTeam(s, catalogTeam('new')));
  assert.equal(s.data, raw);
  assert.equal(s.writes, 0);
  const promoted = useCatalogTeam(s, catalogTeam('w'));
  assert.equal(promoted.id, 'w');
  assert.equal(promoted.collection, 'my-teams');
  const saved = readSavedTeams(s);
  assert.equal(saved.length, 50);
  assert.equal(teamsInUse(saved).length, 50);
  assert.equal(s.writes, 1);
});

test('empty query keeps order and search ignores originals and items', () => {
  const teams = names('alpha', 'beta');
  assert.equal(rankSavedTeams(teams, ''), teams);
  assert.equal(rankSavedTeams(teams, '   '), teams);
  const edited = {
    ...teams[0],
    original: {
      ...teams[0].original,
      name: 'Original Hidden',
      members: teams[0].original.members.map((m) => ({
        ...m,
        pokemon: 'Garchomp',
      })),
    },
    members: teams[0].members.map((m) => ({ ...m, item: 'Choice Scarf' })),
  };
  assert.deepEqual(rankSavedTeams([edited], 'garchomp'), []);
  assert.deepEqual(rankSavedTeams([edited], 'hidden'), []);
  assert.deepEqual(rankSavedTeams([edited], 'scarf'), []);
  assert.deepEqual(
    rankSavedTeams([edited], 'alpha').map((x) => x.id),
    [edited.id]
  );
});
