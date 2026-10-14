import { z } from 'zod';
import { normalize, pokemonId, type Member } from './catalog.ts';
import { updateSetText } from './paste.ts';
import { canonicalSnapshot } from './team-history.ts';
import { memberSchema } from './workbench.ts';

export const currentSetsKey = 'champions-atlas:current-sets:v1';

export interface CurrentSet {
  id: string;
  member: Member;
}

export type CurrentSetScope = 'evs' | 'moves' | 'all';

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

function sameEntry(a: CurrentSet | undefined, b: CurrentSet | undefined) {
  return a === undefined
    ? b === undefined
    : b !== undefined && canonicalSnapshot(a) === canonicalSnapshot(b);
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

export function saveCurrentSet(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  member: Member
): CurrentSet[] {
  const current = readCurrentSets(storage);
  const entry = {
    id: pokemonId(member.pokemon),
    member: structuredClone(member),
  };
  const index = current.findIndex(({ id }) => id === entry.id);
  const candidate = [...current];
  if (index === -1) candidate.push(entry);
  else candidate[index] = entry;

  const serialized = JSON.stringify(candidate);
  if (serialized === undefined) throw new Error(readError);
  const validated = validateCurrentSets(JSON.parse(serialized));
  if (currentSetsSnapshot(current) === currentSetsSnapshot(validated))
    return current;
  storage.setItem(currentSetsKey, serialized);
  return validated;
}

export function reuseCurrentSet(
  current: Member,
  saved: Member,
  scope: CurrentSetScope
): Member {
  if (pokemonId(current.pokemon) !== pokemonId(saved.pokemon))
    throw new Error('Current set Pokémon does not match the selected Pokémon.');
  if (scope === 'all') return structuredClone(saved);
  const next = structuredClone(current);
  if (scope === 'evs') {
    next.nature = saved.nature;
    next.spread = saved.spread;
  } else if (scope === 'moves') {
    next.moves = structuredClone(saved.moves);
  } else {
    throw new Error('Unknown current-set reuse scope.');
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
  for (const id of pendingIds.slice(0, 350))
    committed.set(id, desiredMap.get(id)!);
  return {
    committed: validateCurrentSets(
      [...committed.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      )
    ),
    pendingIds: pendingIds.slice(350),
  };
}
