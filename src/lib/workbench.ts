import {
  compareTeams,
  matchesTeam,
  normalize,
  type Member,
  type Team,
} from './catalog.ts';

export interface MemberLock {
  pokemon: string;
  item: string;
  ability: string;
  moves: string[];
}

export interface SavedTeam {
  id: string;
  name: string;
  original: Pick<
    Team,
    'id' | 'name' | 'regulation' | 'pasteUrl' | 'members' | 'paste'
  >;
  members: Member[];
  targetRegulation: string;
  locks: MemberLock[];
  sources: { name: string; pasteUrl: string }[];
}

export const storageKey = 'champions-atlas:teams:v1';

export function setText(member: Member) {
  return (
    member.set ||
    [
      member.pokemon + (member.item ? ` @ ${member.item}` : ''),
      member.ability && `Ability: ${member.ability}`,
      member.nature && `${member.nature} Nature`,
      member.spread && `EVs: ${member.spread}`,
      ...member.moves.map((move) => `- ${move}`),
    ]
      .filter(Boolean)
      .join('\n')
  );
}

export const exportPaste = (members: Member[]) =>
  members.map(setText).join('\n\n');

export function newSavedTeam(team: Team, currentRegulation: string): SavedTeam {
  return {
    id: crypto.randomUUID(),
    name: team.name,
    original: structuredClone({
      id: team.id,
      name: team.name,
      regulation: team.regulation,
      pasteUrl: team.pasteUrl,
      members: team.members,
      paste: team.paste,
    }),
    members: structuredClone(team.members),
    targetRegulation: currentRegulation,
    locks: [],
    sources: [{ name: team.name, pasteUrl: team.pasteUrl }],
  };
}

export function matchesLocks(team: Pick<Team, 'members'>, locks: MemberLock[]) {
  return locks.every(
    (lock) =>
      matchesTeam(team, [{ ...lock, move: '' }]) &&
      lock.moves.every((move) => matchesTeam(team, [{ ...lock, move }]))
  );
}

export function similarity(members: Member[], candidate: Member[]) {
  let shared = 0,
    details = 0;
  for (const member of members) {
    const match = candidate.find(
      (other) => normalize(other.pokemon) === normalize(member.pokemon)
    );
    if (!match) continue;
    shared++;
    for (const field of ['item', 'ability', 'nature', 'spread'] as const)
      if (
        member[field] &&
        match[field] &&
        normalize(member[field]) === normalize(match[field])
      )
        details++;
    details += member.moves.filter((move) =>
      match.moves.some((other) => normalize(move) === normalize(other))
    ).length;
  }
  return { shared, details };
}

export function similarTeams(saved: SavedTeam, teams: Team[], current: string) {
  return teams
    .filter(
      (team) =>
        team.id !== saved.original.id &&
        (saved.targetRegulation === 'all' ||
          team.regulation === saved.targetRegulation) &&
        matchesLocks(team, saved.locks)
    )
    .map((team) => ({ team, ...similarity(saved.members, team.members) }))
    .filter(({ shared }) => shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        b.details - a.details ||
        compareTeams(a.team, b.team, current)
    );
}

export function useCandidate(saved: SavedTeam, candidate: Team): SavedTeam {
  if (!matchesLocks(candidate, saved.locks))
    throw new Error('This team does not satisfy your locks.');
  const source = { name: candidate.name, pasteUrl: candidate.pasteUrl };
  return {
    ...saved,
    members: structuredClone(candidate.members),
    sources: saved.sources.some((entry) => entry.pasteUrl === source.pasteUrl)
      ? saved.sources
      : [...saved.sources, source],
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
    if (!match) {
      rows.push({
        pokemon: member.pokemon,
        field: 'Pokémon',
        before: 'On team',
        after: 'Removed',
      });
      continue;
    }
    for (const [field, label] of [
      ['item', 'Item'],
      ['ability', 'Ability'],
      ['nature', 'Nature'],
      ['spread', 'EVs'],
    ] as const) {
      if (
        !member[field] ||
        !match[field] ||
        normalize(member[field]) !== normalize(match[field])
      )
        rows.push({
          pokemon: member.pokemon,
          field: label,
          before: member[field] || 'Unknown',
          after: match[field] || 'Unknown',
        });
    }
    if (
      !member.moves.length ||
      !match.moves.length ||
      member.moves.map(normalize).sort().join(',') !==
        match.moves.map(normalize).sort().join(',')
    )
      rows.push({
        pokemon: member.pokemon,
        field: 'Moves',
        before: member.moves.join(', ') || 'Unknown',
        after: match.moves.join(', ') || 'Unknown',
      });
    if (member.set && match.set && member.set !== match.set)
      rows.push({
        pokemon: member.pokemon,
        field: 'Full set',
        before: member.set,
        after: match.set,
      });
  }
  for (const member of after)
    if (
      !before.some(
        (other) => normalize(other.pokemon) === normalize(member.pokemon)
      )
    )
      rows.push({
        pokemon: member.pokemon,
        field: 'Pokémon',
        before: 'Not on team',
        after: 'Added',
      });
  return rows;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 50000;
const optionalText = (value: unknown) => value === null || text(value);
const texts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 4 && value.every(text);
const source = (value: unknown) =>
  object(value) &&
  text(value.name) &&
  text(value.pasteUrl) &&
  /^https:\/\/pokepast\.es\/[a-f0-9]{16}$/.test(value.pasteUrl);
const members = (value: unknown): value is Member[] =>
  Array.isArray(value) &&
  value.length === 6 &&
  value.every(
    (member) =>
      object(member) &&
      text(member.pokemon) &&
      !!normalize(member.pokemon) &&
      ['item', 'ability', 'nature', 'spread'].every((key) =>
        optionalText(member[key])
      ) &&
      texts(member.moves) &&
      (member.set === undefined || text(member.set))
  ) &&
  new Set(value.map((member) => normalize(member.pokemon))).size === 6;

export function readSavedTeams(storage: Pick<Storage, 'getItem'>): SavedTeam[] {
  const raw = storage.getItem(storageKey);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    !value.every(
      (team) =>
        object(team) &&
        text(team.id) &&
        text(team.name) &&
        text(team.targetRegulation) &&
        object(team.original) &&
        source(team.original) &&
        text(team.original.id) &&
        text(team.original.regulation) &&
        optionalText(team.original.paste) &&
        members(team.original.members) &&
        members(team.members) &&
        Array.isArray(team.sources) &&
        team.sources.length <= 100 &&
        team.sources.every(source) &&
        Array.isArray(team.locks) &&
        team.locks.length <= 6 &&
        team.locks.every(
          (lock) =>
            object(lock) &&
            text(lock.pokemon) &&
            text(lock.item) &&
            text(lock.ability) &&
            texts(lock.moves)
        )
    )
  )
    throw new Error(
      'Saved teams could not be read. Existing data has been left untouched.'
    );
  if (new Set(value.map((team) => team.id)).size !== value.length)
    throw new Error(
      'Duplicate saved team IDs. Existing data has been left untouched.'
    );
  return value as SavedTeam[];
}

export function saveTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: SavedTeam
) {
  const saved = readSavedTeams(storage);
  const next = saved.filter((entry) => entry.id !== team.id);
  next.push(team);
  const raw = JSON.stringify(next);
  readSavedTeams({ getItem: () => raw });
  storage.setItem(storageKey, raw);
  return next;
}
