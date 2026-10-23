import {
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import {
  inspectRawCurrentSet,
  mergeCurrentSets,
  resolveLegacyDuplicates,
  stageCurrentSets,
  type CurrentSet,
  type CurrentSetCandidate,
  type CurrentSetStage,
} from './current-sets.ts';
import { canonicalSnapshot } from './team-history.ts';

export const currentSetCloudReadError =
  'Cloud current Pokémon sets could not be read. Existing data has been left untouched.';

const currentSetIdPattern = /^[a-z0-9]{1,1500}$/;

export interface CurrentSetCloudDocument {
  path: string;
  data: unknown;
}

export interface CurrentSetCloudProbe {
  path: string;
  data: unknown | null;
}

export interface CurrentSetCloudSnapshot {
  setIds: string[];
  entries: CurrentSet[];
  canonical: CurrentSet[];
  stored: { setIds: string[]; entries: CurrentSet[] };
  manifest: unknown | null;
}

export function watchCurrentSetDocument(
  reference: DocumentReference,
  valid: () => boolean,
  changed: (snapshot: DocumentSnapshot) => void,
  failed: (error: unknown) => void
) {
  return onSnapshot(
    reference,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.hasPendingWrites || !valid()) return;
      try {
        changed(snapshot);
      } catch (error) {
        failed(error);
      }
    },
    failed
  );
}

export interface DecodeCurrentSetCloudInput {
  uid: string;
  manifestPath: string;
  manifest: unknown | null;
  listed: CurrentSetCloudDocument[];
  probes: CurrentSetCloudProbe[];
}

function failCloudRead(): never {
  throw new Error(currentSetCloudReadError);
}

function currentSetManifestPath(uid: string): string {
  return `users/${uid}/pokemonSetState/manifest`;
}

function currentSetDocumentPath(uid: string, id: string): string {
  return `users/${uid}/pokemonSets/${id}`;
}

function currentSetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1500) return failCloudRead();
  let previous = '';
  for (const id of value) {
    if (
      typeof id !== 'string' ||
      !currentSetIdPattern.test(id) ||
      (previous !== '' && previous >= id)
    )
      return failCloudRead();
    previous = id;
  }
  return value as string[];
}

function manifestIds(value: unknown | null): string[] {
  if (value === null) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return failCloudRead();
  const manifest = value as Record<string, unknown>;
  if (
    Object.keys(manifest).sort().join(',') !==
      'schemaVersion,setIds,updatedAt' ||
    manifest.schemaVersion !== 1 ||
    !(manifest.updatedAt instanceof Timestamp)
  )
    return failCloudRead();
  return currentSetIds(manifest.setIds);
}

function decodeCloudDocument(
  uid: string,
  document: CurrentSetCloudDocument
): CurrentSetCandidate {
  if (!document || typeof document !== 'object' || Array.isArray(document))
    return failCloudRead();
  if (typeof document.path !== 'string') return failCloudRead();
  const id = document.path.slice(document.path.lastIndexOf('/') + 1);
  if (
    !currentSetIdPattern.test(id) ||
    document.path !== currentSetDocumentPath(uid, id) ||
    !document.data ||
    typeof document.data !== 'object' ||
    Array.isArray(document.data) ||
    !('id' in document.data) ||
    document.data.id !== id
  )
    return failCloudRead();
  try {
    const candidate = inspectRawCurrentSet(document.data);
    if (candidate.originalId !== id) return failCloudRead();
    return candidate;
  } catch {
    return failCloudRead();
  }
}

function listedCandidates(
  uid: string,
  setIds: string[],
  documents: CurrentSetCloudDocument[]
): CurrentSetCandidate[] {
  if (documents.length !== setIds.length) return failCloudRead();
  const expected = new Set(setIds);
  const found = new Set<string>();
  const candidates: CurrentSetCandidate[] = [];
  for (const document of documents) {
    const candidate = decodeCloudDocument(uid, document);
    if (!expected.has(candidate.originalId) || found.has(candidate.originalId))
      return failCloudRead();
    found.add(candidate.originalId);
    candidates.push(candidate);
  }
  if (found.size !== expected.size) return failCloudRead();
  return candidates.sort((a, b) =>
    a.originalId < b.originalId ? -1 : a.originalId > b.originalId ? 1 : 0
  );
}

function aliasProbeIds(
  setIds: string[],
  candidates: readonly CurrentSetCandidate[]
): string[] {
  const listed = new Set(setIds);
  const ids = new Set<string>();
  for (const candidate of candidates)
    if (candidate.originalId !== candidate.id && !listed.has(candidate.id))
      ids.add(candidate.id);
  return [...ids].sort();
}

