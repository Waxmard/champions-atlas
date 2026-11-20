import { browser } from '$app/env';
import { initializeApp } from 'firebase/app';
import {
  deleteUser,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithCredential,
  signOut as signOutOfFirebase,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
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
import { AtlasNative, isNativeApp, type PushRegistration } from './native.ts';
import { readNotificationSettings } from './catalog-news.ts';
import { canonicalSnapshot } from './team-history.ts';
import {
  readSyncCache,
  readSyncLog,
  dropSentSyncFailures,
  recordSyncFailure,
  saveSyncRebase,
  storeCurrentSetSyncCache as store,
  syncOwnerKey,
  syncRecordKey,
  syncOutboxKey,
  wireCurrentSets,
} from './storage-migration.ts';
import { copyText } from './clipboard.ts';
import { notify } from './notifications.ts';
import { deleteUserData } from './account-deletion.ts';
import { uploadSyncFailures } from './sync-reports.ts';
import {
  reloadBattleFormat,
  reloadRegulationOverrides,
} from './catalog-runtime.svelte.ts';
import {
  mergeRegulationOverrides,
  parseRegulationOverrides,
  readRegulationOverrides,
  writeRegulationOverrides,
} from './regulation-overrides.ts';
import {
  parseBattleFormat,
  readBattleFormat,
  writeBattleFormat,
} from './battle-format.ts';

type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';

export const sync = $state({
  configured: false,
  authResolved: false,
  user: null as User | null,
  status: 'off' as SyncStatus,
  error: '',
  deletion: '' as '' | 'deleting' | 'deleted',
  revision: 0,
});

let auth: Auth | null = null;
let db: Firestore | null = null;
let projectId = '';
let session = 0;
let uid = '';
let unsubscribe: Unsubscribe | null = null;
let unsubscribeSets: Unsubscribe | null = null;
let unsubscribeRegulations: Unsubscribe | null = null;
let unsubscribeProfile: Unsubscribe | null = null;
let base: SavedTeam[] | null = null;
let setsBase: CurrentSet[] | null = null;
let setManifestSnapshot: string | null = null;
let pending = false;
let savePending = false;
let running: Promise<void> | null = null;
let reporting: Promise<void> | null = null;

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

const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';

function fail(error: unknown, step: string) {
  const message = error instanceof Error ? error.message : String(error);
  sync.status = 'error';
  sync.error = message;
  const cause = error instanceof Error ? error.cause : undefined;
  const entry = {
    at: new Date().toISOString(),
    step,
    code: errorCode(error) || errorCode(cause),
    message,
    cause: cause === undefined ? '' : String(cause),
    online: navigator.onLine,
    visible: document.visibilityState === 'visible',
    version: __APP_VERSION__,
  };
  recordSyncFailure(localStorage, entry);
  recordSyncFailure(localStorage, { ...entry, uid }, syncOutboxKey);
  reportFailures();
}

function reportFailures(): void {
  if (reporting || !db || !uid) return;
  const entries = readSyncLog(localStorage, syncOutboxKey).filter(
    (entry) => (entry as { uid?: unknown } | null)?.uid === uid
  );
  if (!entries.length) return;
  reporting = uploadSyncFailures(db, uid, entries)
    .then(
      () => void dropSentSyncFailures(localStorage, entries),
      () => undefined
    )
    .finally(() => {
      reporting = null;
    });
}

function invalidate() {
  session++;
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeSets?.();
  unsubscribeSets = null;
  unsubscribeRegulations?.();
  unsubscribeRegulations = null;
  unsubscribeProfile?.();
  unsubscribeProfile = null;
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
            } catch (cause) {
              throw new Error(cloudReadError, { cause });
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
            } catch (cause) {
              throw new Error(cloudReadError, { cause });
            }
            for (const teamId of manifest) {
              if (!guarded()) throw new Error('Sync account changed.');
              const child = await transaction
                .get(doc(firestore, 'users', id, 'teams', teamId))
                .catch((cause: unknown) => {
                  throw new Error(cloudReadError, { cause });
                });
              if (!guarded()) throw new Error('Sync account changed.');
              if (!child.exists() || child.data().id !== teamId)
                throw new Error(cloudReadError);
              try {
                remote.push(...validatedTeams([child.data()]));
              } catch (cause) {
                throw new Error(cloudReadError, { cause });
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
        const stage = await stageCurrentSetsInTransaction({
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
        return { teams: merged, stage };
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
        committed.stage
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
      } else if (!pending && !savePending) {
        sync.status = 'synced';
        reportFailures();
      }
    } catch (error) {
      if (generation === session && uid === id) {
        pending = false;
        savePending = false;
        fail(error, 'teams');
      }
      return;
    }
  }
}

export async function syncRegulations(): Promise<void> {
  if (!db || !uid) return;
  const generation = session;
  const id = uid;
  const ref = doc(db, 'users', id, 'catalogState', 'regulations');
  try {
    const merged = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const remote = snapshot.exists()
        ? parseRegulationOverrides(snapshot.data().entries)
        : [];
      const next = mergeRegulationOverrides(
        readRegulationOverrides(localStorage) ?? [],
        remote
      );
      if (canonicalSnapshot(next) !== canonicalSnapshot(remote))
        transaction.set(ref, {
          schemaVersion: 1,
          entries: next,
          updatedAt: serverTimestamp(),
        });
      return next;
    });
    if (!valid(generation, id)) return;
    const local = readRegulationOverrides(localStorage);
    if (local)
      writeRegulationOverrides(
        localStorage,
        mergeRegulationOverrides(local, merged)
      );
    reloadRegulationOverrides();
  } catch (error) {
    if (generation === session) fail(error, 'regulations');
  }
}

