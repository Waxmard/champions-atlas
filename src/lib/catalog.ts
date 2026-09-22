export interface Member {
  // Saved-team members may retain unknown per-member metadata; the index
  // signature keeps this catalog type assignable to zod's looseObject output.
  [key: string]: unknown;
  set?: string;
  pokemon: string;
  item: string | null;
  ability: string | null;
  moves: string[];
  nature: string | null;
  spread: string | null;
}

export interface Report {
  event: string;
  rank: string;
  sourceUrl: string;
}
export interface Team {
  id: string;
  sheetIds: string[];
  name: string;
  creator: string;
  regulation: string;
  publishedAt: string;
  pasteUrl: string;
  replicaCode: string | null;
  replicaStatus: string;
  reports: Report[];
  members: Member[];
  paste: string | null;
  pasteNotes: string | null;
  pasteError?: string;
}

export interface MemberFilter {
  pokemon: string;
  item: string;
  ability: string;
  move: string;
}
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9]/g, '');

export function readFilters(params: URLSearchParams): MemberFilter[] {
  const values = params.getAll('member');
  if (values.length > 6) throw new Error('Select at most six Pokémon.');
  const selected = new Set<string>();
  return values.map((value) => {
    const tuple: unknown = JSON.parse(value);
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 4 ||
      !tuple.every((part) => typeof part === 'string' && part.length <= 100) ||
      !tuple[0]
    )
      throw new Error('Invalid Pokémon filter link.');
    const key = normalize(tuple[0]);
    if (!key || selected.has(key))
      throw new Error('Invalid or duplicate Pokémon filter.');
    selected.add(key);
    return {
      pokemon: tuple[0],
      item: tuple[1],
      ability: tuple[2],
      move: tuple[3],
    };
  });
}

export function writeFilters(params: URLSearchParams, filters: MemberFilter[]) {
  const result = new URLSearchParams(params);
  result.delete('member');
  result.delete('page');
  for (const { pokemon, item, ability, move } of filters)
    result.append('member', JSON.stringify([pokemon, item, ability, move]));
  return result;
}

export function matchesTeam(
  team: Pick<Team, 'members'>,
  filters: MemberFilter[]
) {
  return filters.every((filter) =>
    team.members.some(
      (member) =>
        normalize(member.pokemon) === normalize(filter.pokemon) &&
        (!filter.item ||
          normalize(member.item || '') === normalize(filter.item)) &&
        (!filter.ability ||
          normalize(member.ability || '') === normalize(filter.ability)) &&
        (!filter.move ||
          member.moves.some(
            (move) => normalize(move) === normalize(filter.move)
          ))
    )
  );
}

export function evidence(report: Report, regulation: string, current: string) {
  const { event, rank } = report;
  if (!event || !rank)
    return { level: 4, label: 'No reported result', platform: 'Unknown' };
  const showdown = /showdown/i.test(event);
  const ladder = showdown || /ranked|ladder/i.test(event);
  if (ladder) {
    const position = /^(?:Peak )?(\d+)(?:st|nd|rd|th)$/i.exec(rank);
    const high =
      /^(?:champions?(?: tier)?|rank 1)$/i.test(rank) ||
      (position && Number(position[1]) <= (showdown ? 100 : 1000));
    const masterBall = /^master ?ball$/i.test(rank) && regulation === current;
    return {
      level: high ? 1 : masterBall ? 2 : 3,
      label: rank,
      platform: showdown ? 'Showdown' : 'Champions ladder',
    };
  }
  const strong =
    /^(champion|winner|runner up|1st|2nd)(?: \(Seniors\))?$|^top cut$/i.test(
      rank
    );
  return { level: strong ? 0 : 3, label: rank, platform: 'Tournament' };
}

export interface TeamEvidence {
  level: number;
  label: string;
  platform: string;
  event: string;
}

export function bestEvidence(team: Team, current: string): TeamEvidence {
  return (
    team.reports
      .map((report) => ({
        ...evidence(report, team.regulation, current),
        event: report.event,
      }))
      .sort((a, b) => a.level - b.level)[0] || {
      level: 4,
      label: 'No reported result',
      platform: 'Unknown',
      event: '',
    }
  );
}

const evidenceCache = new WeakMap<Team, TeamEvidence>();

/* How strongly a result is proven, as a stamp grade. Level 4 means the source
   sheet carried no result at all, which the guide prints as a blank. */
export function evidenceGrade(
  level: number
): 'strong' | 'qualified' | 'reported' | 'none' {
  if (level <= 1) return 'strong';
  if (level === 2) return 'qualified';
  if (level === 3) return 'reported';
  return 'none';
}

function evidenceOf(team: Team, current: string): TeamEvidence {
  let cached = evidenceCache.get(team);
  if (!cached) {
    cached = bestEvidence(team, current);
    evidenceCache.set(team, cached);
  }
  return cached;
}

export function compareTeams(a: Team, b: Team, current: string): number {
  const ea = evidenceOf(a, current);
  const eb = evidenceOf(b, current);
  const ga =
    ea.level <= 2
      ? a.regulation === current
        ? 0
        : 1
      : a.regulation === current
        ? 2
        : 3;
  const gb =
    eb.level <= 2
      ? b.regulation === current
        ? 0
        : 1
      : b.regulation === current
        ? 2
        : 3;
  return (
    ga - gb ||
    ea.level - eb.level ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id.localeCompare(b.id)
  );
}

const optionsCache = new Map<string, string[]>();

export function getMemberOptions(
  teams: Team[],
  pokemon: string,
  field: 'item' | 'ability' | 'move'
): string[] {
  const key = `${normalize(pokemon)}:${field}`;
  let result = optionsCache.get(key);
  if (!result) {
    result = [
      ...new Set(
        teams.flatMap((team) =>
          team.members
            .filter(
              (member) => normalize(member.pokemon) === normalize(pokemon)
            )
            .flatMap((member) =>
              field === 'move'
                ? member.moves
                : member[field]
                  ? [member[field]]
                  : []
            )
        )
      ),
    ].sort();
    optionsCache.set(key, result);
  }
  return result;
}
