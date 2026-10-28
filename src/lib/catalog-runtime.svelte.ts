import bundledCatalog, {
  fetchCatalogUpdate,
  tags as bundledTags,
  validateCatalogBundle,
  type CatalogBundle,
  type CatalogData,
} from './catalog-data.ts';
import type { TeamTagsIndex } from './tags.ts';

const DB_NAME = 'champions-atlas-catalog';
const STORE_NAME = 'bundles';
const ACTIVE_KEY = 'active';
const VISIBILITY_THROTTLE_MS = 5 * 60 * 1000;

class CatalogRuntimeState {
  catalog = $state.raw<CatalogData>(bundledCatalog);
  tags = $state.raw<TeamTagsIndex>(bundledTags);
  ready = $state(false);
}

export const catalogState = new CatalogRuntimeState();

let activeBundleHash: string | undefined;
let initPromise: Promise<void> | null = null;
let refreshPromise: Promise<boolean> | null = null;
let lastVisibilityRefreshAt = 0;

function openCatalogDb(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is unavailable.'));
    return promise;
  }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(request.error ?? new Error('IndexedDB open failed.'));
  return promise;
}

async function readStoredBundle(): Promise<unknown> {
  const db = await openCatalogDb();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(ACTIVE_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB read failed.'));
    return await promise;
  } finally {
    db.close();
  }
}

async function writeStoredBundle(
  bundle: CatalogBundle,
  bundleHash?: string
): Promise<void> {
  const db = await openCatalogDb();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(
      bundleHash ? { ...bundle, bundleHash } : bundle,
      ACTIVE_KEY
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB write aborted.'));
    await promise;
  } finally {
    db.close();
  }
}

async function deleteStoredBundle(): Promise<void> {
  const db = await openCatalogDb();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(ACTIVE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB delete failed.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB delete aborted.'));
    await promise;
  } finally {
    db.close();
  }
}

function applyValidatedBundle(
  bundle: CatalogBundle,
  bundleHash?: string
): void {
  catalogState.catalog = bundle;
  catalogState.tags = bundle.tags;
  activeBundleHash = bundleHash ?? bundle.bundleHash;
}

export function refreshCatalogNow(options?: {
  endpoint?: string;
  fetcher?: typeof fetch;
}): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const update = await fetchCatalogUpdate(
        {
          updatedAt: catalogState.catalog.updatedAt,
          sourceHash: catalogState.catalog.sourceHash,
          bundleHash: activeBundleHash,
        },
        options
      );
      if (!update) return false;
      await writeStoredBundle(update.bundle, update.bundleHash).catch(
        () => undefined
      );
      applyValidatedBundle(update.bundle, update.bundleHash);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export function initCatalogRuntime(): Promise<void> {
  if (typeof window === 'undefined') {
    catalogState.ready = true;
    return Promise.resolve();
  }
  if (initPromise) return initPromise;

  window.addEventListener('online', () => {
    void refreshCatalogNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastVisibilityRefreshAt < VISIBILITY_THROTTLE_MS) return;
    lastVisibilityRefreshAt = now;
    void refreshCatalogNow();
  });

  initPromise = (async () => {
    try {
      const stored = await readStoredBundle();
      if (stored !== undefined) {
        try {
          const bundle = validateCatalogBundle(stored);
          if (
            Date.parse(bundle.updatedAt) >= Date.parse(bundledCatalog.updatedAt)
          ) {
            applyValidatedBundle(bundle, bundle.bundleHash);
          } else {
            await deleteStoredBundle().catch(() => undefined);
          }
        } catch {
          await deleteStoredBundle().catch(() => undefined);
        }
      }
    } catch {
      void 0;
    } finally {
      catalogState.ready = true;
      lastVisibilityRefreshAt = Date.now();
      void refreshCatalogNow();
    }
  })();

  return initPromise;
}
