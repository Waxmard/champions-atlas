import {
  currentSetsKey,
  inspectCurrentSets,
  readCurrentSets,
  readCurrentSetsValue,
  restoreStorageValue,
  type CurrentSet,
} from './current-sets.ts';
import { readSavedTeams, storageKey, type SavedTeam } from './workbench.ts';

export const syncOwnerKey = 'champions-atlas:sync-owner:v2';
export const syncRecordKey = (owner: string) =>
  `champions-atlas:sync:v2:${owner}`;

const cacheReadError =
  'Sync cache could not be read. Existing data has been left untouched.';

const changedSourcesError =
  'In-game sets changed while syncing. Review the latest sets and try again.';

export interface SyncCacheSnapshot {
  key: string;
  raw: string;
  root: Record<string, unknown>;
}

export interface SyncCacheRecord extends SyncCacheSnapshot {
  base: SavedTeam[] | null;
  local: SavedTeam[];
  setsBase: CurrentSet[] | null;
  setsLocal: CurrentSet[];
  rawSetsBase: unknown;
  rawSetsLocal: unknown;
}

function rewrite(
  storage: Storage,
  key: string,
  read: (target: Pick<Storage, 'getItem'>) => unknown[]
) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return;
    const next = JSON.stringify(read(storage));
    if (next !== raw) storage.setItem(key, next);
  } catch {
    return;
  }
}

function recordRoot(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('base' in value) ||
      !('local' in value)
    )
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error(cacheReadError);
  }
}

export function readSyncCacheSnapshot(
  storage: Pick<Storage, 'getItem'>,
  owner: string
): SyncCacheSnapshot | null {
  const key = syncRecordKey(owner);
  const raw = storage.getItem(key);
  return raw === null ? null : { key, raw, root: recordRoot(raw) };
}

function savedTeams(value: unknown): SavedTeam[] {
  const raw = JSON.stringify(value);
  if (raw === undefined) throw new Error(cacheReadError);
  return readSavedTeams({ getItem: () => raw });
}

function cachedCurrentSets(value: unknown): CurrentSet[] {
  try {
    return readCurrentSetsValue(value);
  } catch (error) {
    throw new Error(cacheReadError, { cause: error });
  }
}

export function wireCurrentSets(value: unknown): CurrentSet[] {
  return Array.from(inspectCurrentSets(value), ({ originalId, member }) => ({
    id: originalId,
    member,
  }));
}

export function readSyncCache(
  storage: Pick<Storage, 'getItem'>,
  owner: string
): SyncCacheRecord | null {
  const snapshot = readSyncCacheSnapshot(storage, owner);
  if (!snapshot) return null;
  const {
    base,
    local,
    setsBase: rawSetsBase,
    setsLocal: rawSetsLocal,
  } = snapshot.root;
  const setsBase =
    'setsBase' in snapshot.root && rawSetsBase !== null
      ? cachedCurrentSets(rawSetsBase)
      : null;
  const setsLocal =
    'setsLocal' in snapshot.root ? cachedCurrentSets(rawSetsLocal) : [];
  return {
    ...snapshot,
    base: base === null ? null : savedTeams(base),
    local: savedTeams(local),
    setsBase,
    setsLocal,
    rawSetsBase,
    rawSetsLocal,
  };
}

function preserveUnknownTeamFields(
  previous: unknown,
  next: SavedTeam[] | null
): SavedTeam[] | null {
  if (next === null || !Array.isArray(previous)) return next;
  const byId = new Map(
    previous.flatMap((team) =>
      team &&
      typeof team === 'object' &&
      !Array.isArray(team) &&
      'id' in team &&
      typeof team.id === 'string'
        ? [[team.id, team as Record<string, unknown>] as const]
        : []
    )
  );
  return next.map((team) => ({ ...byId.get(team.id), ...team }));
}

