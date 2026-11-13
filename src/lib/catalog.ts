import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { isCompleteSpread, parseChampionsSpread } from './paste.ts';
import { recencyPeriod } from './recency.ts';
import { splitTeamName, videoHeading, withoutDivision } from './team-name.ts';

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
  videoTitle?: string;
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
  regulationSetByUser?: true;
}

export interface MemberFilter {
  pokemon: string;
  item: string;
  ability: string;
  move: string;
}
const normalized = new Map<string, string>();
export function normalize(text: string): string {
  let key = normalized.get(text);
  if (key !== undefined) return key;
  key = text.toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm');
  key = key.replace(/[^a-z0-9]/g, '');
  normalized.set(text, key);
  return key;
}

export const megaStoneTargets = (item: string) =>
  Generations.get(0).items.get(normalize(item) as ID)?.megaStone;

export const MAX_TEAM_MEGAS = 2;
export const isMegaSpecies = (pokemon: string) =>
  /-Mega(-[XYZ])?$/i.test(pokemon.trim());
export const basePokemon = (name: string) =>
  normalize(name).replace(/mega[a-z]?$/, '');

export function browsePokemon(name: string): string {
  if (
    ['floetteeternal', 'floetteeternalmega', 'floettemega'].includes(
      normalize(name)
    )
  )
    return 'Floette-Eternal';
  return name.replace(/[- ]mega(?:[- ][xyz])?$/i, '');
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

export function teamHeading(
  name: string,
  source: { name: string; reports?: readonly Report[] } | null
): { title: string; context: string } {
  const original = { title: name, context: '' };
  if (!source || name !== source.name) return original;
  const video = videoHeading(source.reports ?? []);
  const parsed = splitTeamName(name);
  if (!parsed) return video ?? original;
  const ranks = new Set<string>();
  const events = new Set<string>();
  for (const report of source.reports ?? []) {
    const event = report.event.trim();
    if (!event) continue;
    if (
      event !== parsed.middle &&
      withoutDivision(event) !== withoutDivision(parsed.middle)
    )
      continue;
    events.add(event);
    const rank = report.rank.trim();
    if (rank) ranks.add(rank);
  }
  if (ranks.size > 1) return original;
  const result = [...ranks][0] ?? parsed.placement;
  if (!result && video) return video;
  const event = [
    events.size === 1 ? [...events][0] : parsed.middle,
    parsed.division,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    title: parsed.title,
    context: [event, result].filter(Boolean).join(' · '),
  };
}

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

const majorEventTier = (key: string) => {
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
  priority: [8, 0, 0, 0, 0],
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

export function isExcludedCatalogEvent(team: {
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
  const { event, rank: rawRank, entrants } = report;
  if (!event) return noEvidence(entrants);
  const rank = rawRank.trim();
  const trimmed = event.trim();
  const showdown = /^Showdown Ladder(?: \(Bo[13]\))?$/i.test(trimmed);
  const champions =
    /^(?:Ladder|Ranked Ladder|Champions Ladder|Champions ranked battles|Ranked Season M-[1-9]\d*|Champions ranked battles — (?:Season M-[1-9]\d*|Shared team))$/i.test(
      trimmed
    );
  const ladder = showdown || champions;
  if (ladder) {
    if (!rank) return noEvidence(entrants);
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
          1,
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
        priority: [4, champions ? 1 : 2, position, 0, 0],
        entrants,
      };
    if (divisionNumber === '2')
      return {
        level: 1,
        label: rank,
        platform,
        priority: [4, 0, 0, 0, 0],
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
          6,
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
      priority: [7, 0, 0, 0, 0],
      entrants,
    };
  }
  const eventKey = normalize(trimmed);
  const globalChallenge =
    /^(?:20\d{2}globalchallenge|globalchallenge20\d{2})(?:[ivx]+)?(?:seniors)?$/.test(
      eventKey
    );
  if (!rank && !globalChallenge) return noEvidence(entrants);
  const major = majorEventTier(eventKey);
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
  if (globalChallenge) {
    const numeric = /^(?:Reported #)?(\d+)$/i.exec(normalizedRank);
    const value = numeric ? Number(numeric[1]) : placing;
    if (
      value !== undefined &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= 1000
    )
      return {
        level: value <= 100 ? 0 : 1,
        label: rank,
        platform: 'Tournament',
        priority: [value <= 100 ? 0 : 3, 0, value, 0, 0],
        entrants,
      };
  }
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
      priority: [2, major, placing ?? Infinity, -(entrants ?? 0), 0],
      entrants,
    };
  if (
    !globalChallenge &&
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
      priority: [5, 0, placing / entrants, -entrants, placing],
      entrants,
    };
  return {
    level: 3,
    label: rank,
    platform: 'Tournament',
    priority: [7, 0, 0, 0, 0],
    entrants,
  };
}

export function isExcludedMasterBallTeam(
  team: Pick<Team, 'reports' | 'regulation'>,
  current: string
): boolean {
  let excluded = false;
  for (const report of team.reports) {
    const event = report.event.trim();
    const rank = report.rank.trim();
    if (!event || !rank) continue;
    const result = evidence(report, team.regulation, current);
    if (
      result.platform === 'Tournament' &&
      !/ (?:collection|video)$/i.test(event)
    )
      return false;
    if (
      (result.platform === 'Champions ladder' ||
        result.platform === 'Showdown') &&
      result.level <= 1
    )
      return false;
    if (
      result.platform === 'Champions ladder' &&
      /^Master ?Ball(?: Rank)? [34]$/i.test(rank)
    )
      excluded = true;
  }
  return excluded;
}

export function admittedTeams(
  teams: readonly Team[],
  currentRegulation: string
): Team[] {
  return teams.filter(
    (team) =>
      !isExcludedCatalogEvent(team) &&
      !isExcludedMasterBallTeam(team, currentRegulation)
  );
}

export interface TeamEvidence extends ClassifiedEvidence {
  event: string;
}

export function bestEvidence(
  team: Pick<Team, 'reports' | 'regulation'>,
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
  return best || { ...noEvidence(), event: '' };
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
    Partial<Pick<Team, 'sheetIds' | 'publishedAt'>>,
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
    (row) =>
      row.kind !== 'report' ||
      !emitted.has(row.report.sourceUrl) ||
      row.report.rank.trim() !== ''
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
  const unknownOrder =
    Number(a.regulation === 'Unknown') - Number(b.regulation === 'Unknown');
  if (unknownOrder) return unknownOrder;
  const ea = evidenceOf(a, current);
  const eb = evidenceOf(b, current);
  const band = scalarCompare(
    ea.priority[0] - recencyPeriod(a.publishedAt),
    eb.priority[0] - recencyPeriod(b.publishedAt)
  );
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

export function voteWeights(teams: readonly Team[], current: string) {
  const key = (team: Team) =>
    evidenceOf(team, current).priority[0] - recencyPeriod(team.publishedAt);
  let best = Infinity;
  for (const team of teams) best = Math.min(best, key(team));
  return (team: Team) => 0.5 ** (key(team) - best);
}

const browseBand = (priority: Priority): number => {
  const [level, division] = priority;
  if (level === 0) return 0;
  if (level === 1) return division === 1 ? 2 : 1;
  if (level === 2) return 3;
  if (level === 5) return 4;
  if (level === 3) return 5;
  if (level === 4) return division === 0 ? 6 : division === 1 ? 7 : 8;
  if (level === 6) return 9;
  if (level === 7) return 10;
  return 11;
};

const browsePriority = (priority: Priority): Priority => [
  browseBand(priority),
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
  {
    current: string;
    completeEvs: boolean;
    hasVideo: boolean;
    priority: Priority;
  }
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
  let priority: Priority = [11, 0, 0, 0, 0];
  for (const report of team.reports) {
    const candidate = browsePriority(
      evidence(report, team.regulation, current).priority
    );
    if (priorityCompare(candidate, priority) < 0) priority = candidate;
  }
  const result = { current, completeEvs, hasVideo, priority };
  browseCache.set(team, result);
  return result;
}

export function compareBrowseTeams(a: Team, b: Team, current: string): number {
  const ra = browseRankingOf(a, current);
  const rb = browseRankingOf(b, current);
  return (
    Number(a.regulation === 'Unknown') - Number(b.regulation === 'Unknown') ||
    Number(b.regulation === current) - Number(a.regulation === current) ||
    b.regulation.localeCompare(a.regulation) ||
    Number(rb.completeEvs) - Number(ra.completeEvs) ||
    scalarCompare(
      ra.priority[0] - recencyPeriod(a.publishedAt),
      rb.priority[0] - recencyPeriod(b.publishedAt)
    ) ||
    priorityCompare(ra.priority, rb.priority) ||
    Number(rb.hasVideo) - Number(ra.hasVideo) ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id.localeCompare(b.id)
  );
}

const optionsCache = new WeakMap<Team[], Map<string, string[]>>();

export function getMemberOptions(
  teams: Team[],
  pokemon: string,
  field: 'item' | 'ability' | 'move'
): string[] {
  const identity = pokemonId(pokemon);
  const key = `${identity}:${field}`;
  let cache = optionsCache.get(teams);
  if (!cache) {
    cache = new Map();
    optionsCache.set(teams, cache);
  }
  let result = cache.get(key);
  if (!result) {
    const counts = new Map<string, number>();
    for (const team of teams) {
      for (const member of team.members) {
        if (pokemonId(member.pokemon) !== identity) continue;
        const values = field === 'move' ? member.moves : [member[field]];
        for (const value of values)
          if (value) counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
    result = [...counts.keys()];
    if (field === 'item') {
      const stones = new Set(
        result.filter((item) => {
          const mapping = megaStoneTargets(item);
          return (
            mapping &&
            Object.entries(mapping).some(
              ([base, mega]) =>
                pokemonId(base) === identity || pokemonId(mega) === identity
            )
          );
        })
      );
      result.sort(
        (a, b) =>
          Number(stones.has(b)) - Number(stones.has(a)) ||
          (counts.get(b) || 0) - (counts.get(a) || 0) ||
          (a < b ? -1 : a > b ? 1 : 0)
      );
    } else result.sort();
    cache.set(key, result);
  }
  return result;
}
