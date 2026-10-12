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
  entrants?: number;
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

export function isPasteUrl(value: string): boolean {
  return (
    value === value.trim() &&
    /^https:\/\/(?:pokepast\.es\/[a-f0-9]{16}|www\.vrpastes\.com\/[A-Za-z0-9]{8})$/.test(
      value
    )
  );
}

export const regulationLabel = (regulation: string) =>
  regulation === 'Unknown' ? 'Regulation unknown' : `Reg ${regulation}`;

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

const majorEventTier = (event: string) => {
  const key = normalize(event);
  if (['worlds', 'worlds2026', 'worlds2026sanfrancisco'].includes(key))
    return 0;
  if (['baltimoreregional2027', 'frankfurtregionalchampionships'].includes(key))
    return 1;
  return null;
};

type Priority = readonly [number, number, number, number, number];
type ClassifiedEvidence = {
  level: number;
  label: string;
  platform: string;
  priority: Priority;
  entrants?: number;
};
const noEvidence = (entrants?: number): ClassifiedEvidence => ({
  level: 4,
  label: 'No reported result',
  platform: 'Unknown',
  priority: [6, 0, 0, 0, 0],
  entrants,
});
const scalarCompare = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
const priorityCompare = (a: Priority, b: Priority) => {
  for (let i = 0; i < a.length; i++) {
    const compared = scalarCompare(a[i], b[i]);
    if (compared) return compared;
  }
  return 0;
};

export function isCustomRulesTeam(team: {
  id?: string;
  reports?: readonly Report[];
}): boolean {
  return (
    Boolean(
      team.id &&
      /^poch-tournament-6ab431f2e905c1db68748c9c-[1-9]\d*$/.test(team.id)
    ) ||
    Boolean(
      team.reports?.some(
        (report) =>
          normalize(report.event) === normalize('Mudkip’s Marsh Pit #6')
      )
    )
  );
}

export function evidence(
  report: Report,
  regulation: string,
  current: string
): ClassifiedEvidence {
  const { event, rank, entrants } = report;
  if (!event || !rank) return noEvidence(entrants);
  const trimmed = event.trim();
  const showdown = /^Showdown Ladder(?: \(Bo[13]\))?$/i.test(trimmed);
  const champions =
    /^(?:Ladder|Ranked Ladder|Champions Ladder|Champions ranked battles|Ranked Season M-[1-9]\d*|Champions ranked battles — (?:Season M-[1-9]\d*|Shared team))$/i.test(
      trimmed
    );
  const ladder = showdown || champions;
  if (ladder) {
    const numeric =
      /^(?:Reported|Peak|Season finish) #?(\d+)(?:st|nd|rd|th)?$/i.exec(rank) ||
      /^(\d+)(?:st|nd|rd|th)$/i.exec(rank);
    const value = numeric ? Number(numeric[1]) : NaN;
    const position =
      Number.isSafeInteger(value) && value > 0 ? value : undefined;
    const division = champions
      ? /^(?:Master ?Ball(?: Rank)? ([1-4])|Rank ([12]))$/i.exec(rank)
      : null;
    const divisionNumber = division?.[1] ?? division?.[2];
    const champion = champions && /^(?:champions?)(?: tier)?$/i.test(rank);
    const platform = showdown ? 'Showdown' : 'Champions ladder';
    if (
      champion ||
      (position !== undefined && position <= 100 && champions) ||
      divisionNumber === '1'
    )
      return {
        level: 0,
        label: rank,
        platform,
        priority: [
          0,
          divisionNumber === '1' ? 1 : 0,
          position ?? Infinity,
          0,
          0,
        ],
        entrants,
      };
    if (
      position !== undefined &&
      ((champions && position <= 1000) || (showdown && position <= 100))
    )
      return {
        level: 1,
        label: rank,
        platform,
        priority: [2, champions ? 1 : 2, position, 0, 0],
        entrants,
      };
    if (divisionNumber === '2')
      return {
        level: 1,
        label: rank,
        platform,
        priority: [2, 0, 0, 0, 0],
        entrants,
      };
    if (
      divisionNumber === '3' ||
      divisionNumber === '4' ||
      (champions && /^Master ?Ball$/i.test(rank) && regulation === current)
    )
      return {
        level: 2,
        label: rank,
        platform,
        priority: [
          4,
          divisionNumber === '3' ? 0 : divisionNumber === '4' ? 1 : 2,
          0,
          0,
          0,
        ],
        entrants,
      };
    return {
      level: 3,
      label: rank,
      platform,
      priority: [5, 0, 0, 0, 0],
      entrants,
    };
  }
  const major = majorEventTier(trimmed);
  const normalizedRank = rank.replace(/ \(Seniors\)$/i, '').trim();
  const finishMatch = /^(\d+)(?:st|nd|rd|th)$/i.exec(normalizedRank);
  const topMatch = /^Top (\d+)$/i.exec(normalizedRank);
  const finishRaw = finishMatch?.[1] ?? topMatch?.[1];
  const finishValue = finishRaw ? Number(finishRaw) : NaN;
  const finish =
    Number.isSafeInteger(finishValue) && finishValue > 0
      ? finishValue
      : undefined;
  const placing = /^(?:Champion|Winner)$/i.test(normalizedRank)
    ? 1
    : /^Runner up$/i.test(normalizedRank)
      ? 2
      : finish;
  if (
    major !== null &&
    ((major === 0 &&
      ((placing !== undefined && placing <= 32) ||
        /^Top cut$/i.test(normalizedRank))) ||
      (major === 1 &&
        ((placing !== undefined && placing <= 8) ||
          /^Top cut$/i.test(normalizedRank))))
  )
    return {
      level: 0,
      label: rank,
      platform: 'Tournament',
      priority: [1, major, placing ?? Infinity, -(entrants ?? 0), 0],
      entrants,
    };
  if (
    entrants !== undefined &&
    Number.isSafeInteger(entrants) &&
    entrants >= 32 &&
    placing !== undefined &&
    placing <= Math.min(8, Math.floor(entrants / 4))
  )
    return {
      level: 1,
      label: rank,
      platform: 'Tournament',
      priority: [3, 0, placing / entrants, -entrants, placing],
      entrants,
    };
  return {
    level: 3,
    label: rank,
    platform: 'Tournament',
    priority: [5, 0, 0, 0, 0],
    entrants,
  };
}

