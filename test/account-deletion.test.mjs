import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { deleteUserData } from '../src/lib/account-deletion.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = !host && 'needs the Firestore emulator: npm run test:rules';
const apps = [];

after(() => Promise.all(apps.map((app) => deleteApp(app))));

const client = (name, token) => {
  const app = initializeApp({ projectId: 'demo-champions-atlas' }, name);
  apps.push(app);
  const db = getFirestore(app);
  const [hostname, port] = host.split(':');
  connectFirestoreEmulator(
    db,
    hostname,
    Number(port),
    token ? { mockUserToken: token } : undefined
  );
  return db;
};

const clients = new Map();
const as = (uid) => {
  if (!clients.has(uid)) clients.set(uid, client(uid, { sub: uid }));
  return clients.get(uid);
};
let adminDb;
const admin = () => (adminDb ??= client('admin', 'owner'));

const tokenId = (uid, index) =>
  createHash('sha256').update(`${uid}-${index}`).digest('hex');

const seed = async (uid, { teams = 0, sets = 0, tokens = 0 } = {}) => {
  const db = admin();
  const teamIds = Array.from({ length: teams }, (_, i) => `${uid}team${i}`);
  const setIds = Array.from({ length: sets }, (_, i) => `${uid}set${i}`);
  const parent = doc(db, 'users', uid);
  const updatedAt = serverTimestamp();
  await setDoc(parent, { schemaVersion: 2, teamIds, updatedAt });
  await Promise.all([
    ...teamIds.map((id) => setDoc(doc(parent, 'teams', id), { id })),
    setDoc(doc(parent, 'pokemonSetState', 'manifest'), {
      schemaVersion: 1,
      setIds,
      updatedAt,
    }),
    ...setIds.map((id) =>
      setDoc(doc(parent, 'pokemonSets', id), {
        id,
        member: {
          pokemon: 'Pikachu',
          item: null,
          ability: null,
          moves: [],
          nature: null,
          spread: null,
        },
      })
    ),
    setDoc(doc(parent, 'catalogState', 'regulations'), {
      schemaVersion: 1,
      entries: [],
      updatedAt,
    }),
    ...Array.from({ length: tokens }, (_, i) =>
      setDoc(doc(db, 'pushTokens', tokenId(uid, i)), { uid, updatedAt })
    ),
  ]);
  return { teamIds, setIds };
};

const exists = async (...path) =>
  (await getDoc(doc(admin(), ...path))).exists();
const size = async (ref) => (await getDocs(ref)).size;
const tokensOf = (uid) =>
  query(collection(admin(), 'pushTokens'), where('uid', '==', uid));

test(
  'deletes every cloud document the account owns and nothing else',
  { skip },
  async () => {
    await seed('alice', { teams: 2, sets: 2, tokens: 2 });
    const bob = await seed('bob', { teams: 1, sets: 1, tokens: 1 });

    await deleteUserData(as('alice'), 'alice');

    assert.equal(await exists('users', 'alice'), false);
    assert.equal(
      await exists('users', 'alice', 'pokemonSetState', 'manifest'),
      false
    );
    assert.equal(
      await exists('users', 'alice', 'catalogState', 'regulations'),
      false
    );
    assert.equal(await size(collection(admin(), 'users', 'alice', 'teams')), 0);
    assert.equal(
      await size(collection(admin(), 'users', 'alice', 'pokemonSets')),
      0
    );
    assert.equal(await size(tokensOf('alice')), 0);
    assert.equal(await exists('users', 'bob'), true);
    assert.equal(await exists('users', 'bob', 'teams', bob.teamIds[0]), true);
    assert.equal(
      await exists('users', 'bob', 'pokemonSets', bob.setIds[0]),
      true
    );
    assert.equal(await exists('pushTokens', tokenId('bob', 0)), true);
  }
);

test(
  'deletes an account that has only the parent document',
  { skip },
  async () => {
    await setDoc(doc(admin(), 'users', 'carol'), {
      schemaVersion: 2,
      teamIds: [],
      updatedAt: serverTimestamp(),
    });

    await deleteUserData(as('carol'), 'carol');

    assert.equal(await exists('users', 'carol'), false);
  }
);

test('refuses to touch another account', { skip }, async () => {
  await seed('dave', { teams: 1 });
  const erin = await seed('erin', { teams: 1, tokens: 1 });

  await assert.rejects(deleteUserData(as('dave'), 'erin'), {
    code: 'permission-denied',
  });
  assert.equal(await exists('users', 'erin'), true);
  assert.equal(await exists('users', 'erin', 'teams', erin.teamIds[0]), true);
  await assert.rejects(getDocs(collection(client('anon'), 'pushTokens')), {
    code: 'permission-denied',
  });
});
