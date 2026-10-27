import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import {
  addCatalogToWishlist,
  removeWishlistedTeam,
  useWishlistedTeam,
} from '../src/lib/team-collections.ts';
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
function install(storage, confirm) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'confirm', {
    configurable: true,
    writable: true,
    value: confirm,
  });
}

test('catalog toggle adds, cancels and removes without changing an in-use copy', () => {
  const s = storage();
  const catalog = team();
  const inUse = newSavedTeam(catalog);
  saveTeam(s, inUse);
  const inUseBefore = readSavedTeams(s)[0];
  s.setItem(activeTeamKey, inUse.id);
  install(s, () => {
    throw new Error('Unexpected confirmation');
  });

  assert.deepEqual(toggleCatalogWishlist(catalog), {
    error: '',
    status: 'Added to Wishlist.',
  });
  const bookmark = readSavedTeams(s).find((entry) => entry.id !== inUse.id);
  saveTeam(s, { ...bookmark, name: 'Edited copy' });
  const before = s.getItem(storageKey);
  install(s, (message) => {
    assert.equal(
      message,
      'Remove “Edited copy” from Wishlist? This deletes this saved copy and its edits. My teams copies are unchanged.'
    );
    return false;
  });
  assert.deepEqual(toggleCatalogWishlist(catalog), { error: '', status: '' });
  assert.equal(s.getItem(storageKey), before);

  install(s, () => true);
  assert.deepEqual(toggleCatalogWishlist(catalog), {
    error: '',
    status: 'Removed from Wishlist.',
  });
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
  install(s, () => true);
  assert.deepEqual(toggleCatalogWishlist(catalog), {
    error: '',
    status: 'Removed from Wishlist.',
  });
  assert.deepEqual(readSavedTeams(s), []);

  saveTeam(s, imported);
  saveTeam(s, { ...newSavedTeam(catalog), collection: 'wishlist' });
  const before = s.getItem(storageKey);
  install(s, () => {
    throw new Error('Unexpected confirmation');
  });
  assert.deepEqual(toggleCatalogWishlist(catalog), {
    error:
      'Multiple copies are in Wishlist. Remove them from Wishlist individually.',
    status: '',
  });
  assert.equal(s.getItem(storageKey), before);
});

test('catalog removal rejects records changed during confirmation', () => {
  const changes = [
    (s, entry) => saveTeam(s, { ...entry, name: 'Changed name' }),
    (s, entry) =>
      saveTeam(s, {
        ...entry,
        members: entry.members.map((member, index) =>
          index ? member : { ...member, item: 'Changed item' }
        ),
      }),
    (s, entry) =>
      saveTeam(s, {
        ...entry,
        sources: [{ name: 'Changed source', pasteUrl }],
      }),
    (s, entry) => useWishlistedTeam(s, entry.id),
    (s, entry) => removeWishlistedTeam(s, entry.id),
  ];
  for (const change of changes) {
    const s = storage();
    const catalog = team();
    const bookmark = addCatalogToWishlist(s, catalog);
    let afterChange;
    install(s, () => {
      change(s, bookmark);
      afterChange = s.getItem(storageKey);
      return true;
    });
    assert.deepEqual(toggleCatalogWishlist(catalog), {
      error: 'This Wishlist team changed. Refresh before removing it.',
      status: '',
    });
    assert.equal(s.getItem(storageKey), afterChange);
  }
});

test('catalog toggle leaves existing data untouched on storage failure', () => {
  const s = storage();
  const existing = newSavedTeam(team('existing'));
  saveTeam(s, existing);
  const before = s.getItem(storageKey);
  s.setItem = () => {
    throw new Error('quota');
  };
  install(s, () => true);
  assert.deepEqual(toggleCatalogWishlist(team()), {
    error:
      'Could not save this team. Check browser storage access and available space. Existing saved teams were not replaced.',
    status: '',
  });
  assert.equal(s.getItem(storageKey), before);
});
