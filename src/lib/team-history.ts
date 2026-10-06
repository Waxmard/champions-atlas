import { normalize, type Member } from './catalog.ts';
import type { SavedTeam } from './workbench.ts';

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

export function checkpointTeam(
  previous: SavedTeam,
  next: SavedTeam,
  checkpoint: { id: string; label: string }
): SavedTeam {
  const retained = {
    ...next,
    original: previous.original,
    origin: previous.origin,
    history: previous.history,
  };
  if (
    canonicalSnapshot({ name: previous.name, members: previous.members }) ===
      canonicalSnapshot({ name: next.name, members: next.members }) ||
    previous.history.at(-1)?.id === checkpoint.id
  )
    return retained;
  if (previous.history.some(({ id }) => id === checkpoint.id))
    throw new Error(
      'This editing session changed elsewhere. Reopen the editor.'
    );
  return {
    ...retained,
    history: [
      ...previous.history,
      {
        id: checkpoint.id,
        savedAt: new Date().toISOString(),
        label: checkpoint.label,
        name: previous.name,
        members: structuredClone(previous.members),
      },
    ].slice(-20),
  };
}

export function restoreTeam(
  team: SavedTeam,
  revisionId: string | 'original'
): SavedTeam {
  const version =
    revisionId === 'original'
      ? team.original
      : team.history.find(({ id }) => id === revisionId);
  if (!version) throw new Error('This restore point is no longer available.');
  return {
    ...team,
    name: version.name,
    members: structuredClone(version.members),
  };
}

export function differences(before: Member[], after: Member[]) {
  const rows: {
    pokemon: string;
    field: string;
    before: string;
    after: string;
  }[] = [];
  for (const member of before) {
    const match = after.find(
      (other) => normalize(other.pokemon) === normalize(member.pokemon)
    );
    if (!match) continue;
    for (const [field, label] of [
      ['item', 'Item'],
      ['ability', 'Ability'],
      ['nature', 'Nature'],
      ['spread', 'EVs'],
    ] as const) {
      const a = member[field],
        b = match[field];
      if (a && (!b || normalize(a) !== normalize(b)))
        rows.push({
          pokemon: member.pokemon,
          field: label,
          before: a,
          after: b || 'Unknown',
        });
    }
    if (
      member.moves.length &&
      member.moves.map(normalize).sort().join(',') !==
        match.moves.map(normalize).sort().join(',')
    )
      rows.push({
        pokemon: member.pokemon,
        field: 'Moves',
        before: member.moves.join(', '),
        after: match.moves.join(', ') || 'Unknown',
      });
  }
  return rows;
}
