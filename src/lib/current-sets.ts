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
const currentSetSchema = z
  .strictObject({
    id: idSchema,
    member: memberSchema,
  })
  .superRefine(({ id, member }, context) => {
    if (id !== pokemonId(member.pokemon))
      context.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'Invalid ID.',
      });
    const moves = member.moves.map(normalize);
    if (moves.some((move) => !move) || new Set(moves).size !== moves.length)
      context.addIssue({
        code: 'custom',
        path: ['member', 'moves'],
        message: 'Invalid moves.',
      });
  });
const currentSetsSchema = z
  .array(currentSetSchema)
  .max(1500)
  .superRefine((sets, context) => {
    const ids = new Set<string>();
    for (const [index, { id }] of sets.entries()) {
      if (ids.has(id))
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'Duplicate ID.',
        });
      ids.add(id);
    }
  });

function validateCurrentSets(value: unknown): CurrentSet[] {
  const result = currentSetsSchema.safeParse(value);
  if (!result.success) throw new Error(readError);
  return result.data;
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
  } catch {
    throw new Error(readError);
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

export function stageCurrentSets(
  remote: CurrentSet[],
  desired: CurrentSet[]
): { committed: CurrentSet[]; pendingIds: string[] } {
  const remoteEntries = validateCurrentSets(remote);
  const desiredEntries = validateCurrentSets(desired);
  const remoteMap = new Map(remoteEntries.map((entry) => [entry.id, entry]));
  const desiredMap = new Map(desiredEntries.map((entry) => [entry.id, entry]));
  const pendingIds = desiredEntries
    .filter((entry) => !sameEntry(entry, remoteMap.get(entry.id)))
    .map(({ id }) => id)
    .sort();
  const committed = new Map(remoteEntries.map((entry) => [entry.id, entry]));
  for (const id of pendingIds.slice(0, 350)) {
    const entry = desiredMap.get(id);
    if (!entry) throw new Error(`missing desired current set: ${id}`);
    committed.set(id, entry);
  }
  return {
    committed: validateCurrentSets(
      [...committed.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      )
    ),
    pendingIds: pendingIds.slice(350),
  };
}
