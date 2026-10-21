import { isCompleteSpread, parseChampionsSpread } from './paste.ts';

export interface SpreadSource {
  pasteUrl: string;
  videoUrls: string[];
  sourceSet: string;
  originalSet: string;
  appliedSignature: string;
  borrowedNature: boolean;
}
export interface RegulationInference {
  method: 'video-date';
  publishedAt: string;
  sourceUrl: string;
}

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
  spreadSource?: SpreadSource;
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
  regulationInference?: RegulationInference;
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

export function browsePokemon(name: string): string {
  if (
    ['floetteeternal', 'floetteeternalmega', 'floettemega'].includes(
      normalize(name)
    )
  )
    return 'Floette-Eternal';
  return name.replace(/[- ]mega(?:[- ][xy])?$/i, '');
}
export const pokemonId = (name: string) => normalize(browsePokemon(name));
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
    const pokemon = browsePokemon(tuple[0]);
    const key = normalize(pokemon);
    if (!key || selected.has(key))
      throw new Error('Invalid or duplicate Pokémon filter.');
    selected.add(key);
    return {
      pokemon,
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
    result.append(
      'member',
      JSON.stringify([browsePokemon(pokemon), item, ability, move])
    );
  return result;
}

export function matchesTeam(
  team: Pick<Team, 'members'>,
  filters: MemberFilter[]
) {
  return filters.every((filter) =>
    team.members.some(
      (member) =>
        pokemonId(member.pokemon) === pokemonId(filter.pokemon) &&
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
  none?: true;
};
const noEvidence = (entrants?: number): ClassifiedEvidence => ({
  level: 4,
  label: '',
  none: true,
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

const youtubeChannelUrl = 'https://www.youtube.com/@';

function collections(
  reports: readonly Report[]
): { name: string; youtube: boolean }[] {
  const found: { name: string; youtube: boolean }[] = [];
  for (const report of reports) {
    const name = /^(.+) collection$/.exec(report.event)?.[1];
    if (name && !found.some((entry) => entry.name === name))
      found.push({
        name,
        youtube: report.sourceUrl.startsWith(youtubeChannelUrl),
      });
  }
  return found;
}

export function youtubeChannelNames(reports: readonly Report[]): string[] {
  return collections(reports)
    .filter((entry) => entry.youtube)
    .map((entry) => entry.name);
}

export function listingReason(
  team: {
    reports?: readonly Report[];
    sheetIds?: readonly string[];
    publishedAt?: string;
  },
  origin?: 'catalog' | 'custom'
): { label: string; detail: string } {
  if (origin === 'custom') return { label: 'Imported by you', detail: '' };
  const reports = team.reports ?? [];
  const channels = youtubeChannelNames(reports);
  const sources = [
    ...(channels.length ? [`Featured by ${channels.join(', ')}`] : []),
    ...collections(reports)
      .filter((entry) => !entry.youtube)
      .map((entry) => `Listed by ${entry.name}`),
    ...(team.sheetIds?.length ? ['Listed on VGCPastes'] : []),
  ];
  return {
    label: sources[0] ?? 'Listed in the catalog',
    detail: [
      ...sources.slice(1),
      team.publishedAt ? 'Ranked by share date' : 'Share date unknown',
    ].join(' · '),
  };
}

export function sourceName(
  team: Pick<Team, 'reports' | 'regulation'> &
    Partial<Pick<Team, 'id' | 'sheetIds' | 'publishedAt'>>,
  current: string
): string {
  const best = bestEvidence(team, current);
  if (!best.none)
    return best.platform === 'Tournament' ? best.event : best.platform;
  return listingReason(team).label;
}

export type SourceRow =
  | { kind: 'report'; report: Report }
  | { kind: 'youtube'; channel: string; url: string; watch: boolean };

export function sourceRows(reports: readonly Report[]): SourceRow[] {
  const channels = collections(reports).filter((entry) => entry.youtube);
  const isVideo = (report: Report) =>
    channels.some((entry) => report.event === `${entry.name} video`);
  const rows: SourceRow[] = [];
  const emitted = new Set<string>();
  const seen = new Set<string>();
  for (const report of reports) {
    const name = /^(.+) collection$/.exec(report.event)?.[1];
    const channel = channels.find((entry) => entry.name === name);
    if (channel) {
      if (seen.has(channel.name)) continue;
      seen.add(channel.name);
      const videos = reports.filter(
        (item) => item.event === `${channel.name} video`
      );
      if (!videos.length)
        rows.push({
          kind: 'youtube',
          channel: channel.name,
          url: report.sourceUrl,
          watch: false,
        });
      for (const video of videos) {
        if (emitted.has(video.sourceUrl)) continue;
        emitted.add(video.sourceUrl);
        rows.push({
          kind: 'youtube',
          channel: channel.name,
          url: video.sourceUrl,
          watch: true,
        });
      }
    } else if (!isVideo(report)) rows.push({ kind: 'report', report });
  }
  return rows.filter(
    (row) => row.kind !== 'report' || !emitted.has(row.report.sourceUrl)
  );
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

const browsePriority = (priority: Priority): Priority => [
  priority[0] === 0
    ? priority[1] === 1
      ? 1
      : 0
    : priority[0] === 1
      ? 2
      : priority[0] === 3
        ? 3
        : priority[0] === 2
          ? priority[1] === 0
            ? 4
            : priority[1] === 1
              ? 5
              : 6
          : priority[0] === 4
            ? 7
            : priority[0] === 5
              ? 8
              : 9,
  priority[1],
  priority[2],
  priority[3],
  priority[4],
];

function isDirectYoutubeVideo(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    let id: string | null = null;
    if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
    ) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else
        id =
          /^\/(?:live|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(
            url.pathname
          )?.[1] ?? null;
    } else if (url.hostname === 'youtu.be') {
      id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
  } catch {
    return false;
  }
}

const browseCache = new WeakMap<
  Team,
  { current: string; resource: number; priority: Priority }
>();

function browseRankingOf(team: Team, current: string) {
  const cached = browseCache.get(team);
  if (cached?.current === current) return cached;

  const completeEvs =
    team.members.length === 6 &&
    team.members.every((member) =>
      isCompleteSpread(parseChampionsSpread(member.spread))
    );
  const hasVideo =
    team.reports.some((report) => isDirectYoutubeVideo(report.sourceUrl)) ||
    team.members.some((member) =>
      member.spreadSource?.videoUrls.some(isDirectYoutubeVideo)
    );
  let priority: Priority = [9, 0, 0, 0, 0];
  for (const report of team.reports) {
    const candidate = browsePriority(
      evidence(report, team.regulation, current).priority
    );
    if (priorityCompare(candidate, priority) < 0) priority = candidate;
  }
  const result = {
    current,
    resource: completeEvs ? (hasVideo ? 0 : 1) : hasVideo ? 2 : 3,
    priority,
  };
  browseCache.set(team, result);
  return result;
}

export function compareBrowseTeams(a: Team, b: Team, current: string): number {
  const customOrder =
    Number(isCustomRulesTeam(a)) - Number(isCustomRulesTeam(b));
  if (customOrder) return customOrder;
  const unknownOrder =
    Number(a.regulation === 'Unknown') - Number(b.regulation === 'Unknown');
  if (unknownOrder) return unknownOrder;

  const ra = browseRankingOf(a, current);
  const rb = browseRankingOf(b, current);
  return (
    scalarCompare(ra.resource, rb.resource) ||
    scalarCompare(ra.priority[0], rb.priority[0]) ||
    Number(b.regulation === current) - Number(a.regulation === current) ||
    priorityCompare(ra.priority, rb.priority) ||
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
  const identity = pokemonId(pokemon);
  const key = `${identity}:${field}`;
  let result = optionsCache.get(key);
  if (!result) {
    result = [
      ...new Set(
        teams.flatMap((team) =>
          team.members
            .filter((member) => pokemonId(member.pokemon) === identity)
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
