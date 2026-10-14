import { browser, dev } from '$app/environment';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as signOutOfFirebase,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  currentSetsKey,
  currentSetsSnapshot,
  mergeCurrentSets,
  readCurrentSets,
  stageCurrentSets,
  type CurrentSet,
} from './current-sets.ts';
import { mergeSavedTeams, teamsSnapshot } from './team-sync.ts';
import { canonicalSnapshot } from './team-history.ts';
import { readSavedTeams, storageKey, type SavedTeam } from './workbench.ts';

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';

export const sync = $state({
  configured: false,
  authResolved: false,
  user: null as User | null,
  status: 'off' as SyncStatus,
  error: '',
  revision: 0,
});

const ownerKey = 'champions-atlas:sync-owner:v2';
let auth: Auth | null = null;
let db: Firestore | null = null;
let projectId = '';
let session = 0;
let uid = '';
let unsubscribe: Unsubscribe | null = null;
let unsubscribeSets: Unsubscribe | null = null;
let base: SavedTeam[] | null = null;
let setsBase: CurrentSet[] | null = null;
let setManifestSnapshot: string | null = null;
let pending = false;
let savePending = false;
let running: Promise<void> | null = null;

const recordKey = (owner: string) => `champions-atlas:sync:v2:${owner}`;
const account = (id: string) => `${projectId}:${id}`;
const valid = (generation: number, id: string) =>
  generation === session &&
  uid === id &&
  auth?.currentUser?.uid === id &&
  localStorage.getItem(ownerKey) === account(id);

function teams(value: unknown): SavedTeam[] {
  if (!Array.isArray(value))
    throw new Error(
      'Saved teams could not be read. Existing data has been left untouched.'
    );
  return readSavedTeams({ getItem: () => JSON.stringify(value) });
}

function currentSets(value: unknown): CurrentSet[] {
  const raw = JSON.stringify(value);
  if (raw === undefined)
    throw new Error(
      'Current Pokémon sets could not be read. Existing data has been left untouched.'
    );
  return readCurrentSets({ getItem: () => raw });
}

const cloudReadError =
  'Cloud saved teams could not be read. Existing data has been left untouched.';
const cloudSetsReadError =
  'Cloud current Pokémon sets could not be read. Existing data has been left untouched.';
const cacheReadError =
  'Sync cache could not be read. Existing data has been left untouched.';
const switchInterruptedError =
  'Sync account switch was interrupted. Existing data has been preserved.';

function teamIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    new Set(value).size !== value.length ||
    value.some(
      (id) =>
        typeof id !== 'string' ||
        !id ||
        new TextEncoder().encode(id).length > 1500 ||
        id.includes('/') ||
        id === '.' ||
        id === '..' ||
        /^__[\s\S]*__$/.test(id)
    )
  )
    throw new Error(cloudReadError);
  return value;
}

function currentSetIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 1500 ||
    value.some(
      (id, index) =>
        typeof id !== 'string' ||
        !/^[a-z0-9]{1,1500}$/.test(id) ||
        (index > 0 && value[index - 1] >= id)
    )
  )
    throw new Error(cloudSetsReadError);
  return value;
}

function currentSetManifest(value: unknown): string[] {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'schemaVersion,setIds,updatedAt' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('updatedAt' in value) ||
    !(value.updatedAt instanceof Timestamp) ||
    !('setIds' in value)
  )
    throw new Error(cloudSetsReadError);
  return currentSetIds(value.setIds);
}

function cloudCurrentSet(value: unknown, id: string): CurrentSet {
  try {
    const [entry] = currentSets([value]);
    if (!entry || entry.id !== id) throw new Error();
    return entry;
  } catch {
    throw new Error(cloudSetsReadError);
  }
}

