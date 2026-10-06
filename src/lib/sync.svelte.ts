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
let base: SavedTeam[] | null = null;
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

const cloudReadError =
  'Cloud saved teams could not be read. Existing data has been left untouched.';

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

function record(
  owner: string
): { base: SavedTeam[] | null; local: SavedTeam[] } | null {
  const raw = localStorage.getItem(recordKey(owner));
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    !('base' in value) ||
    !('local' in value)
  )
    throw new Error(
      'Sync cache could not be read. Existing data has been left untouched.'
    );
  const data = value as { base: unknown; local: unknown };
  return {
    base: data.base === null ? null : teams(data.base),
    local: teams(data.local),
  };
}

function store(
  owner: string,
  nextBase: SavedTeam[] | null,
  local: SavedTeam[]
) {
  localStorage.setItem(
    recordKey(owner),
    JSON.stringify({ base: nextBase, local })
  );
}

function fail(error: unknown) {
  sync.status = 'error';
  sync.error = error instanceof Error ? error.message : String(error);
}

function invalidate() {
  session++;
  unsubscribe?.();
  unsubscribe = null;
  uid = '';
  base = null;
  pending = false;
  savePending = false;
  running = null;
}

function adopt(id: string) {
  const incoming = account(id);
  const previous = localStorage.getItem(ownerKey);
  if (previous === incoming) {
    const cached = record(incoming);
    const working = readSavedTeams(localStorage);
    base = cached?.base ?? null;
    store(incoming, base, working);
    return;
  }
  if (previous?.startsWith('switching:'))
    throw new Error(
      'Sync account switch was interrupted. Existing data has been preserved.'
    );
  const working = readSavedTeams(localStorage);
  if (previous) {
    const outgoing = record(previous);
    if (!outgoing)
      throw new Error(
        'Sync cache could not be read. Existing data has been left untouched.'
      );
    store(previous, outgoing.base, working);
  }
  const cached = previous ? record(incoming) : null;
  const incomingTeams = previous ? (cached?.local ?? []) : working;
  const incomingBase = previous ? (cached?.base ?? null) : null;
  if (!previous) {
    store(incoming, incomingBase, incomingTeams);
    localStorage.setItem(ownerKey, incoming);
    base = incomingBase;
    return;
  }
  localStorage.setItem(ownerKey, `switching:${previous}:${incoming}`);
  try {
    localStorage.setItem(storageKey, JSON.stringify(incomingTeams));
    localStorage.setItem(ownerKey, incoming);
  } catch (error) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(working));
      localStorage.setItem(ownerKey, previous);
    } catch {
      throw error;
    }
    throw error;
  }
  if (!cached) store(incoming, incomingBase, incomingTeams);
  base = incomingBase;
  if (teamsSnapshot(working) !== teamsSnapshot(incomingTeams)) sync.revision++;
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
      const capturedBase = base === null ? null : teams(base);
      const capturedLocal = readSavedTeams(localStorage);
      teamIds(capturedLocal.map((team) => team.id));
      const ref = doc(db, 'users', id);
      sync.status = 'syncing';
      sync.error = '';
      const committed = await runTransaction(db, async (transaction) => {
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const snapshot = await transaction.get(ref);
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const parent = snapshot.data();
        let remote: SavedTeam[] = [];
        let manifest: string[] | null = null;
        try {
          if (snapshot.exists()) {
            if (!parent || !('schemaVersion' in parent)) {
              remote = teams(parent?.teams);
              teamIds(remote.map((team) => team.id));
            } else {
              if (
                parent.schemaVersion !== 2 ||
                Object.keys(parent).length !== 3 ||
                !(parent.updatedAt instanceof Timestamp)
              )
                throw new Error(cloudReadError);
              manifest = teamIds(parent.teamIds);
              for (const teamId of manifest) {
                const child = await transaction.get(
                  doc(db!, 'users', id, 'teams', teamId)
                );
                if (!child.exists() || child.data().id !== teamId)
                  throw new Error(cloudReadError);
                remote.push(...teams([child.data()]));
              }
            }
          }
        } catch {
          throw new Error(cloudReadError);
        }
        if (!valid(generation, id)) throw new Error('Sync account changed.');
        const merged = mergeSavedTeams(
          capturedBase,
          capturedLocal,
          remote,
          recoveryIds
        );
        const mergedIds = teamIds(merged.map((team) => team.id));
        if (
          manifest === null ||
          canonicalSnapshot(mergedIds) !== canonicalSnapshot(manifest) ||
          teamsSnapshot(merged) !== teamsSnapshot(remote)
        ) {
          if (!valid(generation, id)) throw new Error('Sync account changed.');
          const previous = new Map(remote.map((team) => [team.id, team]));
          for (const team of merged) {
            if (
              manifest === null ||
              canonicalSnapshot(team) !==
                canonicalSnapshot(previous.get(team.id))
            )
              transaction.set(doc(db!, 'users', id, 'teams', team.id), team);
          }
          for (const teamId of manifest ?? []) {
            if (!mergedIds.includes(teamId))
              transaction.delete(doc(db!, 'users', id, 'teams', teamId));
          }
          transaction.set(ref, {
            schemaVersion: 2,
            teamIds: mergedIds,
            updatedAt: serverTimestamp(),
          });
        }
        return merged;
      });
      if (!valid(generation, id)) return;
      const current = readSavedTeams(localStorage);
      const rebased = mergeSavedTeams(
        capturedLocal,
        current,
        committed,
        recoveryIds
      );
      const changed = teamsSnapshot(current) !== teamsSnapshot(rebased);
      if (changed) localStorage.setItem(storageKey, JSON.stringify(rebased));
      if (!valid(generation, id)) return;
      store(account(id), committed, rebased);
      base = committed;
      if (changed) sync.revision++;
      if (teamsSnapshot(rebased) !== teamsSnapshot(committed)) {
        pending = true;
        savePending = true;
      } else if (!pending) {
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
    const local = readSavedTeams(localStorage);
    store(account(uid), base, local);
    await request(true);
  } catch (error) {
    fail(error);
  }
}
