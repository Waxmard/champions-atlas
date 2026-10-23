import { browser, dev } from '$app/env';
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
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  currentSetsChangedEvent,
  currentSetsKey,
  currentSetsSnapshot,
  readCurrentSets,
  readCurrentSetsValue,
  rebaseStagedCurrentSets,
  restoreStorageValue,
  type CurrentSet,
} from './current-sets.ts';
import {
  stageCurrentSetsInTransaction,
  watchCurrentSetDocument,
} from './current-set-sync.ts';
import {
  mergeSavedTeams,
  teamsSnapshot,
  validateTeamIds,
  validatedTeams,
} from './team-sync.ts';
import { readSavedTeams, storageKey, type SavedTeam } from './workbench.ts';
import { canonicalSnapshot } from './team-history.ts';
import {
  readSyncCache,
  saveSyncRebase,
  storeCurrentSetSyncCache as store,
  syncOwnerKey,
  syncRecordKey,
  wireCurrentSets,
} from './storage-migration.ts';

type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';

export const sync = $state({
  configured: false,
  authResolved: false,
  user: null as User | null,
  status: 'off' as SyncStatus,
  error: '',
  revision: 0,
});

let auth: Auth | null = null;
let db: Firestore | null = null;
let projectId = '';
let activateUser: ((user: User) => void) | null = null;
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

const account = (id: string) => `${projectId}:${id}`;
const valid = (generation: number, id: string) =>
  generation === session &&
  uid === id &&
  auth?.currentUser?.uid === id &&
  localStorage.getItem(syncOwnerKey) === account(id);

const cloudReadError =
  'Cloud saved teams could not be read. Existing data has been left untouched.';
const cacheReadError =
  'Sync cache could not be read. Existing data has been left untouched.';
const switchInterruptedError =
  'Sync account switch was interrupted. Existing data has been preserved.';

