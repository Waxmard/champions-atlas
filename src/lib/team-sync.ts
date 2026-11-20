import {
  generateUUID,
  orderKeyOf,
  readSavedTeams,
  type SavedTeam,
} from './workbench.ts';
import { battleFormats } from './battle-format.ts';
import { orderedSaved } from './team-collections.ts';
import { canonicalSnapshot } from './team-history.ts';
const roomError =
  'Sync needs more room. Remove unneeded teams before retrying; existing data has been preserved.';

export function teamsSnapshot(teams: SavedTeam[]): string {
  return (
    '[' +
    [...teams]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(canonicalSnapshot)
      .join(',') +
    ']'
  );
}

function withoutMetadata(team: SavedTeam): SavedTeam {
  const content = { ...team };
  delete content.wishlistOrder;
  delete content.savedOrder;
  delete content.current;
  delete content.favorite;
  return content;
}

function contentSnapshot(team: SavedTeam): string {
  return canonicalSnapshot(withoutMetadata(team));
}

function metadataMerged(
  selected: SavedTeam,
  l: SavedTeam | undefined,
  r: SavedTeam | undefined,
  b: SavedTeam | undefined
): SavedTeam {
  const key = orderKeyOf(selected);
  const merged = { ...selected };
  delete merged[key === 'wishlistOrder' ? 'savedOrder' : 'wishlistOrder'];
  if (!l || !r) return merged;
  const take = (field: typeof key | 'current' | 'favorite') => {
    const value = b
      ? l[field] === b[field]
        ? r[field]
        : l[field]
      : (r[field] ?? l[field]);
    if (value === undefined) delete merged[field];
    else Object.assign(merged, { [field]: value });
  };
  if (orderKeyOf(l) === key && orderKeyOf(r) === key) take(key);
  take('current');
  take('favorite');
  return merged;
}

export function validateTeamIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    new Set(value).size !== value.length ||
    value.some(
      (id) =>
        typeof id !== 'string' ||
        !id ||
        new TextEncoder().encode(id).length > 1500 ||
        id.includes('/') ||
        id === '.' ||
        id === '..' ||
        /^__[\s\S]*__$/.test(id)
    )
  )
    throw new Error(
      'Cloud saved teams could not be read. Existing data has been left untouched.'
    );
  return value;
}

export function validatedTeams(value: unknown): SavedTeam[] {
  if (!Array.isArray(value))
    throw new Error(
      'Saved teams could not be read. Existing data has been left untouched.'
    );
  return readSavedTeams({ getItem: () => JSON.stringify(value) });
}

export function mergeSavedTeams(
  base: SavedTeam[] | null,
  local: SavedTeam[],
  remote: SavedTeam[],
  recoveryIds: Map<string, string>
): SavedTeam[] {
  const original = base === null ? null : validatedTeams(base);
  const left = validatedTeams(local);
  const right = validatedTeams(remote);
  const bases = new Map(original?.map((team) => [team.id, team]));
  const locals = new Map(left.map((team) => [team.id, team]));
  const remotes = new Map(right.map((team) => [team.id, team]));
  const used = new Set([...bases.keys(), ...locals.keys(), ...remotes.keys()]);
  const recovered: SavedTeam[] = [];
  const result: SavedTeam[] = [];
  const same = (a: SavedTeam | undefined, b: SavedTeam | undefined) =>
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      contentSnapshot(a) === contentSnapshot(b));
  const choose = (id: string): SavedTeam | undefined => {
    const l = locals.get(id);
    const r = remotes.get(id);
    const b = bases.get(id);
    let selected: SavedTeam | undefined;
    if (same(l, r)) selected = l;
    else if (original === null) {
      if (!l || !r) selected = l ?? r;
      else {
        recover(l);
        selected = r;
      }
    } else if (same(l, b)) selected = r;
    else if (same(r, b)) selected = l;
    else {
      if (r) recover(r);
      selected = l;
    }
    if (!selected) return;
    return metadataMerged(selected, l, r, b);
  };
  const recover = (team: SavedTeam) => {
    const key = contentSnapshot(team);
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
    const copy = {
      ...team,
      id,
      name: `${team.name.slice(0, 50_000 - ' (recovered)'.length)} (recovered)`,
    };
    delete copy.current;
    recovered.push(copy);
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
  const merged = validatedTeams([...result, ...recovered]);
  const currents = new Set(
    battleFormats.map(
      (format) => orderedSaved(merged, format).find((team) => team.current)?.id
    )
  );
  return merged.map((team) => {
    if (!team.current || currents.has(team.id)) return team;
    const rest = { ...team };
    delete rest.current;
    return rest;
  });
}