export function decodeCurrentSetCloud(
  input: DecodeCurrentSetCloudInput
): CurrentSetCloudSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return failCloudRead();
  const { uid, manifestPath, manifest, listed, probes } = input;
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.includes('/') ||
    manifestPath !== currentSetManifestPath(uid) ||
    !Array.isArray(listed) ||
    !Array.isArray(probes)
  )
    return failCloudRead();

  const setIds = manifestIds(manifest);
  const candidates = listedCandidates(uid, setIds, listed);
  const probeIds = aliasProbeIds(setIds, candidates);
  if (probes.length !== probeIds.length) return failCloudRead();

  const probeById = new Map<string, CurrentSetCloudProbe>();
  for (const probe of probes) {
    if (!probe || typeof probe !== 'object' || Array.isArray(probe))
      return failCloudRead();
    if (typeof probe.path !== 'string') return failCloudRead();
    const id = probe.path.slice(probe.path.lastIndexOf('/') + 1);
    if (
      !currentSetIdPattern.test(id) ||
      probe.path !== currentSetDocumentPath(uid, id) ||
      !probeIds.includes(id) ||
      probeById.has(id)
    )
      return failCloudRead();
    probeById.set(id, probe);
  }
  if (probeById.size !== probeIds.length) return failCloudRead();

  for (const id of probeIds) {
    const probe = probeById.get(id);
    if (!probe) return failCloudRead();
    if (probe.data !== null) {
      const candidate = decodeCloudDocument(uid, probe);
      if (candidate.originalId !== id) return failCloudRead();
    }
  }

  const resolved = resolveLegacyDuplicates(candidates);
  const canonicalIds = new Set<string>();
  for (const { id } of resolved) {
    if (canonicalIds.has(id)) return failCloudRead();
    canonicalIds.add(id);
  }
  const entries = listed
    .map(({ data }) => data as CurrentSet)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const storedEntries = new Map<string, CurrentSet>();
  for (const entry of entries) storedEntries.set(entry.id, entry);
  for (const { data } of probes) {
    if (data === null) continue;
    const entry = data as CurrentSet;
    storedEntries.set(entry.id, entry);
  }

  return {
    setIds,
    entries,
    canonical: resolved.map(({ id, member }) => ({ id, member })),
    stored: {
      setIds,
      entries: [...storedEntries.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      ),
    },
    manifest,
  };
}

function assertCurrent(guard: () => boolean): void {
  if (!guard()) throw new Error('Sync account changed.');
}

async function getCurrent(
  transaction: Transaction,
  reference: DocumentReference,
  guard: () => boolean
): Promise<DocumentSnapshot> {
  assertCurrent(guard);
  const snapshot = await transaction.get(reference);
  assertCurrent(guard);
  return snapshot;
}

export async function readCurrentSetCloud(
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  guard: () => boolean
): Promise<CurrentSetCloudSnapshot> {
  if (!uid || uid.includes('/')) return failCloudRead();
  if (!navigator.onLine)
    throw new Error('Cloud in-game sets need a connection to sync.');
  assertCurrent(guard);
  const manifestPath = currentSetManifestPath(uid);
  const manifestSnapshot = await getCurrent(
    transaction,
    doc(firestore, 'users', uid, 'pokemonSetState', 'manifest'),
    guard
  );
  const manifest = manifestSnapshot.exists() ? manifestSnapshot.data() : null;
  const setIds = manifestIds(manifest);
  const listed: CurrentSetCloudDocument[] = [];
  for (const id of setIds) {
    const path = currentSetDocumentPath(uid, id);
    const child = await getCurrent(
      transaction,
      doc(firestore, 'users', uid, 'pokemonSets', id),
      guard
    );
    if (!child.exists()) return failCloudRead();
    listed.push({ path, data: child.data() });
  }

  const probes: CurrentSetCloudProbe[] = [];
  for (const id of aliasProbeIds(
    setIds,
    listedCandidates(uid, setIds, listed)
  )) {
    const child = await getCurrent(
      transaction,
      doc(firestore, 'users', uid, 'pokemonSets', id),
      guard
    );
    probes.push({
      path: currentSetDocumentPath(uid, id),
      data: child.exists() ? child.data() : null,
    });
  }
  return decodeCurrentSetCloud({
    uid,
    manifestPath,
    manifest,
    listed,
    probes,
  });
}

export interface CurrentSetTransactionInput {
  transaction: Transaction;
  firestore: Firestore;
  uid: string;
  guard: () => boolean;
  base: CurrentSet[] | null;
  local: CurrentSet[];
}

export async function stageCurrentSetsInTransaction(
  input: CurrentSetTransactionInput
): Promise<{ cloud: CurrentSetCloudSnapshot; stage: CurrentSetStage }> {
  const cloud = await readCurrentSetCloud(
    input.transaction,
    input.firestore,
    input.uid,
    input.guard
  );
  const desired = mergeCurrentSets(input.base, input.local, cloud.canonical);
  const stage = stageCurrentSets(cloud.canonical, desired, cloud.stored);
  if (
    cloud.manifest === null ||
    canonicalSnapshot(stage.setIds) !== canonicalSnapshot(cloud.setIds) ||
    stage.writes.length
  ) {
    for (const entry of stage.writes) {
      assertCurrent(input.guard);
      input.transaction.set(
        doc(input.firestore, 'users', input.uid, 'pokemonSets', entry.id),
        entry
      );
    }
    assertCurrent(input.guard);
    input.transaction.set(
      doc(input.firestore, 'users', input.uid, 'pokemonSetState', 'manifest'),
      {
        schemaVersion: 1,
        setIds: stage.setIds,
        updatedAt: serverTimestamp(),
      }
    );
  }
  return { cloud, stage };
}
