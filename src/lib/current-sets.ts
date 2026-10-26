import { z } from 'zod';
import { normalize, pokemonId, type Member } from './catalog.ts';
import { canonicalMember, updateSetText } from './paste.ts';
import { memberSetSignature } from './spread-provenance.ts';
import { canonicalSnapshot } from './team-history.ts';
import { memberSchema } from './workbench.ts';

export const currentSetsKey = 'champions-atlas:current-sets:v1';

export const currentSetsChangedEvent = 'champions-atlas:current-sets-changed';

export interface CurrentSet {
  id: string;
  member: Member;
}

export interface CurrentSetSavePlan {
  current: CurrentSet[];
  incoming: CurrentSet[];
  overwritten: CurrentSet[];
}

export type CurrentSetChoice =
  | { kind: 'set' | 'item' | 'ability' | 'nature' | 'spread' }
  | { kind: 'move'; index: number; move: string };

const readError =
  'Current Pokémon sets could not be read. Existing data has been left untouched.';

const idSchema = z.string().regex(/^[a-z0-9]{1,1500}$/);
const rawCurrentSetSchema = z.strictObject({
  id: idSchema,
  member: memberSchema,
});

export interface CurrentSetCandidate extends CurrentSet {
  originalId: string;
}

export function restoreStorageValue(
  storage: Storage,
  key: string,
  raw: string | null
): void {
  if (raw === null) storage.removeItem(key);
  else storage.setItem(key, raw);
}

export function inspectRawCurrentSet(value: unknown): CurrentSetCandidate {
  const result = rawCurrentSetSchema.safeParse(value);
  if (!result.success) throw new Error(readError);
  const { id: originalId, member } = result.data;
  const id = pokemonId(member.pokemon);
  const legacyMegaZ =
    /[- ]mega[- ]z$/i.test(member.pokemon) &&
    originalId === normalize(member.pokemon);
  if (originalId !== id && !legacyMegaZ) throw new Error(readError);

  const moves = member.moves.map(normalize);
  if (moves.some((move) => !move) || new Set(moves).size !== moves.length)
    throw new Error(readError);
  return { originalId, id, member };
}

export function inspectCurrentSets(value: unknown): CurrentSetCandidate[] {
  const result = z.array(z.unknown()).max(1500).safeParse(value);
  if (!result.success) throw new Error(readError);

  const candidates = Array.from(result.data, inspectRawCurrentSet);
  const originalIds = new Set<string>();
  for (const candidate of candidates) {
    if (originalIds.has(candidate.originalId)) throw new Error(readError);
    originalIds.add(candidate.originalId);
  }
  return candidates;
}

export function resolveLegacyDuplicates(
  candidates: readonly CurrentSetCandidate[]
): CurrentSetCandidate[] {
  const canonical = new Set(
    candidates
      .filter(({ id, originalId }) => id === originalId)
      .map(({ id }) => id)
  );
  return candidates.filter(
    (candidate) =>
      candidate.originalId === candidate.id || !canonical.has(candidate.id)
  );
}

export function readCurrentSetsValue(value: unknown): CurrentSet[] {
  const raw = JSON.stringify(value);
  if (raw === undefined) throw new Error(readError);
  return readCurrentSets({ getItem: () => raw });
}

function validateCurrentSets(value: unknown): CurrentSet[] {
  const resolved = resolveLegacyDuplicates(inspectCurrentSets(value));
  const ids = new Set<string>();
  for (const { id } of resolved) {
    if (ids.has(id)) throw new Error(readError);
    ids.add(id);
  }
  return resolved.map(({ id, member }) => ({ id, member }));
}

function serializeCurrentSets(sets: CurrentSet[]) {
  const serialized = JSON.stringify(sets);
  if (serialized === undefined) throw new Error(readError);
  return {
    serialized,
    validated: validateCurrentSets(JSON.parse(serialized)),
  };
}

function sameEntry(a: CurrentSet | undefined, b: CurrentSet | undefined) {
  return a === undefined
    ? b === undefined
    : b !== undefined && canonicalSnapshot(a) === canonicalSnapshot(b);
}

function sameSet(a: Member, b: Member) {
  const signature = memberSetSignature(a);
  return signature !== null && signature === memberSetSignature(b);
}

export function currentSetsWouldChange(
  sets: CurrentSet[],
  members: Member[]
): boolean {
  return members.some((member) => {
    const id = pokemonId(member.pokemon);
    const stored = sets.find((entry) => entry.id === id);
    const incoming = { id, member };
    return !(
      sameEntry(stored, incoming) ||
      (stored !== undefined && sameSet(stored.member, member))
    );
  });
}

