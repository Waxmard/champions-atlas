import {
  readBattleFormat,
  teamFormat,
  writeBattleFormat,
  type BattleFormat,
} from './battle-format.ts';
import bundledCatalog, {
  fetchCatalogUpdate,
  tags as bundledTags,
  mergeYoutubeCopies,
  selectStoredCatalogBundle,
  type CatalogBundle,
  type CatalogData,
} from './catalog-data.ts';
import { admittedTeams } from './catalog.ts';
import { ladderShares } from './ladder.ts';
import {
  mergeRegulationOverrides,
  readRegulationOverrides,
  withRegulationOverrides,
  writeRegulationOverrides,
  type RegulationOverride,
} from './regulation-overrides.ts';
import type { TeamTagsIndex } from './tags.ts';

const DB_NAME = 'champions-atlas-catalog';
const STORE_NAME = 'bundles';
const ACTIVE_KEY = 'active';
const VISIBILITY_THROTTLE_MS = 5 * 60 * 1000;

function admittedCatalog(catalog: CatalogData): CatalogData {
  return {
    ...catalog,
    teams: mergeYoutubeCopies(
      admittedTeams(catalog.teams, catalog.currentRegulation)
    ),
  };
}

class CatalogRuntimeState {
  base = $state.raw<CatalogData>(admittedCatalog(bundledCatalog));
  overrides = $state.raw<RegulationOverride[]>(
    typeof localStorage === 'undefined'
      ? []
      : (readRegulationOverrides(localStorage) ?? [])
  );
  format = $state<BattleFormat>(
    typeof localStorage === 'undefined'
      ? 'doubles'
      : readBattleFormat(localStorage).format
  );
  catalog = $derived.by(() => {
    const catalog = withRegulationOverrides(this.base, this.overrides);
    const format = this.format;
    return {
      ...catalog,
      teams: catalog.teams.filter((team) => teamFormat(team) === format),
    };
  });
  allTags = $state.raw<TeamTagsIndex>(bundledTags);
  tags = $derived(this.format === 'singles' ? { teams: {} } : this.allTags);
  ready = $state(false);
  batchIds = $state.raw<Record<BattleFormat, readonly string[]>>({
    doubles: [],
    singles: [],
  });
  freshIds = $derived(new Set(this.batchIds[this.format]));
}

export const catalogState = new CatalogRuntimeState();

export function setRegulationOverride(
  id: string,
  regulation: string | null
): boolean {
  try {
    const stored = readRegulationOverrides(localStorage);
    if (!stored) return false;
    const next = mergeRegulationOverrides(
      [{ id, regulation, at: Date.now() }],
      stored
    );
    writeRegulationOverrides(localStorage, next);
    catalogState.overrides = next;
    return true;
  } catch {
    return false;
  }
}

export function reloadRegulationOverrides(): void {
  catalogState.overrides = readRegulationOverrides(localStorage) ?? [];
}

export function setBattleFormat(format: BattleFormat): boolean {
  try {
    writeBattleFormat(localStorage, { format, at: Date.now() });
    catalogState.format = format;
    return true;
  } catch {
    return false;
  }
}

export function reloadBattleFormat(): void {
  catalogState.format = readBattleFormat(localStorage).format;
}

export const ladderFor = (regulation: string) =>
  ladderShares(regulation, catalogState.format);

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
  catalogState.base = admittedCatalog(bundle);
  catalogState.allTags = bundle.tags;
  activeBundleHash = bundleHash ?? bundle.bundleHash;
  catalogState.batchIds = {
    doubles: bundle.latestBatch?.ids ?? [],
    singles: bundle.singlesBatch?.ids ?? [],
  };
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
      catalogState.ready = true;
      lastVisibilityRefreshAt = Date.now();
      void refreshCatalogNow();
    }
  })();

  return initPromise;
}