function fail(error: unknown) {
  sync.status = 'error';
  sync.error = error instanceof Error ? error.message : String(error);
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

function adopt(id: string): void {
  const incoming = account(id);
  const previous = localStorage.getItem(syncOwnerKey);
  if (previous?.startsWith('switching:'))
    throw new Error(switchInterruptedError);
  const working = readSavedTeams(localStorage);
  const workingSets = readCurrentSets(localStorage);
  if (previous === incoming) {
    const cached = readSyncCache(localStorage, incoming);
    base = cached?.base ?? null;
    setsBase = cached?.setsBase ?? null;
    store(incoming, base, working, setsBase, workingSets);
    return;
  }
  if (previous) {
    const outgoing = readSyncCache(localStorage, previous);
    if (!outgoing) throw new Error(cacheReadError);
    store(previous, outgoing.base, working, outgoing.setsBase, workingSets);
  }
  const cached = previous ? readSyncCache(localStorage, incoming) : null;
  const incomingTeams = previous ? (cached?.local ?? []) : working;
  const incomingSets = previous ? (cached?.setsLocal ?? []) : workingSets;
  const incomingWireSets = cached
    ? wireCurrentSets(cached.rawSetsLocal ?? incomingSets)
    : incomingSets;
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
    localStorage.setItem(syncOwnerKey, incoming);
    base = incomingBase;
    setsBase = incomingSetsBase;
    return;
  }

  const rawTeams = localStorage.getItem(storageKey);
  const rawSets = localStorage.getItem(currentSetsKey);
  const nextSetsRaw = JSON.stringify(incomingWireSets);
  const switching = `switching:${previous}:${incoming}`;
  try {
    localStorage.setItem(syncOwnerKey, switching);
    localStorage.setItem(storageKey, JSON.stringify(incomingTeams));
    localStorage.setItem(currentSetsKey, nextSetsRaw);
    if (!cached)
      store(
        incoming,
        incomingBase,
        incomingTeams,
        incomingSetsBase,
        incomingSets
      );
    localStorage.setItem(syncOwnerKey, incoming);
  } catch (error) {
    try {
      restoreStorageValue(localStorage, storageKey, rawTeams);
      restoreStorageValue(localStorage, currentSetsKey, rawSets);
      restoreStorageValue(localStorage, syncOwnerKey, previous);
    } catch {
      try {
        localStorage.setItem(syncOwnerKey, switching);
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
      const owner = account(id);
      const firestore = db;
      const cacheKey = syncRecordKey(owner);
      const cached = readSyncCache(localStorage, owner);
      if (!valid(generation, id)) return;
      if (cached) setsBase = cached.setsBase;
      const capturedBase = base === null ? null : validatedTeams(base);
      const capturedLocal = readSavedTeams(localStorage);
      const capturedSetsBase =
        setsBase === null ? null : readCurrentSetsValue(setsBase);
      const capturedSets = readCurrentSets(localStorage);
      const guarded = () => valid(generation, id);
      validateTeamIds(capturedLocal.map((team) => team.id));
      const ref = doc(db, 'users', id);
      sync.status = 'syncing';
      sync.error = '';
      const committed = await runTransaction(db, async (transaction) => {
        if (!guarded()) throw new Error('Sync account changed.');
        const snapshot = await transaction.get(ref);
        if (!guarded()) throw new Error('Sync account changed.');
        const parent = snapshot.data();
        let remote: SavedTeam[] = [];
        let manifest: string[] | null = null;
        if (snapshot.exists()) {
          if (!parent || !('schemaVersion' in parent)) {
            try {
              remote = validatedTeams(parent?.teams);
              validateTeamIds(remote.map((team) => team.id));
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
              manifest = validateTeamIds(parent.teamIds);
            } catch {
              throw new Error(cloudReadError);
            }
            for (const teamId of manifest) {
              if (!guarded()) throw new Error('Sync account changed.');
              const child = await transaction
                .get(doc(firestore, 'users', id, 'teams', teamId))
                .catch(() => {
                  throw new Error(cloudReadError);
                });
              if (!guarded()) throw new Error('Sync account changed.');
              if (!child.exists() || child.data().id !== teamId)
                throw new Error(cloudReadError);
              try {
                remote.push(...validatedTeams([child.data()]));
              } catch {
                throw new Error(cloudReadError);
              }
            }
          }
        }

        const merged = mergeSavedTeams(
          capturedBase,
          capturedLocal,
          remote,
          recoveryIds
        );
        const mergedIds = validateTeamIds(merged.map((team) => team.id));
        const staged = await stageCurrentSetsInTransaction({
          transaction,
          firestore,
          uid: id,
          guard: guarded,
          base: capturedSetsBase,
          local: capturedSets,
        });

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
              if (!guarded()) throw new Error('Sync account changed.');
              transaction.set(
                doc(firestore, 'users', id, 'teams', team.id),
                team
              );
            }
          }
          for (const teamId of manifest ?? []) {
            if (!mergedIds.includes(teamId)) {
              if (!guarded()) throw new Error('Sync account changed.');
              transaction.delete(doc(firestore, 'users', id, 'teams', teamId));
            }
          }
          if (!guarded()) throw new Error('Sync account changed.');
          transaction.set(ref, {
            schemaVersion: 2,
            teamIds: mergedIds,
            updatedAt: serverTimestamp(),
          });
        }
        return { teams: merged, ...staged };
      });
      if (!valid(generation, id)) return;
      const rawTeams = localStorage.getItem(storageKey);
      const rawSets = localStorage.getItem(currentSetsKey);
      const rawCache = localStorage.getItem(cacheKey);
      const current = readSavedTeams({ getItem: () => rawTeams });
      const currentLocalSets = readCurrentSets({ getItem: () => rawSets });
      const rebased = mergeSavedTeams(
        capturedLocal,
        current,
        committed.teams,
        recoveryIds
      );
      const rebasedSets = rebaseStagedCurrentSets(
        capturedSets,
        currentLocalSets,
        committed.stage,
        committed.cloud.stored
      );
      const checkedTeams = validatedTeams(rebased);
      const checkedSets = readCurrentSetsValue(rebasedSets.local);
      const checkedSetsRaw = JSON.stringify(rebasedSets.local);
      const teamChanged =
        teamsSnapshot(current) !== teamsSnapshot(checkedTeams);
      const setsChanged = checkedSetsRaw !== rawSets;
      if (!guarded()) throw new Error('Sync account changed.');
      saveSyncRebase(
        localStorage,
        owner,
        { teams: rawTeams, sets: rawSets, cache: rawCache },
        {
          base: committed.teams,
          local: checkedTeams,
          setsBase: rebasedSets.base,
          setsLocal: rebasedSets.local,
          teamsRaw: teamChanged ? JSON.stringify(checkedTeams) : rawTeams,
          setsRaw: checkedSetsRaw,
        },
        () => {
          if (!valid(generation, id)) throw new Error('Sync account changed.');
        }
      );
      if (!valid(generation, id)) return;
      base = committed.teams;
      setsBase = committed.stage.committed;
      if (setsChanged) window.dispatchEvent(new Event(currentSetsChangedEvent));
      if (teamChanged || setsChanged) sync.revision++;
      if (
        teamsSnapshot(checkedTeams) !== teamsSnapshot(committed.teams) ||
        currentSetsSnapshot(checkedSets) !==
          currentSetsSnapshot(committed.stage.committed) ||
        committed.stage.pendingIds.length
      ) {
        pending = true;
        savePending = true;
      } else if (!pending && !savePending) sync.status = 'synced';
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
  const firestore = db;
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
    if (event.key === syncOwnerKey && uid && event.newValue !== account(uid)) {
      invalidate();
      fail(
        new Error(
          'Sync account changed in another tab. Sign in again to continue.'
        )
      );
    } else if (event.key === currentSetsKey && uid) {
      try {
        if (!valid(session, uid)) return;
        const cached = readSyncCache(localStorage, account(uid));
        if (!valid(session, uid)) return;
        if (cached) setsBase = cached.setsBase;
        void request();
      } catch (error) {
        fail(error);
      }
    }
  });
  activateUser = (user) => {
    try {
      adopt(user.uid);
      uid = user.uid;
      sync.user = user;
      const generation = session;
      unsubscribe = watchCurrentSetDocument(
        doc(firestore, 'users', uid),
        () => valid(generation, user.uid),
        () => void request(),
        (error) => generation === session && fail(error)
      );
      unsubscribeSets = watchCurrentSetDocument(
        doc(firestore, 'users', uid, 'pokemonSetState', 'manifest'),
        () => valid(generation, user.uid),
        (snapshot) => {
          const next = canonicalSnapshot(
            snapshot.exists() ? snapshot.data() : null
          );
          if (setManifestSnapshot !== null && setManifestSnapshot !== next)
            sync.revision++;
          setManifestSnapshot = next;
          void request();
        },
        (error) => generation === session && fail(error)
      );
      void request();
    } catch (error) {
      fail(error);
    }
  };
  onAuthStateChanged(auth, (user) => {
    invalidate();
    sync.user = null;
    sync.authResolved = true;
    if (!user) {
      sync.status = 'off';
      sync.error = '';
      return;
    }
    activateUser?.(user);
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
    const cached = readSyncCache(localStorage, owner);
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
