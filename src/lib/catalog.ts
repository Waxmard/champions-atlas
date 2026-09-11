export interface Member {
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

export function bestEvidence(team: Team, current: string) {
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

export function compareTeams(a: Team, b: Team, current: string) {
  const group = (team: Team) => {
    const result = bestEvidence(team, current);
    if (result.level <= 2) return team.regulation === current ? 0 : 1;
    return team.regulation === current ? 2 : 3;
  };
  return (
    group(a) - group(b) ||
    bestEvidence(a, current).level - bestEvidence(b, current).level ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id.localeCompare(b.id)
  );
}