export async function syncProfile(): Promise<void> {
  if (!db || !uid) return;
  const generation = session;
  const id = uid;
  const ref = doc(db, 'users', id, 'profile', 'settings');
  try {
    const next = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const remote = snapshot.exists()
        ? parseBattleFormat(snapshot.data())
        : null;
      const local = readBattleFormat(localStorage);
      const newest = remote && remote.at >= local.at ? remote : local;
      if (newest.at > 0 && newest !== remote)
        transaction.set(ref, {
          schemaVersion: 1,
          format: newest.format,
          at: newest.at,
          updatedAt: serverTimestamp(),
        });
      return newest;
    });
    if (!valid(generation, id)) return;
    const local = readBattleFormat(localStorage);
    if (next.at <= local.at) return;
    writeBattleFormat(localStorage, next);
    reloadBattleFormat();
    if (next.format !== local.format) void syncPushToken();
  } catch (error) {
    if (generation === session) fail(error, 'profile');
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
  if (!browser || !isNativeApp || auth) return;
  const config = firebaseConfig();
  if (!config) return;
  projectId = config.projectId;
  const app = initializeApp(config);
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  db = getFirestore(app);
  const firestore = db;
  sync.configured = true;
  window.addEventListener('online', () => {
    if (uid) void request();
  });
  document.addEventListener('visibilitychange', () => {
    if (uid && document.visibilityState === 'visible') void request();
  });
  function activateUser(user: User) {
    try {
      adopt(user.uid);
      uid = user.uid;
      sync.user = user;
      const generation = session;
      unsubscribe = watchCurrentSetDocument(
        doc(firestore, 'users', uid),
        () => valid(generation, user.uid),
        () => void request(),
        (error) => generation === session && fail(error, 'teams-listener')
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
        (error) => generation === session && fail(error, 'sets-listener')
      );
      unsubscribeRegulations = watchCurrentSetDocument(
        doc(firestore, 'users', uid, 'catalogState', 'regulations'),
        () => valid(generation, user.uid),
        () => void syncRegulations(),
        (error) => generation === session && fail(error, 'regulations-listener')
      );
      unsubscribeProfile = watchCurrentSetDocument(
        doc(firestore, 'users', uid, 'profile', 'settings'),
        () => valid(generation, user.uid),
        () => void syncProfile(),
        (error) => generation === session && fail(error, 'profile-listener')
      );
      void request();
      void syncPushToken();
    } catch (error) {
      fail(error, 'activate');
    }
  }
  onAuthStateChanged(auth, (user) => {
    invalidate();
    sync.user = null;
    sync.authResolved = true;
    if (!user) {
      sync.status = 'off';
      sync.error = '';
      return;
    }
    activateUser(user);
  });
}

