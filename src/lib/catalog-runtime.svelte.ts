import bundledCatalog, {
  defaultCatalogEndpoint,
  fetchCatalogUpdate,
  tags as bundledTags,
  selectStoredCatalogBundle,
  type CatalogBundle,
  type CatalogData,
} from './catalog-data.ts';
import { admittedTeams } from './catalog.ts';
import type { TeamTagsIndex } from './tags.ts';
import {
  catalogNewsKey,
  nextCatalogNews,
  readCatalogNews,
  readNotificationSettings,
  type CatalogNews,
} from './catalog-news.ts';
import { AtlasNative, isNativeApp, type CatalogWatchResult } from './native.ts';

const DB_NAME = 'champions-atlas-catalog';
const STORE_NAME = 'bundles';
const ACTIVE_KEY = 'active';
const VISIBILITY_THROTTLE_MS = 5 * 60 * 1000;
const VISIT_GAP_MS = 60 * 60 * 1000;

function admittedCatalog(catalog: CatalogData): CatalogData {
  return {
    ...catalog,
    teams: admittedTeams(catalog.teams, catalog.currentRegulation),
  };
}

class CatalogRuntimeState {
  catalog = $state.raw<CatalogData>(admittedCatalog(bundledCatalog));
  tags = $state.raw<TeamTagsIndex>(bundledTags);
  ready = $state(false);
  freshIds = $state.raw<ReadonlySet<string>>(new Set());
}

export const catalogState = new CatalogRuntimeState();

let activeBundleHash: string | undefined;
let initPromise: Promise<void> | null = null;
let refreshPromise: Promise<boolean> | null = null;
let lastVisibilityRefreshAt = 0;
let news: CatalogNews | null = null;
let hiddenAt = 0;

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
  catalogState.catalog = admittedCatalog(bundle);
  catalogState.tags = bundle.tags;
  activeBundleHash = bundleHash ?? bundle.bundleHash;
}

export async function publishCatalogWatch(): Promise<CatalogWatchResult | null> {
  if (!isNativeApp || !news) return null;
  try {
    return await AtlasNative.setCatalogWatch({
      enabled: readNotificationSettings(localStorage).newTeams,
      endpoint: defaultCatalogEndpoint(),
      bundleHash: activeBundleHash ?? null,
      knownIds: [...news.known, ...news.fresh],
    });
  } catch {
    return null;
  }
}

function trackNews(newVisit: boolean): void {
  news = nextCatalogNews(
    news,
    catalogState.catalog.teams.map((team) => team.id),
    newVisit
  );
  catalogState.freshIds = new Set(news.fresh);
  try {
    localStorage.setItem(catalogNewsKey, JSON.stringify(news));
  } catch {
    void 0;
  }
  void publishCatalogWatch();
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
      if (catalogState.ready) trackNews(false);
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
    if (document.visibilityState !== 'visible') {
      hiddenAt = Date.now();
      return;
    }
    const now = Date.now();
    if (catalogState.ready && hiddenAt && now - hiddenAt >= VISIT_GAP_MS)
      trackNews(true);
    hiddenAt = 0;
    if (now - lastVisibilityRefreshAt < VISIBILITY_THROTTLE_MS) return;
    lastVisibilityRefreshAt = now;
    void refreshCatalogNow();
  });

  initPromise = (async () => {
    try {
      const stored = await readStoredBundle();
      if (stored !== undefined) {
        const bundle = selectStoredCatalogBundle(
          stored,
          bundledCatalog.updatedAt
        );
        if (bundle) {
          applyValidatedBundle(bundle, bundle.bundleHash);
        } else {
          await deleteStoredBundle().catch(() => undefined);
        }
      }
    } catch {
      void 0;
    } finally {
      news = readCatalogNews(localStorage);
      trackNews(true);
      catalogState.ready = true;
      lastVisibilityRefreshAt = Date.now();
      void refreshCatalogNow();
    }
  })();

  return initPromise;
}
