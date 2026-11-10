import type { Member } from './catalog.ts';

export function canonicalSnapshot(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalSnapshot).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(
          ([key, entry]) => JSON.stringify(key) + ':' + canonicalSnapshot(entry)
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

export interface MemberSnapshotDiffRow {
  field: string;
  before: string;
  after: string;
}

const memberCoreFields: Record<string, true> = {
  pokemon: true,
  item: true,
  ability: true,
  moves: true,
  nature: true,
  spread: true,
  set: true,
};

export function memberSnapshotDiff(
  before: Member,
  after: Member
): MemberSnapshotDiffRow[] {
  const rows: MemberSnapshotDiffRow[] = [];
  for (const [key, field] of [
    ['pokemon', 'Pokémon'],
    ['item', 'Item'],
    ['ability', 'Ability'],
    ['nature', 'Nature'],
    ['spread', 'EVs'],
  ] as const) {
    if (before[key] !== after[key])
      rows.push({
        field,
        before: before[key] ?? 'Unknown',
        after: after[key] ?? 'Unknown',
      });
  }

  if (canonicalSnapshot(before.moves) !== canonicalSnapshot(after.moves))
    rows.push({
      field: 'Moves',
      before: before.moves.join(', ') || 'None',
      after: after.moves.join(', ') || 'None',
    });
  if (before.set !== after.set)
    rows.push({
      field: 'Set text',
      before: before.set ?? '',
      after: after.set ?? '',
    });

  const beforeMetadata = canonicalSnapshot(
    Object.fromEntries(
      Object.entries(before).filter(
        ([key]) => !Object.hasOwn(memberCoreFields, key)
      )
    )
  );
  const afterMetadata = canonicalSnapshot(
    Object.fromEntries(
      Object.entries(after).filter(
        ([key]) => !Object.hasOwn(memberCoreFields, key)
      )
    )
  );
  if (beforeMetadata !== afterMetadata)
    rows.push({
      field: 'Saved metadata',
      before: beforeMetadata,
      after: afterMetadata,
    });
  return rows;
}
