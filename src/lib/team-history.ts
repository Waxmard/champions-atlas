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

export function restoreTeam(team: SavedTeam): SavedTeam {
  return {
    ...team,
    name: team.original.name,
    members: structuredClone(team.original.members),
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
    const selectedKeys = member.moves.map(normalize);
    const teamKeys = match.moves.map(normalize);
    const removed = [
      ...new Set(
        member.moves.filter(
          (move, index) => !teamKeys.includes(selectedKeys[index])
        )
      ),
    ];
    const added = [
      ...new Set(
        match.moves.filter(
          (move, index) => !selectedKeys.includes(teamKeys[index])
        )
      ),
    ];
    if (member.moves.length && (removed.length || added.length))
      rows.push({
        pokemon: member.pokemon,
        field: 'Moves',
        before: removed.join(', ') || 'None',
        after: match.moves.length ? added.join(', ') || 'None' : 'Unknown',
      });
  }
  return rows;
}
