import { browser } from '$app/environment';
import { initializeApp } from 'firebase/app';
import {
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
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import {
  activeTeamKey,
  browseStorageKey,
  readSavedTeams,
  storageKey,
} from './workbench.ts';

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';

export const sync = $state({
  configured: false,
  user: null as User | null,
  status: 'off' as SyncStatus,
  error: '',
});

let auth: Auth | null = null;
let db: Firestore | null = null;

function firebaseConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

export function initSync(): void {
  if (!browser || auth) return;
  const config = firebaseConfig();
  if (!config) return;
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  sync.configured = true;
  void getRedirectResult(auth).catch((error: unknown) => {
    sync.status = 'error';
    sync.error = error instanceof Error ? error.message : String(error);
  });
  onAuthStateChanged(auth, (user) => {
    sync.user = user;
    if (user) void pullNow();
  });
}

export async function signIn(): Promise<void> {
  if (!auth) return;
  sync.status = 'syncing';
  sync.error = '';
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    // `signInWithRedirect` never settles, so a popup is the only flow that can
    // report why sign-in failed.
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } else {
      sync.status = code === 'auth/popup-closed-by-user' ? 'off' : 'error';
      sync.error = error instanceof Error ? error.message : String(error);
    }
  }
}

export async function signOut(): Promise<void> {
  if (!auth) return;
  try {
    await signOutOfFirebase(auth);
  } catch (error) {
    sync.status = 'error';
    sync.error = error instanceof Error ? error.message : String(error);
  }
}

export async function pushNow(): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) return;
  sync.status = 'syncing';
  sync.error = '';
  try {
    await setDoc(doc(db, 'users', user.uid), {
      teams: readSavedTeams(localStorage),
      activeTeamId: localStorage.getItem(activeTeamKey),
      browse: localStorage.getItem(browseStorageKey),
      updatedAt: serverTimestamp(),
    });
    sync.status = 'synced';
  } catch (error) {
    sync.status = 'error';
    sync.error = error instanceof Error ? error.message : String(error);
  }
}

export async function pullNow(): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) return;
  sync.status = 'syncing';
  sync.error = '';
  try {
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    if (!snapshot.exists()) {
      sync.status = 'synced';
      return;
    }
    const data = snapshot.data() as {
      teams?: unknown;
      activeTeamId?: unknown;
      browse?: unknown;
    };
    const teams = JSON.stringify(
      readSavedTeams({ getItem: () => JSON.stringify(data.teams) })
    );
    const activeTeamId =
      typeof data.activeTeamId === 'string' ? data.activeTeamId : null;
    const browse = typeof data.browse === 'string' ? data.browse : null;
    const changed =
      localStorage.getItem(storageKey) !== teams ||
      localStorage.getItem(activeTeamKey) !== activeTeamId ||
      localStorage.getItem(browseStorageKey) !== browse;
    localStorage.setItem(storageKey, teams);
    if (activeTeamId === null) localStorage.removeItem(activeTeamKey);
    else localStorage.setItem(activeTeamKey, activeTeamId);
    if (browse === null) localStorage.removeItem(browseStorageKey);
    else localStorage.setItem(browseStorageKey, browse);
    sync.status = 'synced';
    // The pull settles after first paint, so pages have already read storage by
    // now. Reload once to render the pulled teams/filters.
    // ponytail: full reload; upgrade to a reactive re-read if the flash matters.
    if (changed) location.reload();
  } catch (error) {
    sync.status = 'error';
    sync.error = error instanceof Error ? error.message : String(error);
  }
}