export async function signIn(): Promise<void> {
  if (!auth) return;
  sync.status = 'syncing';
  sync.error = '';
  sync.deletion = '';
  try {
    const { idToken } = await AtlasNative.signInWithGoogle();
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (error) {
    const code = errorCode(error);
    if (code === 'SIGN_IN_CANCELLED') {
      sync.status = 'off';
      sync.error = '';
      return;
    }
    fail(error, 'sign-in');
    sync.error = navigator.onLine
      ? 'Sign-in did not finish. Try again.'
      : 'You are offline. Connect to the internet, then try again.';
  }
}

export async function signOut(): Promise<void> {
  if (!auth) return;
  if (db && isNativeApp) {
    const firestore = db;
    await Promise.race([
      AtlasNative.registerPush({ authorize: false })
        .then(({ token }) =>
          token ? deleteDoc(doc(firestore, 'pushTokens', token)) : undefined
        )
        .catch(() => undefined),
      new Promise((done) => setTimeout(done, 3000)),
    ]);
  }
  invalidate();
  sync.user = null;
  let nativeError: unknown;
  try {
    await AtlasNative.signOut();
  } catch (error) {
    nativeError = error;
  }
  try {
    await signOutOfFirebase(auth);
    if (nativeError) {
      fail(nativeError, 'sign-out');
    } else {
      sync.status = 'off';
      sync.error = '';
    }
  } catch (error) {
    fail(error, 'sign-out');
  }
}

const deleteError =
  'Account deletion did not finish. Sign in with the same Google account and try again.';

export async function deleteAccount(): Promise<void> {
  const user = auth?.currentUser;
  if (!user || !db) return;
  const firestore = db;
  try {
    const { idToken } = await AtlasNative.signInWithGoogle();
    await reauthenticateWithCredential(
      user,
      GoogleAuthProvider.credential(idToken)
    );
  } catch (error) {
    if (errorCode(error) !== 'SIGN_IN_CANCELLED') {
      const { status, error: syncError } = sync;
      fail(error, 'delete-account');
      sync.status = status;
      sync.error = syncError;
      notify(deleteError);
    }
    return;
  }
  const inflight = running;
  invalidate();
  sync.user = null;
  sync.status = 'syncing';
  sync.error = '';
  sync.deletion = 'deleting';
  localStorage.removeItem(syncOwnerKey);
  try {
    await inflight;
    await reporting;
    await deleteUserData(firestore, user.uid);
    await deleteUser(user);
  } catch (error) {
    await signOut();
    sync.deletion = '';
    fail(error, 'delete-account');
    sync.error = deleteError;
    notify(deleteError);
    return;
  }
  await signOut();
  sync.deletion = 'deleted';
}

export async function syncPushToken(): Promise<PushRegistration | null> {
  if (!db || !uid) return null;
  const firestore = db;
  const owner = uid;
  const settings = readNotificationSettings(localStorage);
  const enabled = settings.newTeams || settings.pokemon.length > 0;
  try {
    const result = await AtlasNative.registerPush({ authorize: enabled });
    if (result.token && owner === uid) {
      const ref = doc(firestore, 'pushTokens', result.token);
      await (enabled && result.granted
        ? setDoc(ref, {
            uid: owner,
            ...settings,
            format: readBattleFormat(localStorage).format,
            updatedAt: serverTimestamp(),
          })
        : deleteDoc(ref));
    }
    return result;
  } catch {
    return null;
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
    fail(error, 'push');
  }
}

export async function copySyncLog(): Promise<string> {
  const copied = await copyText(
    JSON.stringify(readSyncLog(localStorage), null, 2)
  );
  return copied ? 'Sync log copied.' : 'Copy unavailable.';
}
