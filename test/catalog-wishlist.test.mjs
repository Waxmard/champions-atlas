import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import {
  activeTeamKey,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  storageKey,
} from '../src/lib/workbench.ts';

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
  s.setItem(activeTeamKey, inUse.id);
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
  assert.equal(s.getItem(activeTeamKey), inUse.id);
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