export function readCurrentSets(
  storage: Pick<Storage, 'getItem'>
): CurrentSet[] {
  const raw = storage.getItem(currentSetsKey);
  if (raw === null) return [];
  try {
    return validateCurrentSets(JSON.parse(raw));
  } catch (error) {
    throw new Error(readError, { cause: error });
  }
}

export function prepareCurrentSets(
  storage: Pick<Storage, 'getItem'>,
  members: Member[]
): CurrentSetSavePlan {
  const current = readCurrentSets(storage);
  const incoming = members.map((member) => {
    const snapshot = canonicalMember(structuredClone(member));
    if (typeof snapshot?.pokemon !== 'string') throw new Error(readError);
    return { id: pokemonId(snapshot.pokemon), member: snapshot };
  });
  const incomingIds = new Set<string>();
  for (const { id } of incoming) {
    if (incomingIds.has(id))
      throw new Error('Cannot save two sets for the same Pokémon at once.');
    incomingIds.add(id);
  }

  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  const incomingById = new Map(incoming.map((entry) => [entry.id, entry]));
  const candidate = new Map(currentById);
  for (const entry of incoming) candidate.set(entry.id, entry);
  serializeCurrentSets([...candidate.values()]);

  const overwritten = incoming
    .flatMap(({ id }) => {
      const existing = currentById.get(id);
      const next = incomingById.get(id);
      return existing !== undefined &&
        next !== undefined &&
        !sameEntry(existing, next) &&
        !sameSet(existing.member, next.member)
        ? [structuredClone(existing)]
        : [];
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { current, incoming, overwritten };
}

export function saveCurrentSets(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  plan: CurrentSetSavePlan,
  replacementIds: ReadonlySet<string>
): CurrentSet[] {
  const offeredIds = new Set(plan.overwritten.map(({ id }) => id));
  for (const id of replacementIds)
    if (!offeredIds.has(id))
      throw new Error(
        'Cannot replace a Pokémon set that was not offered for replacement.'
      );

  const skippedIds = new Set(
    plan.overwritten
      .filter(({ id }) => !replacementIds.has(id))
      .map(({ id }) => id)
  );
  const latest = readCurrentSets(storage);
  const latestById = new Map(latest.map((entry) => [entry.id, entry]));
  const eligible = plan.incoming.filter((entry) => {
    if (skippedIds.has(entry.id)) return false;
    const latestEntry = latestById.get(entry.id);
    return (
      latestEntry === undefined || !sameSet(latestEntry.member, entry.member)
    );
  });
  if (eligible.length === 0) return latest;

  const currentById = new Map(plan.current.map((entry) => [entry.id, entry]));
  for (const entry of eligible) {
    const latestEntry = latestById.get(entry.id);
    if (
      !sameEntry(currentById.get(entry.id), latestEntry) &&
      !sameEntry(latestEntry, entry)
    )
      throw new Error(
        'Current Pokémon sets changed while confirming. Try saving again.'
      );
  }

  const merged = new Map(latestById);
  for (const entry of eligible) merged.set(entry.id, entry);
  const { serialized, validated } = serializeCurrentSets([...merged.values()]);
  if (currentSetsSnapshot(latest) === currentSetsSnapshot(validated))
    return latest;
  storage.setItem(currentSetsKey, serialized);
  return validated;
}

export function reuseCurrentSet(
  current: Member,
  saved: Member,
  choice: CurrentSetChoice
): Member {
  if (pokemonId(current.pokemon) !== pokemonId(saved.pokemon))
    throw new Error('Current set Pokémon does not match the selected Pokémon.');
  if (choice.kind === 'set') return structuredClone(saved);

  const next = structuredClone(current);
  if (choice.kind === 'item') next.item = saved.item;
  else if (choice.kind === 'ability') next.ability = saved.ability;
  else if (choice.kind === 'nature') next.nature = saved.nature;
  else if (choice.kind === 'spread') {
    next.nature = saved.nature;
    next.spread = saved.spread;
  } else if (choice.kind === 'move') {
    const { index, move } = choice;
    const moveKey = normalize(move);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index > 3 ||
      !moveKey ||
      !saved.moves.some((savedMove) => normalize(savedMove) === moveKey)
    )
      throw new Error('Invalid in-game move choice.');
    const slots = Array.from(
      { length: 4 },
      (_, slot) => next.moves[slot] ?? ''
    );
    slots[index] = move;
    next.moves = slots.filter(Boolean);
  } else {
    throw new Error('Unknown current-set reuse choice.');
  }
  next.set = updateSetText(current, next);
  return next;
}

export function mergeCurrentSets(
  base: CurrentSet[] | null,
  local: CurrentSet[],
  remote: CurrentSet[]
): CurrentSet[] {
  const baseMap = new Map(
    (base === null ? [] : validateCurrentSets(base)).map((entry) => [
      entry.id,
      entry,
    ])
  );
  const localMap = new Map(
    validateCurrentSets(local).map((entry) => [entry.id, entry])
  );
  const remoteMap = new Map(
    validateCurrentSets(remote).map((entry) => [entry.id, entry])
  );
  const ids = [...new Set([...localMap.keys(), ...remoteMap.keys()])].sort();
  const merged: CurrentSet[] = [];
  for (const id of ids) {
    const localEntry = localMap.get(id);
    const remoteEntry = remoteMap.get(id);
    const baseEntry = baseMap.get(id);
    const chosen =
      localEntry === undefined || sameEntry(localEntry, baseEntry)
        ? remoteEntry
        : localEntry;
    if (chosen !== undefined) merged.push(chosen);
  }
  return validateCurrentSets(merged);
}

export function currentSetsSnapshot(sets: CurrentSet[]): string {
  return canonicalSnapshot(
    validateCurrentSets(sets).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    )
  );
}