function record(owner: string): {
  base: SavedTeam[] | null;
  local: SavedTeam[];
  setsBase: CurrentSet[] | null;
  setsLocal: CurrentSet[];
} | null {
  const raw = localStorage.getItem(recordKey(owner));
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(cacheReadError);
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('base' in value) ||
    !('local' in value)
  )
    throw new Error(cacheReadError);
  const data = value as Record<string, unknown>;
  let cachedSetsBase: CurrentSet[] | null = null;
  let cachedSetsLocal: CurrentSet[] = [];
  try {
    if ('setsBase' in data)
      cachedSetsBase =
        data.setsBase === null ? null : currentSets(data.setsBase);
    if ('setsLocal' in data) cachedSetsLocal = currentSets(data.setsLocal);
  } catch {
    throw new Error(cacheReadError);
  }
  return {
    base: data.base === null ? null : teams(data.base),
    local: teams(data.local),
    setsBase: cachedSetsBase,
    setsLocal: cachedSetsLocal,
  };
}

function store(
  owner: string,
  nextBase: SavedTeam[] | null,
  local: SavedTeam[],
  nextSetsBase: CurrentSet[] | null,
  setsLocal: CurrentSet[]
) {
  const checkedBase = nextBase === null ? null : teams(nextBase);
  const checkedLocal = teams(local);
  const checkedSetsBase =
    nextSetsBase === null ? null : currentSets(nextSetsBase);
  const checkedSetsLocal = currentSets(setsLocal);
  localStorage.setItem(
    recordKey(owner),
    JSON.stringify({
      base: checkedBase,
      local: checkedLocal,
      setsBase: checkedSetsBase,
      setsLocal: checkedSetsLocal,
    })
  );
}

function fail(error: unknown) {
  sync.status = 'error';
  sync.error = error instanceof Error ? error.message : String(error);
}

function restoreStorageValue(key: string, raw: string | null) {
  if (raw === null) localStorage.removeItem(key);
  else localStorage.setItem(key, raw);
}

function invalidate() {
  session++;
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeSets?.();
  unsubscribeSets = null;
  uid = '';
  base = null;
  setsBase = null;
  setManifestSnapshot = null;
  pending = false;
  savePending = false;
  running = null;
}

function adopt(id: string) {
  const incoming = account(id);
  const previous = localStorage.getItem(ownerKey);
  if (previous?.startsWith('switching:'))
    throw new Error(switchInterruptedError);
  const working = readSavedTeams(localStorage);
  const workingSets = readCurrentSets(localStorage);
  if (previous === incoming) {
    const cached = record(incoming);
    base = cached?.base ?? null;
    setsBase = cached?.setsBase ?? null;
    store(incoming, base, working, setsBase, workingSets);
    return;
  }
  if (previous) {
    const outgoing = record(previous);
    if (!outgoing) throw new Error(cacheReadError);
    store(previous, outgoing.base, working, outgoing.setsBase, workingSets);
  }
  const cached = previous ? record(incoming) : null;
  const incomingTeams = previous ? (cached?.local ?? []) : working;
  const incomingSets = previous ? (cached?.setsLocal ?? []) : workingSets;
  const incomingBase = previous ? (cached?.base ?? null) : null;
  const incomingSetsBase = previous ? (cached?.setsBase ?? null) : null;
  if (!previous) {
    store(
      incoming,
      incomingBase,
      incomingTeams,
      incomingSetsBase,
      incomingSets
    );
    localStorage.setItem(ownerKey, incoming);
    base = incomingBase;
    setsBase = incomingSetsBase;
    return;
  }

  const rawTeams = localStorage.getItem(storageKey);
  const rawSets = localStorage.getItem(currentSetsKey);
  const switching = `switching:${previous}:${incoming}`;
  try {
    localStorage.setItem(ownerKey, switching);
    localStorage.setItem(storageKey, JSON.stringify(incomingTeams));
    localStorage.setItem(currentSetsKey, JSON.stringify(incomingSets));
    if (!cached)
      store(
        incoming,
        incomingBase,
        incomingTeams,
        incomingSetsBase,
        incomingSets
      );
    localStorage.setItem(ownerKey, incoming);
  } catch (error) {
    try {
      restoreStorageValue(storageKey, rawTeams);
      restoreStorageValue(currentSetsKey, rawSets);
      localStorage.setItem(ownerKey, previous);
    } catch {
      try {
        localStorage.setItem(ownerKey, switching);
      } catch {
        throw new Error(switchInterruptedError);
      }
      throw new Error(switchInterruptedError);
    }
    throw error;
  }
  base = incomingBase;
  setsBase = incomingSetsBase;
  if (
    teamsSnapshot(working) !== teamsSnapshot(incomingTeams) ||
    currentSetsSnapshot(workingSets) !== currentSetsSnapshot(incomingSets)
  )
    sync.revision++;
}