export function composeSyncCache(
  previous: SyncCacheSnapshot | null,
  values: Pick<SyncCacheRecord, 'base' | 'local' | 'setsBase' | 'setsLocal'>
): string {
  const root = previous ? { ...previous.root } : {};
  root.base = preserveUnknownTeamFields(root.base, values.base);
  root.local = preserveUnknownTeamFields(root.local, values.local);
  root.setsBase = values.setsBase;
  root.setsLocal = values.setsLocal;
  const raw = JSON.stringify(root);
  if (raw === undefined) throw new Error(cacheReadError);
  return raw;
}

export function writeSyncCache(
  storage: Storage,
  owner: string,
  values: Pick<SyncCacheRecord, 'base' | 'local' | 'setsBase' | 'setsLocal'>
): string {
  const checked = {
    base: values.base === null ? null : savedTeams(values.base),
    local: savedTeams(values.local),
    setsBase:
      values.setsBase === null ? null : cachedCurrentSets(values.setsBase),
    setsLocal: cachedCurrentSets(values.setsLocal),
  };
  const serialized = composeSyncCache(
    readSyncCacheSnapshot(storage, owner),
    checked
  );
  storage.setItem(syncRecordKey(owner), serialized);
  return serialized;
}

export function storeCurrentSetSyncCache(
  owner: string,
  base: SavedTeam[] | null,
  local: SavedTeam[],
  setsBase: CurrentSet[] | null,
  setsLocal: CurrentSet[]
): string {
  return writeSyncCache(localStorage, owner, {
    base,
    local,
    setsBase,
    setsLocal,
  });
}

export function migrateStoredData(storage: Storage): void {
  rewrite(storage, storageKey, readSavedTeams);
  rewrite(storage, currentSetsKey, readCurrentSets);
}

export interface StorageWrite {
  key: string;
  before: string | null;
  after: string | null;
}

export function applyGuardedStorageWrites(
  storage: Storage,
  sources: readonly { key: string; raw: string | null }[],
  writes: readonly StorageWrite[],
  assertOwner: () => void = () => {}
): void {
  const expected = new Map(sources.map(({ key, raw }) => [key, raw]));
  const changedKeys = new Set<string>();
  if (expected.size !== sources.length) throw new Error(changedSourcesError);
  for (const write of writes) {
    if (
      changedKeys.has(write.key) ||
      expected.get(write.key) !== write.before ||
      !expected.has(write.key)
    )
      throw new Error(changedSourcesError);
    changedKeys.add(write.key);
  }

  const applied: StorageWrite[] = [];
  const verify = () => {
    assertOwner();
    for (const [key, raw] of expected)
      if (storage.getItem(key) !== raw) throw new Error(changedSourcesError);
  };

  try {
    verify();
    for (const write of writes) {
      verify();
      if (write.after === write.before) continue;
      try {
        if (write.after === null) storage.removeItem(write.key);
        else storage.setItem(write.key, write.after);
      } catch (error) {
        if (storage.getItem(write.key) === write.after) {
          applied.push(write);
          expected.set(write.key, write.after);
        }
        throw error;
      }
      applied.push(write);
      expected.set(write.key, write.after);
      verify();
    }
  } catch (error) {
    for (const write of applied.reverse()) {
      try {
        if (storage.getItem(write.key) === write.after)
          restoreStorageValue(storage, write.key, write.before);
      } catch {
        continue;
      }
    }
    throw error;
  }
}

export function saveSyncRebase(
  storage: Storage,
  owner: string,
  before: { teams: string | null; sets: string | null; cache: string | null },
  next: Pick<SyncCacheRecord, 'base' | 'local' | 'setsBase' | 'setsLocal'> & {
    teamsRaw: string | null;
    setsRaw: string;
  },
  assertOwner: () => void
): string {
  const cache = syncRecordKey(owner);
  const cacheRaw = composeSyncCache(
    readSyncCacheSnapshot({ getItem: () => before.cache }, owner),
    next
  );
  const writes = [
    { key: storageKey, before: before.teams, after: next.teamsRaw },
    { key: currentSetsKey, before: before.sets, after: next.setsRaw },
    { key: cache, before: before.cache, after: cacheRaw },
  ];
  applyGuardedStorageWrites(
    storage,
    writes.map(({ key, before: raw }) => ({ key, raw })),
    writes,
    assertOwner
  );
  return cacheRaw;
}