export interface CurrentSetWireState {
  setIds: string[];
  entries: CurrentSet[];
}

export interface CurrentSetStage {
  committed: CurrentSet[];
  pendingIds: string[];
  setIds: string[];
  writes: CurrentSet[];
  wireIds: ReadonlyMap<string, string>;
}

function wireEntries(stored: CurrentSetWireState) {
  const result = z.array(idSchema).max(1500).safeParse(stored.setIds);
  if (!result.success) throw new Error(readError);
  const ids = result.data;
  if (ids.some((id, i) => i > 0 && ids[i - 1] >= id))
    throw new Error(readError);
  const raw = new Map<string, CurrentSet>();
  for (const entry of stored.entries) {
    const candidate = inspectRawCurrentSet(entry);
    if (raw.has(candidate.originalId)) throw new Error(readError);
    raw.set(candidate.originalId, entry);
  }
  const active = resolveLegacyDuplicates(
    inspectCurrentSets(
      ids.map((id) => {
        const entry = raw.get(id);
        if (!entry) throw new Error(readError);
        return entry;
      })
    )
  );
  return { raw, active };
}

export function stageCurrentSets(
  remote: CurrentSet[],
  desired: CurrentSet[],
  stored: CurrentSetWireState
): CurrentSetStage {
  const remoteEntries = validateCurrentSets(remote);
  const desiredEntries = validateCurrentSets(desired);
  const physical = wireEntries(stored);
  if (
    currentSetsSnapshot(remoteEntries) !==
    currentSetsSnapshot(
      physical.active.map(({ id, member }) => ({ id, member }))
    )
  )
    throw new Error(readError);
  const changed = desiredEntries
    .filter((entry) => !sameEntry(entry, physical.raw.get(entry.id)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const writes = changed.slice(0, 350);
  const pendingIds = changed.slice(350).map(({ id }) => id);
  const pending = new Set(pendingIds);
  const completed = desiredEntries.filter(({ id }) => !pending.has(id));
  const completedIds = new Set(completed.map(({ id }) => id));
  const committed = new Map(remoteEntries.map((entry) => [entry.id, entry]));
  for (const entry of completed) committed.set(entry.id, entry);
  const wireIds = new Map(
    physical.active.map(({ id, originalId }) => [id, originalId])
  );
  for (const id of completedIds) wireIds.set(id, id);
  const setIds = [...wireIds.values()].sort();
  return {
    committed: validateCurrentSets(
      [...committed.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      )
    ),
    pendingIds,
    setIds,
    writes,
    wireIds,
  };
}

function retainCurrentSetWireIds(
  sets: CurrentSet[],
  identities: ReadonlyMap<string, string>
): CurrentSet[] {
  return validateCurrentSets(sets).map((entry) => {
    const wireId = identities.get(entry.id);
    if (wireId && wireId !== entry.id) {
      const wire = { id: wireId, member: entry.member };
      try {
        inspectRawCurrentSet(wire);
        return wire;
      } catch {
        return { id: entry.id, member: entry.member };
      }
    }
    return { id: entry.id, member: entry.member };
  });
}

export function rebaseStagedCurrentSets(
  captured: CurrentSet[],
  current: CurrentSet[],
  staged: CurrentSetStage
): { local: CurrentSet[]; base: CurrentSet[] } {
  const pending = new Set(staged.pendingIds);
  const local = new Map(
    [
      ...mergeCurrentSets(captured, current, staged.committed),
      ...current.filter(({ id }) => pending.has(id)),
    ].map((entry) => [entry.id, entry])
  );
  return {
    local: retainCurrentSetWireIds([...local.values()], staged.wireIds),
    base: retainCurrentSetWireIds(staged.committed, staged.wireIds),
  };
}