function request(saved = false): Promise<void> {
  pending = true;
  if (saved) savePending = true;
  sync.status = 'syncing';
  sync.error = '';
  if (!running) {
    const generation = session;
    running = drain(generation, uid).finally(() => {
      if (generation !== session) return;
      running = null;
      if (pending || savePending) void request();
    });
  }
  return running;
}

async function drain(generation: number, id: string) {
  while (pending || savePending) {
    pending = false;
    savePending = false;
    const recoveryIds = new Map<string, string>();
    try {
      if (!db || !valid(generation, id)) return;
      const cached = record(account(id));
      if (!valid(generation, id)) return;
      if (cached) setsBase = cached.setsBase;
      const capturedBase = base === null ? null : teams(base);
      const capturedLocal = readSavedTeams(localStorage);
      const capturedSetsBase = setsBase === null ? null : currentSets(setsBase);
      const capturedSets = readCurrentSets(localStorage);
      teamIds(capturedLocal.map((team) => team.id));
      const ref = doc(db, 'users', id);
      const setsRef = doc(db, 'users', id, 'pokemonSetState', 'manifest');
      sync.status = 'syncing';
      sync.error = '';
      const committed = await runTransaction(db, async (transaction) => {
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const snapshot = await transaction.get(ref);
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const parent = snapshot.data();
        let remote: SavedTeam[] = [];
        let manifest: string[] | null = null;
        if (snapshot.exists()) {
          if (!parent || !('schemaVersion' in parent)) {
            try {
              remote = teams(parent?.teams);
              teamIds(remote.map((team) => team.id));
            } catch {
              throw new Error(cloudReadError);
            }
          } else {
            if (
              parent.schemaVersion !== 2 ||
              Object.keys(parent).length !== 3 ||
              !(parent.updatedAt instanceof Timestamp)
            )
              throw new Error(cloudReadError);
            try {
              manifest = teamIds(parent.teamIds);
            } catch {
              throw new Error(cloudReadError);
            }
            for (const teamId of manifest) {
              if (!valid(generation, id))
                throw new Error('Sync account changed.');
              const child = await transaction
                .get(doc(db!, 'users', id, 'teams', teamId))
                .catch(() => {
                  throw new Error(cloudReadError);
                });
              if (!valid(generation, id))
                throw new Error('Sync account changed.');
              if (!child.exists() || child.data().id !== teamId)
                throw new Error(cloudReadError);
              try {
                remote.push(...teams([child.data()]));
              } catch {
                throw new Error(cloudReadError);
              }
            }
          }
        }

        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const setManifest = await transaction.get(setsRef);
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const setManifestExists = setManifest.exists();
        const remoteSets: CurrentSet[] = [];
        if (setManifestExists) {
          const setIds = currentSetManifest(setManifest.data());
          for (const setId of setIds) {
            if (!valid(generation, id))
              throw new Error('Sync account changed.');
            const child = await transaction.get(
              doc(db!, 'users', id, 'pokemonSets', setId)
            );
            if (!valid(generation, id))
              throw new Error('Sync account changed.');
            if (!child.exists()) throw new Error(cloudSetsReadError);
            remoteSets.push(cloudCurrentSet(child.data(), setId));
          }
        }

        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const merged = mergeSavedTeams(
          capturedBase,
          capturedLocal,
          remote,
          recoveryIds
        );
        const mergedIds = teamIds(merged.map((team) => team.id));
        const desiredSets = mergeCurrentSets(
          capturedSetsBase,
          capturedSets,
          remoteSets
        );
        const stagedSets = stageCurrentSets(remoteSets, desiredSets);

        if (
          manifest === null ||
          canonicalSnapshot(mergedIds) !== canonicalSnapshot(manifest) ||
          teamsSnapshot(merged) !== teamsSnapshot(remote)
        ) {
          const previous = new Map(remote.map((team) => [team.id, team]));
          for (const team of merged) {
            if (
              manifest === null ||
              canonicalSnapshot(team) !==
                canonicalSnapshot(previous.get(team.id))
            ) {
              if (!valid(generation, id))
                throw new Error('Sync account changed.');
              transaction.set(doc(db!, 'users', id, 'teams', team.id), team);
            }
          }
          for (const teamId of manifest ?? []) {
            if (!mergedIds.includes(teamId)) {
              if (!valid(generation, id))
                throw new Error('Sync account changed.');
              transaction.delete(doc(db!, 'users', id, 'teams', teamId));
            }
          }
          if (!valid(generation, id)) throw new Error('Sync account changed.');
          transaction.set(ref, {
            schemaVersion: 2,
            teamIds: mergedIds,
            updatedAt: serverTimestamp(),
          });
        }

        if (
          !setManifestExists ||
          currentSetsSnapshot(stagedSets.committed) !==
            currentSetsSnapshot(remoteSets)
        ) {
          const previous = new Map(
            remoteSets.map((entry) => [entry.id, entry])
          );
          for (const entry of stagedSets.committed) {
            const old = previous.get(entry.id);
            if (!old || canonicalSnapshot(entry) !== canonicalSnapshot(old)) {
              if (!valid(generation, id))
                throw new Error('Sync account changed.');
              transaction.set(
                doc(db!, 'users', id, 'pokemonSets', entry.id),
                entry
              );
            }
          }
          if (!valid(generation, id)) throw new Error('Sync account changed.');
          transaction.set(setsRef, {
            schemaVersion: 1,
            setIds: stagedSets.committed.map(({ id: setId }) => setId),
            updatedAt: serverTimestamp(),
          });
        }
        return {
          teams: merged,
          sets: stagedSets.committed,
          pendingIds: stagedSets.pendingIds,
        };
      });
      if (!valid(generation, id)) return;
      const current = readSavedTeams(localStorage);
      const currentLocalSets = readCurrentSets(localStorage);
      const rebased = mergeSavedTeams(
        capturedLocal,
        current,
        committed.teams,
        recoveryIds
      );
      const pendingSetIds = new Set(committed.pendingIds);
      const rebasedSetMap = new Map(
        [
          ...mergeCurrentSets(capturedSets, currentLocalSets, committed.sets),
          ...currentLocalSets.filter((entry) => pendingSetIds.has(entry.id)),
        ].map((entry) => [entry.id, entry])
      );
      const checkedTeams = teams(rebased);
      const checkedSets = currentSets(
        [...rebasedSetMap.values()].sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        )
      );
      const teamChanged =
        teamsSnapshot(current) !== teamsSnapshot(checkedTeams);
      const setsChanged =
        currentSetsSnapshot(currentLocalSets) !==
        currentSetsSnapshot(checkedSets);
      if (!valid(generation, id)) return;
      const rawTeams = localStorage.getItem(storageKey);
      const rawSets = localStorage.getItem(currentSetsKey);
      try {
        if (teamChanged) {
          if (!valid(generation, id)) throw new Error('Sync account changed.');
          localStorage.setItem(storageKey, JSON.stringify(checkedTeams));
        }
        if (setsChanged) {
          if (!valid(generation, id)) throw new Error('Sync account changed.');
          localStorage.setItem(currentSetsKey, JSON.stringify(checkedSets));
        }
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        store(
          account(id),
          committed.teams,
          checkedTeams,
          committed.sets,
          checkedSets
        );
      } catch (error) {
        try {
          if (valid(generation, id)) {
            restoreStorageValue(storageKey, rawTeams);
            restoreStorageValue(currentSetsKey, rawSets);
          }
        } catch {
          throw error;
        }
        throw error;
      }
      if (!valid(generation, id)) return;
      base = committed.teams;
      setsBase = committed.sets;
      if (teamChanged || setsChanged) sync.revision++;
      if (
        teamsSnapshot(checkedTeams) !== teamsSnapshot(committed.teams) ||
        currentSetsSnapshot(checkedSets) !==
          currentSetsSnapshot(committed.sets) ||
        committed.pendingIds.length
      ) {
        pending = true;
        savePending = true;
      } else if (!pending && !savePending) {
        sync.status = 'synced';
      }
    } catch (error) {
      if (generation === session && uid === id) {
        pending = false;
        savePending = false;
        fail(error);
      }
      return;
    }
  }
}

function firebaseConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const id = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !id || !appId) return null;
  return { apiKey, authDomain, projectId: id, appId };
}

export function initSync(): void {
  if (!browser || auth) return;
  const config = firebaseConfig();
  if (!config) return;
  projectId = config.projectId;
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  if (
    dev &&
    import.meta.env.VITE_FIREBASE_EMULATORS === '1' &&
    projectId === 'demo-champions-atlas' &&
    ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  ) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  sync.configured = true;
  void getRedirectResult(auth).catch(fail);
  window.addEventListener('online', () => {
    if (uid) void request();
  });
  document.addEventListener('visibilitychange', () => {
    if (uid && document.visibilityState === 'visible') void request();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === ownerKey && uid && event.newValue !== account(uid)) {
      invalidate();
      fail(
        new Error(
          'Sync account changed in another tab. Sign in again to continue.'
        )
      );
    } else if (event.key === currentSetsKey && uid) {
      try {
        if (!valid(session, uid)) return;
        const cached = record(account(uid));
        if (!valid(session, uid)) return;
        if (cached) setsBase = cached.setsBase;
        void request();
      } catch (error) {
        fail(error);
      }
    }
  });
  onAuthStateChanged(auth, (user) => {
    invalidate();
    sync.user = null;
    sync.authResolved = true;
    if (!user) {
      sync.status = 'off';
      sync.error = '';
      return;
    }
    try {
      adopt(user.uid);
      uid = user.uid;
      sync.user = user;
      const generation = session;
      unsubscribe = onSnapshot(
        doc(db!, 'users', uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (generation !== session || snapshot.metadata.hasPendingWrites)
            return;
          try {
            if (valid(generation, user.uid)) void request();
          } catch (error) {
            fail(error);
          }
        },
        (error) => {
          if (generation === session) fail(error);
        }
      );
      unsubscribeSets = onSnapshot(
        doc(db!, 'users', uid, 'pokemonSetState', 'manifest'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (generation !== session || snapshot.metadata.hasPendingWrites)
            return;
          try {
            if (!valid(generation, user.uid)) return;
            const next = canonicalSnapshot(
              snapshot.exists() ? snapshot.data() : null
            );
            if (setManifestSnapshot !== null && setManifestSnapshot !== next)
              sync.revision++;
            setManifestSnapshot = next;
            void request();
          } catch (error) {
            fail(error);
          }
        },
        (error) => {
          if (generation === session) fail(error);
        }
      );
      void request();
    } catch (error) {
      fail(error);
    }
  });
}

export async function signIn(): Promise<void> {
  if (!auth) return;
  sync.status = 'syncing';
  sync.error = '';
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        await signInWithRedirect(auth, new GoogleAuthProvider());
      } catch (redirectError) {
        fail(redirectError);
      }
    } else {
      sync.status = code === 'auth/popup-closed-by-user' ? 'off' : 'error';
      sync.error = error instanceof Error ? error.message : String(error);
    }
  }
}

export async function signOut(): Promise<void> {
  if (!auth) return;
  invalidate();
  sync.user = null;
  try {
    await signOutOfFirebase(auth);
    sync.status = 'off';
    sync.error = '';
  } catch (error) {
    fail(error);
  }
}

export async function pushNow(): Promise<void> {
  try {
    if (!uid || !valid(session, uid)) return;
    const owner = account(uid);
    const cached = record(owner);
    if (!valid(session, uid)) return;
    if (cached) setsBase = cached.setsBase;
    const local = readSavedTeams(localStorage);
    const localSets = readCurrentSets(localStorage);
    store(owner, base, local, setsBase, localSets);
    await request(true);
  } catch (error) {
    fail(error);
  }
}
