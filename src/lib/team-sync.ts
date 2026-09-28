import { generateUUID, readSavedTeams, type SavedTeam } from './workbench.ts';

const roomError =
  'Sync needs more room. Remove unneeded teams before retrying; existing data has been preserved.';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function teamsSnapshot(teams: SavedTeam[]): string {
  return `[${[...teams]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(canonical)
    .join(',')}]`;
}

function validated(value: unknown): SavedTeam[] {
  return readSavedTeams({ getItem: () => JSON.stringify(value) });
}

export function mergeSavedTeams(
  base: SavedTeam[] | null,
  local: SavedTeam[],
  remote: SavedTeam[],
  recoveryIds: Map<string, string>
): SavedTeam[] {
  const original = base === null ? null : validated(base);
  const left = validated(local);
  const right = validated(remote);
  const bases = new Map(original?.map((team) => [team.id, team]));
  const locals = new Map(left.map((team) => [team.id, team]));
  const remotes = new Map(right.map((team) => [team.id, team]));
  const used = new Set([...bases.keys(), ...locals.keys(), ...remotes.keys()]);
  const recovered: SavedTeam[] = [];
  const result: SavedTeam[] = [];
  const same = (a: SavedTeam | undefined, b: SavedTeam | undefined) =>
    a === b ||
    (a !== undefined && b !== undefined && canonical(a) === canonical(b));
  const choose = (id: string): SavedTeam | undefined => {
    const l = locals.get(id);
    const r = remotes.get(id);
    const b = bases.get(id);
    if (same(l, r)) return l;
    if (original === null) {
      if (!l || !r) return l ?? r;
      recover(l);
      return r;
    }
    if (same(l, b)) return r;
    if (same(r, b)) return l;
    if (r) recover(r);
    return l;
  };
  const recover = (team: SavedTeam) => {
    const key = canonical(team);
    let id = recoveryIds.get(key);
    if (!id) {
      do id = generateUUID();
      while (used.has(id));
      recoveryIds.set(key, id);
    }
    if (used.has(id))
      throw new Error(
        'Recovered saved team ID already exists. Existing data has been preserved.'
      );
    used.add(id);
    recovered.push({
      ...team,
      id,
      name: `${team.name.slice(0, 50_000 - ' (recovered)'.length)} (recovered)`,
    });
  };
  for (const team of right) {
    const selected = choose(team.id);
    if (selected) result.push(selected);
  }
  for (const team of left) {
    if (remotes.has(team.id)) continue;
    const selected = choose(team.id);
    if (selected) result.push(selected);
  }
  if (result.length + recovered.length > 50) throw new Error(roomError);
  return validated([...result, ...recovered]);
}
