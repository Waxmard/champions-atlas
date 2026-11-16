import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import {
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  storageKey,
} from '../src/lib/workbench.ts';
import * as collections from '../src/lib/team-collections.ts';
import { canonicalSnapshot } from '../src/lib/team-history.ts';

const mocks = new Map([
  ['$app/navigation', 'export async function goto() {}'],
  ['$app/paths', 'export const resolve = (path) => path'],
  ['./sync.svelte', 'export async function pushNow() {}'],
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith('/src/lib/saved-team-actions.ts'))
      return next(specifier, context);
    const source = mocks.get(specifier);
    if (source)
      return {
        url: `data:text/javascript,${encodeURIComponent(source)}`,
        shortCircuit: true,
      };
    if (specifier === './team-collections' || specifier === './workbench')
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { toggleCatalogWishlist } =
  await import('../src/lib/saved-team-actions.ts');
hooks.deregister();

const globals = ['localStorage', 'confirm'].map((name) => [
  name,
  Object.getOwnPropertyDescriptor(globalThis, name),
]);
test.after(() => {
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const pasteUrl = 'https://pokepast.es/abcdef1234567890';
const team = (id = 'catalog') => ({
  id,
  name: 'Catalog team',
  sheetIds: [],
  creator: '',
  regulation: 'M-C',
  publishedAt: '',
  pasteUrl,
  replicaCode: null,
  replicaStatus: '',
  reports: [],
  members: [
    'Weavile',
    'Rotom-Wash',
    'Amoonguss',
    'Incineroar',
    'Landorus-Therian',
    'Flutter Mane',
  ].map((pokemon) => ({
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
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
function install(storage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'confirm', {
    configurable: true,
    writable: true,
    value: () => {
      throw new Error('Unexpected confirmation');
    },
  });
}

test('catalog toggle adds and removes without changing an in-use copy', () => {
  const s = storage();
  const catalog = team();
  const inUse = newSavedTeam(catalog);
  saveTeam(s, inUse);
  const inUseBefore = readSavedTeams(s)[0];
  install(s);

  const added = toggleCatalogWishlist(catalog);
  assert.equal(added.error, '');
  assert.ok(added.status);
  const bookmark = readSavedTeams(s).find((entry) => entry.id !== inUse.id);
  saveTeam(s, { ...bookmark, name: 'Edited copy' });
  const removed = toggleCatalogWishlist(catalog);
  assert.equal(removed.error, '');
  assert.ok(removed.status);
  assert.deepEqual(readSavedTeams(s), [inUseBefore]);
});

test('catalog toggle matches a Wishlist copy by source URL and rejects multiple matches', () => {
  const s = storage();
  const catalog = team();
  const imported = {
    ...newSavedTeam(team('imported')),
    origin: 'custom',
    collection: 'wishlist',
  };
  saveTeam(s, imported);
  install(s);
  const removed = toggleCatalogWishlist(catalog);
  assert.equal(removed.error, '');
  assert.ok(removed.status);
  assert.deepEqual(readSavedTeams(s), []);

  saveTeam(s, imported);
  saveTeam(s, { ...newSavedTeam(catalog), collection: 'wishlist' });
  const before = s.getItem(storageKey);
  assert.match(
    toggleCatalogWishlist(catalog).error,
    /Multiple copies are in Wishlist/
  );
  assert.equal(s.getItem(storageKey), before);
});

test('catalog toggle leaves existing data untouched on storage failure', () => {
  const s = storage();
  const existing = newSavedTeam(team('existing'));
  saveTeam(s, existing);
  const before = s.getItem(storageKey);
  s.setItem = () => {
    throw new Error('quota');
  };
  install(s);
  assert.ok(toggleCatalogWishlist(team()).error);
  assert.equal(s.getItem(storageKey), before);
});

const bookmark = (id) => ({
  ...newSavedTeam({ ...team(id), pasteUrl: '' }),
  id,
  collection: 'wishlist',
});

test('Wishlist ordering persists safely through edits and collection changes', () => {
  const a = bookmark('A');
  a.name = 'Edited name';
  a.members[0].set = 'Edited raw set';
  a.sources = [{ name: 'Source', pasteUrl: team().pasteUrl, note: 'Kept' }];
  const initial = [
    a,
    newSavedTeam(team('mine')),
    bookmark('B'),
    newSavedTeam(team('mine-two')),
    bookmark('C'),
  ];
  let raw = JSON.stringify(initial);
  let writes = 0;
  const storage = {
    getItem: () => raw,
    setItem: (key, value) => {
      assert.equal(key, storageKey);
      raw = value;
      writes++;
    },
  };
  const order = () =>
    collections.orderedWishlist(readSavedTeams(storage)).map(({ id }) => id);
  const before = readSavedTeams(storage);
  assert.deepEqual(order(), ['C', 'B', 'A']);
  assert.equal(writes, 0);
  const after = collections.reorderWishlist(storage, ['A', 'C', 'B'], order());
  assert.deepEqual(order(), ['A', 'C', 'B']);
  assert.equal(writes, 1);
  assert.deepEqual(
    JSON.parse(raw).map(({ wishlistOrder }) => wishlistOrder ?? null),
    [0, null, 2, null, 1]
  );
  for (const [index, entry] of before.entries()) {
    const actual = structuredClone(after[index]);
    delete actual.wishlistOrder;
    assert.deepEqual(actual, entry);
  }
  collections.reorderWishlist(storage, order(), order());
  assert.equal(writes, 1);
  const mine = before[1];
  saveTeam(storage, { ...mine, name: 'Renamed', wishlistOrder: 88 });
  const inUse = readSavedTeams(storage).filter(collections.isSavedTeam);
  assert.deepEqual(
    inUse.map(({ id }) => id),
    [before[3].id, mine.id]
  );
  assert.equal(Object.hasOwn(inUse[1], 'wishlistOrder'), false);
  const d = { ...team('D'), pasteUrl: '' };
  const added = collections.addCatalogToWishlist(storage, d);
  assert.deepEqual(order(), [added.id, 'A', 'C', 'B']);
  const addedRaw = raw;
  assert.equal(collections.addCatalogToWishlist(storage, d).id, added.id);
  assert.equal(raw, addedRaw);
  saveTeam(storage, { ...a, name: 'New name' });
  saveTeam(storage, { ...a, wishlistOrder: 99 });
  assert.equal(
    readSavedTeams(storage).find(({ id }) => id === 'A').wishlistOrder,
    0
  );
  const promoted = collections.useWishlistedTeam(storage, 'C');
  assert.equal(Object.hasOwn(promoted, 'wishlistOrder'), false);
  assert.deepEqual(order(), [added.id, 'A', 'B']);
  const moved = collections.moveSavedTeamToWishlist(
    storage,
    'C',
    canonicalSnapshot({ name: promoted.name, members: promoted.members })
  );
  assert.equal(Object.hasOwn(moved, 'wishlistOrder'), false);
  assert.deepEqual(order(), ['C', added.id, 'A', 'B']);
});

test('Wishlist reorder rejects stale and invalid lists without writing', () => {
  const s = storage();
  s.setItem(storageKey, JSON.stringify(['A', 'B', 'C'].map(bookmark)));
  const initial = s.getItem(storageKey);
  let writes = 0;
  const setItem = s.setItem;
  s.setItem = (key, value) => {
    writes++;
    setItem(key, value);
  };
  const expected = ['C', 'B', 'A'];
  const invalidMessage =
    'Could not reorder Wishlist. Refresh the list and try again.';
  const staleMessage = 'Wishlist changed elsewhere. Refresh before reordering.';
  const rejects = (proposed, baseline, message) =>
    assert.throws(
      () => collections.reorderWishlist(s, proposed, baseline),
      (error) =>
        error instanceof collections.SavedTeamError && error.message === message
    );
  for (const ids of [
    ['C', 'B'],
    ['C', 'B', 'B'],
    ['C', 'B', 'foreign'],
    ['C', 'B', 'A', 'foreign'],
  ])
    rejects(ids, expected, invalidMessage);
  rejects(expected, ['B', 'C', 'A'], staleMessage);
  rejects(expected, ['B', 'A'], staleMessage);
  assert.equal(s.getItem(storageKey), initial);
  assert.equal(writes, 0);
  collections.removeWishlistedTeam(s, 'C');
  const removed = s.getItem(storageKey);
  rejects(expected.toReversed(), expected, staleMessage);
  assert.equal(s.getItem(storageKey), removed);
  assert.equal(writes, 1);
});

test('Wishlist reorder preserves data on corrupt or unavailable storage', () => {
  const s = storage();
  s.setItem(storageKey, JSON.stringify(['A', 'B'].map(bookmark)));
  const initial = s.getItem(storageKey);
  const quota = {
    ...s,
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.throws(
    () => collections.reorderWishlist(quota, ['A', 'B'], ['B', 'A']),
    /quota/
  );
  assert.equal(s.getItem(storageKey), initial);
  const corrupt = { getItem: () => '{', setItem: () => assert.fail() };
  assert.throws(
    () => collections.reorderWishlist(corrupt, [], []),
    SyntaxError
  );
  const unavailable = {
    getItem: () => {
      throw new Error('unavailable');
    },
    setItem: () => assert.fail(),
  };
  assert.throws(
    () => collections.reorderWishlist(unavailable, [], []),
    /unavailable/
  );
  for (const wishlistOrder of [0.5, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    const broken = JSON.stringify([{ ...bookmark('bad'), wishlistOrder }]);
    const unreadable = { getItem: () => broken, setItem: () => assert.fail() };
    assert.throws(
      () => collections.reorderWishlist(unreadable, [], []),
      /untouched/
    );
  }
});

test('equal Wishlist ranks sort by IDs independently of input order', () => {
  const entries = ['c', 'a', 'b'].map((id) => ({
    ...newSavedTeam(team(id)),
    id,
    collection: 'wishlist',
    wishlistOrder: 1,
  }));
  const ids = (teams) => collections.orderedWishlist(teams).map(({ id }) => id);
  assert.deepEqual(ids(entries), ['a', 'b', 'c']);
  assert.deepEqual(ids(entries.toReversed()), ids(entries));
});