export interface TeamEvidence extends ClassifiedEvidence {
  event: string;
}

export function bestEvidence(
  team: Pick<Team, 'reports' | 'regulation'> & Partial<Pick<Team, 'id'>>,
  current: string
): TeamEvidence {
  let best: TeamEvidence | undefined;
  for (const report of team.reports) {
    const candidate = {
      ...evidence(report, team.regulation, current),
      event: report.event,
    };
    if (!best || priorityCompare(candidate.priority, best.priority) < 0)
      best = candidate;
  }
  const result = best || { ...noEvidence(), event: '' };
  return isCustomRulesTeam(team) ? { ...result, level: 3 } : result;
}

const evidenceCache = new WeakMap<
  Team,
  { current: string; evidence: TeamEvidence }
>();

export function evidenceGrade(
  level: number
): 'strong' | 'qualified' | 'reported' | 'none' {
  if (level <= 1) return 'strong';
  if (level === 2) return 'qualified';
  if (level === 3) return 'reported';
  return 'none';
}

function evidenceOf(team: Team, current: string): TeamEvidence {
  const cached = evidenceCache.get(team);
  if (cached?.current === current) return cached.evidence;
  const result = bestEvidence(team, current);
  evidenceCache.set(team, { current, evidence: result });
  return result;
}

export function compareTeams(
  a: Team,
  b: Team,
  current: string,
  tiebreak = 0
): number {
  const customOrder =
    Number(isCustomRulesTeam(a)) - Number(isCustomRulesTeam(b));
  if (customOrder) return customOrder;
  const unknownOrder =
    Number(a.regulation === 'Unknown') - Number(b.regulation === 'Unknown');
  if (unknownOrder) return unknownOrder;
  const ea = evidenceOf(a, current);
  const eb = evidenceOf(b, current);
  const band = scalarCompare(ea.priority[0], eb.priority[0]);
  if (band) return band;
  const currentOrder =
    Number(b.regulation === current) - Number(a.regulation === current);
  return (
    currentOrder ||
    priorityCompare(ea.priority, eb.priority) ||
    tiebreak ||
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
