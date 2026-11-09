import { resolveBattleForm } from './battle-forms.ts';
import { knownName } from './canonical-names.ts';
import {
  MAX_TEAM_MEGAS,
  basePokemon,
  compareTeams,
  isMegaSpecies,
  megaStoneTargets,
  normalize,
  type Member,
  type Team,
} from './catalog.ts';
import {
  canonicalMember,
  isCompleteSpread,
  parseChampionsSpread,
} from './paste.ts';
import {
  missingRoles,
  postalRole,
  roleFlags,
  tagsForTeam,
  type RoleFlag,
  type TeamTagsIndex,
} from './tags.ts';

export interface FavoriteTeamSource {
  id: string;
  name: string;
  members: Member[];
}

export interface PokemonSuggestion {
  pokemon: string;
  member: Member;
  sharedTeammates: number;
  matchingDetails: number;
  role: string | null;
  roleFill: boolean;
  archetype: string | null;
  support: number;
  consensus: boolean;
  consensusSupport: number;
  source: Team;
  favorite?: true;
  favoriteTeamName?: string;
}

export interface SwapSuggestion extends PokemonSuggestion {
  slot: number;
}

const matchingDetails = (a: Member, b: Member) =>
  (['item', 'ability', 'nature', 'spread'] as const).filter(
    (field) =>
      a[field] && b[field] && normalize(a[field]) === normalize(b[field])
  ).length +
  a.moves.filter((move) =>
    b.moves.some((other) => normalize(move) === normalize(other))
  ).length;

export interface SourceTeamFit {
  shared: number;
  details: number;
}

export function sourceTeamFit(team: Team, teammates: Member[]): SourceTeamFit {
  let shared = 0;
  let details = 0;
  for (const member of teammates) {
    const match = team.members.find(
      (candidate) => normalize(candidate.pokemon) === normalize(member.pokemon)
    );
    if (!match) continue;
    shared++;
    details += matchingDetails(member, match);
  }
  return { shared, details };
}

export function rankFavoriteTeams<
  T extends Pick<FavoriteTeamSource, 'members'>,
>(
  favorites: readonly T[],
  teammates: Member[]
): { team: T; shared: number; details: number }[] {
  return favorites
    .map((team) => ({
      team,
      ...sourceTeamFit({ members: team.members } as Team, teammates),
    }))
    .sort((a, b) => b.shared - a.shared || b.details - a.details);
}

function rankedSourceTeams(
  teammates: Member[],
  teams: Team[],
  currentRegulation: string,
  tags?: TeamTagsIndex
) {
  const missing =
    Object.keys(tags?.teams ?? {}).length > 0
      ? missingRoles(teammates, teams, tags)
      : [];
  return {
    missing,
    ranked: teams
      .map((team) => {
        const { shared, details } = sourceTeamFit(team, teammates);
        const roleBonus = missing.some((role) =>
          team.members.some((member) => roleFlags(member).includes(role))
        )
          ? 1
          : 0;
        return { team, shared, details, roleBonus };
      })
      .sort(
        (a, b) =>
          b.shared - a.shared ||
          b.details - a.details ||
          compareTeams(
            a.team,
            b.team,
            currentRegulation,
            b.roleBonus - a.roleBonus
          )
      ),
  };
}

interface Candidate {
  form: string;
  names: Map<string, number>;
  members: Member[];
  teamIds: Set<string>;
  support: number;
  bestShared: number;
  bestDetails: number;
  bestSource: Team;
  roleFill: boolean;
}

const empty = (value: string | null) => !normalize(value ?? '');
const clean = (value: string | null) => (empty(value) ? null : value);

const known = (kind: 'item' | 'ability' | 'move', value: string | null) =>
  empty(value) || Boolean(knownName(kind, value ?? ''));

function isKnownMember(member: Member): boolean {
  if (resolveBattleForm(member).error !== null) return false;
  return (
    known('item', member.item) &&
    known('ability', member.ability) &&
    member.moves.every((move) => known('move', move))
  );
}

function mostCommon<T>(values: readonly T[], key: (value: T) => string) {
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    const entry = counts.get(key(value));
    if (entry) entry.count++;
    else counts.set(key(value), { value, count: 1 });
  }
  let best: { value: T; count: number } | null = null;
  for (const entry of counts.values())
    if (!best || entry.count > best.count) best = entry;
  return best?.value ?? null;
}

function topMoves(members: readonly Member[]) {
  const counts = new Map<string, { value: string; count: number }>();
  for (const member of members)
    for (const move of member.moves) {
      if (empty(move)) continue;
      const entry = counts.get(normalize(move));
      if (entry) entry.count++;
      else counts.set(normalize(move), { value: move, count: 1 });
    }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(({ value }) => value);
}

const signatureOf = (member: Member) =>
  [
    normalize(member.item ?? ''),
    normalize(member.ability ?? ''),
    normalize(member.nature ?? ''),
    normalize(member.spread ?? ''),
    member.moves.map(normalize).sort().join('|'),
  ].join('||');

function mostCommonName(names: Map<string, number>, fallback: string) {
  let display = fallback;
  let best = 0;
  for (const [name, count] of names)
    if (count > best) [display, best] = [name, count];
  return display;
}

function synthesize(
  candidate: Candidate,
  teammates: Member[],
  teams: Team[],
  currentRegulation: string,
  tags: TeamTagsIndex | undefined,
  missing: readonly RoleFlag[]
): PokemonSuggestion | null {
  const valid = candidate.members.filter(isKnownMember);
  if (!valid.length) return null;
  const canonical = valid.map(canonicalMember);
  const teammateItems = new Set(
    teammates.map((member) => normalize(member.item ?? '')).filter(Boolean)
  );
  const representative = canonical[0];
  const signature = mostCommon(canonical, signatureOf) ?? representative;
  const topCount = canonical.filter(
    (member) => signatureOf(member) === signatureOf(signature)
  ).length;
  const consensus =
    topCount >= 2 &&
    topCount * 2 >= canonical.length &&
    !teammateItems.has(normalize(signature.item ?? ''));

  let item: string | null;
  let ability: string | null;
  let nature: string | null;
  let spread: string | null;
  let moves: string[];
  let consensusSupport = 0;

  if (consensus) {
    ({ item, ability, nature, spread, moves } = signature);
    consensusSupport = topCount;
  } else {
    const stone = isMegaSpecies(candidate.form);
    const items = canonical.filter(
      (member) =>
        !empty(member.item) &&
        !teammateItems.has(normalize(member.item ?? '')) &&
        (!stone ||
          Object.values(megaStoneTargets(member.item ?? '') ?? {})
            .map(normalize)
            .includes(normalize(candidate.form)))
    );
    const chosen = mostCommon(items, (member) => normalize(member.item ?? ''));
    if (!chosen) return null;
    item = chosen.item;

    const itemKey = normalize(item ?? '');
    const withItem = canonical.filter(
      (member) => normalize(member.item ?? '') === itemKey
    );
    const resolved = resolveBattleForm(representative);
    ability =
      (stone && resolved.ability ? resolved.ability : null) ??
      mostCommon(
        withItem.filter((member) => !empty(member.ability)),
        (member) => normalize(member.ability ?? '')
      )?.ability ??
      mostCommon(
        canonical.filter((member) => !empty(member.ability)),
        (member) => normalize(member.ability ?? '')
      )?.ability ??
      null;

    const pair = (member: Member) =>
      `${normalize(member.nature ?? '')}|${normalize(member.spread ?? '')}`;
    const pickPair = (pool: Member[]) => {
      const pairs = pool.filter(
        (member) => !empty(member.nature) || !empty(member.spread)
      );
      const complete = pairs.filter((member) =>
        isCompleteSpread(parseChampionsSpread(member.spread))
      );
      return mostCommon(complete.length ? complete : pairs, pair);
    };
    const withAbility = withItem.filter(
      (member) => normalize(member.ability ?? '') === normalize(ability ?? '')
    );
    const exact =
      pickPair(withAbility) ?? pickPair(withItem) ?? pickPair(canonical);
    nature = exact?.nature ?? null;
    spread = exact?.spread ?? null;

    const pairKey = nature
      ? `${normalize(nature)}|${normalize(spread ?? '')}`
      : '';
    const narrowest = withAbility.filter(
      (member) => !pairKey || pair(member) === pairKey
    );
    moves = topMoves(narrowest);
    if (moves.length < 4) moves = topMoves(withAbility);
    if (moves.length < 4) moves = topMoves(canonical);
  }

  const member: Member = {
    pokemon: mostCommonName(candidate.names, candidate.form),
    item: clean(item),
    ability: clean(ability),
    nature: clean(nature),
    spread: clean(spread),
    moves,
  };
  if (resolveBattleForm(member).error !== null) return null;
  if (
    !known('item', member.item) ||
    !known('ability', member.ability) ||
    !member.moves.every((move) => known('move', move))
  )
    return null;

  return {
    pokemon: member.pokemon,
    member,
    sharedTeammates: candidate.bestShared,
    matchingDetails: candidate.bestDetails,
    role: postalRole(member.pokemon, teams, tags),
    roleFill: missing.some((role) => roleFlags(member).includes(role)),
    archetype: tagsForTeam(tags, candidate.bestSource.id)?.archetype ?? null,
    support: candidate.support,
    consensus,
    consensusSupport,
    source: candidate.bestSource,
  };
}

function buildFavoriteSuggestions(
  teammates: Member[],
  favoriteTeams: readonly FavoriteTeamSource[],
  excluded: ReadonlySet<string>,
  megas: number,
  queryKey: string,
  minShared: number,
  teams: Team[],
  currentRegulation: string,
  tags: TeamTagsIndex | undefined,
  missing: readonly RoleFlag[]
): PokemonSuggestion[] {
  if (!favoriteTeams.length) return [];
  const teammateItems = new Set(
    teammates.map((member) => normalize(member.item ?? '')).filter(Boolean)
  );
  const seen = new Set<string>();
  const rows: PokemonSuggestion[] = [];
  for (const { team: favTeam, shared, details } of rankFavoriteTeams(
    favoriteTeams,
    teammates
  )) {
    if (shared < minShared) continue;
    for (const raw of favTeam.members) {
      const resolved = resolveBattleForm(raw);
      if (resolved.error || !isKnownMember(raw)) continue;
      const { pokemon: form } = resolved;
      if (excluded.has(normalize(form)) || excluded.has(basePokemon(form)))
        continue;
      if (isMegaSpecies(form) && megas >= MAX_TEAM_MEGAS) continue;
      if (queryKey && !normalize(form).includes(queryKey)) continue;
      const canonical = canonicalMember(raw);
      if (
        !empty(canonical.item) &&
        teammateItems.has(normalize(canonical.item ?? ''))
      )
        continue;
      const member: Member = {
        pokemon: canonical.pokemon,
        item: clean(canonical.item),
        ability: clean(canonical.ability),
        nature: clean(canonical.nature),
        spread: clean(canonical.spread),
        moves: canonical.moves.filter((move) => !empty(move)),
      };
      const key = `${normalize(form)}|${signatureOf(member)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        pokemon: member.pokemon,
        member,
        sharedTeammates: shared,
        matchingDetails: details,
        role: postalRole(member.pokemon, teams, tags),
        roleFill: missing.some((role) => roleFlags(member).includes(role)),
        archetype: tagsForTeam(tags, favTeam.id)?.archetype ?? null,
        support: 1,
        consensus: true,
        consensusSupport: 1,
        source: {
          id: favTeam.id,
          name: favTeam.name,
          regulation: currentRegulation,
          members: favTeam.members,
          pasteUrl: '',
          paste: null,
          sheetIds: [],
          creator: '',
          publishedAt: '',
          replicaCode: null,
          replicaStatus: '',
          reports: [],
          pasteNotes: null,
        },
        favorite: true,
        favoriteTeamName: favTeam.name,
      });
    }
  }
  return rows;
}

export function pokemonSuggestions(
  teammates: Member[],
  teams: Team[],
  currentRegulation: string,
  excludePokemon?: string,
  tags?: TeamTagsIndex,
  query = '',
  { minShared = 1, limit = 6 }: { minShared?: number; limit?: number } = {},
  favoriteTeams: readonly FavoriteTeamSource[] = []
): PokemonSuggestion[] {
  const current = teams.filter((team) => team.regulation === currentRegulation);
  const { ranked, missing } = rankedSourceTeams(
    teammates,
    current,
    currentRegulation,
    tags
  );
  const excluded = new Set<string>();
  const exclude = (member: Pick<Member, 'pokemon' | 'item' | 'ability'>) => {
    const form = resolveBattleForm(member);
    const name = form.error ? member.pokemon : form.pokemon;
    excluded.add(normalize(name));
    excluded.add(basePokemon(name));
  };
  teammates.forEach(exclude);
  if (excludePokemon)
    exclude({ pokemon: excludePokemon, item: null, ability: null });
  const megas = teammates.filter((member) =>
    isMegaSpecies(resolveBattleForm(member).pokemon || member.pokemon)
  ).length;
  const queryKey = normalize(query);
  const favoriteRows = buildFavoriteSuggestions(
    teammates,
    favoriteTeams,
    excluded,
    megas,
    queryKey,
    queryKey ? 0 : minShared,
    teams,
    currentRegulation,
    tags,
    missing
  );
  const favoriteKeys = new Set(
    favoriteRows.map(
      (row) =>
        `${normalize(resolveBattleForm(row.member).pokemon)}|${signatureOf(row.member)}`
    )
  );
  const candidates = new Map<string, Candidate>();
  const effectiveMinShared = queryKey ? 0 : minShared;
  for (const { team, shared, details } of ranked) {
    if (shared < effectiveMinShared) break;
    for (const member of team.members) {
      const resolved = resolveBattleForm(member);
      if (resolved.error) continue;
      const { pokemon: form } = resolved;
      if (excluded.has(normalize(form)) || excluded.has(basePokemon(form)))
        continue;
      if (isMegaSpecies(form) && megas >= MAX_TEAM_MEGAS) continue;
      if (queryKey && !normalize(form).includes(queryKey)) continue;
      let candidate = candidates.get(form);
      if (!candidate) {
        candidate = {
          form,
          names: new Map(),
          members: [],
          teamIds: new Set(),
          support: 0,
          bestShared: shared,
          bestDetails: details,
          bestSource: team,
          roleFill: false,
        };
        candidates.set(form, candidate);
      }
      candidate.names.set(
        member.pokemon,
        (candidate.names.get(member.pokemon) ?? 0) + 1
      );
      candidate.members.push(member);
      if (!candidate.teamIds.has(team.id)) {
        candidate.teamIds.add(team.id);
        candidate.support++;
      }
      if (missing.some((role) => roleFlags(member).includes(role)))
        candidate.roleFill = true;
    }
  }
  const catalogRows: PokemonSuggestion[] = [];
  const ordered = [...candidates.values()].sort(
    (a, b) =>
      b.bestShared - a.bestShared ||
      b.support - a.support ||
      b.bestDetails - a.bestDetails ||
      compareTeams(
        a.bestSource,
        b.bestSource,
        currentRegulation,
        Number(b.roleFill) - Number(a.roleFill)
      ) ||
      a.form.localeCompare(b.form)
  );
  for (const candidate of ordered) {
    if (catalogRows.length >= limit) break;
    const suggestion = synthesize(
      candidate,
      teammates,
      teams,
      currentRegulation,
      tags,
      missing
    );
    if (!suggestion) continue;
    const key = `${normalize(resolveBattleForm(suggestion.member).pokemon)}|${signatureOf(suggestion.member)}`;
    if (!favoriteKeys.has(key)) catalogRows.push(suggestion);
  }
  return [...favoriteRows, ...catalogRows];
}

export function swapTargets(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  favoriteTeams: readonly FavoriteTeamSource[] = []
): string[] {
  const present = new Set<string>();
  let megas = 0;
  for (const member of members) {
    const form = resolveBattleForm(member);
    const name = form.error ? member.pokemon : form.pokemon;
    present.add(normalize(name));
    present.add(basePokemon(name));
    if (isMegaSpecies(name)) megas++;
  }
  const names = new Set<string>();
  const addMember = (member: Member, requireKnown: boolean) => {
    if (requireKnown && !isKnownMember(member)) return;
    const form = resolveBattleForm(member);
    if (form.error) return;
    if (
      present.has(normalize(form.pokemon)) ||
      present.has(basePokemon(form.pokemon)) ||
      (isMegaSpecies(form.pokemon) && megas >= MAX_TEAM_MEGAS)
    )
      return;
    names.add(form.pokemon);
  };
  for (const team of teams) {
    if (team.regulation !== currentRegulation) continue;
    for (const member of team.members) addMember(member, false);
  }
  for (const favTeam of favoriteTeams) {
    for (const member of favTeam.members) addMember(member, true);
  }
  return [...names].sort();
}

export function swapIdeas(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  tags?: TeamTagsIndex,
  limit = 4,
  favoriteTeams: readonly FavoriteTeamSource[] = []
): SwapSuggestion[] {
  const favoritePool: SwapSuggestion[] = [];
  const catalogPool: SwapSuggestion[] = [];
  for (const [slot, replaced] of members.entries()) {
    const teammates = members.filter((_, index) => index !== slot);
    if (favoriteTeams.length) {
      for (const fav of pokemonSuggestions(
        teammates,
        teams,
        currentRegulation,
        replaced.pokemon,
        tags,
        '',
        { minShared: 1, limit: 0 },
        favoriteTeams
      ))
        favoritePool.push({ ...fav, slot });
    }
    const [best] = pokemonSuggestions(
      teammates,
      teams,
      currentRegulation,
      replaced.pokemon,
      tags,
      '',
      { minShared: 3, limit: 1 }
    );
    if (best) catalogPool.push({ ...best, slot });
  }
  const seenFavoriteSets = new Set<string>();
  const favoriteSlotSets = new Set<string>();
  const favoriteIdeas = favoritePool
    .sort(
      (a, b) =>
        b.sharedTeammates - a.sharedTeammates ||
        b.matchingDetails - a.matchingDetails ||
        a.slot - b.slot
    )
    .filter((idea) => {
      const form = normalize(resolveBattleForm(idea.member).pokemon);
      const key = `${form}|${signatureOf(idea.member)}`;
      if (seenFavoriteSets.has(key)) return false;
      seenFavoriteSets.add(key);
      favoriteSlotSets.add(`${idea.slot}|${key}`);
      return true;
    });
  const seenCatalogSpecies = new Set<string>();
  const catalogIdeas = catalogPool
    .sort(
      (a, b) =>
        b.sharedTeammates - a.sharedTeammates ||
        b.support - a.support ||
        b.matchingDetails - a.matchingDetails ||
        compareTeams(a.source, b.source, currentRegulation) ||
        a.slot - b.slot
    )
    .filter((idea) => {
      const form = normalize(resolveBattleForm(idea.member).pokemon);
      const setKey = `${idea.slot}|${form}|${signatureOf(idea.member)}`;
      if (favoriteSlotSets.has(setKey) || seenCatalogSpecies.has(form))
        return false;
      seenCatalogSpecies.add(form);
      return true;
    })
    .slice(0, limit);
  return [...favoriteIdeas, ...catalogIdeas];
}

export function swapSuggestions(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  pokemon: string,
  tags?: TeamTagsIndex,
  favoriteTeams: readonly FavoriteTeamSource[] = []
): SwapSuggestion[] {
  const wanted = normalize(pokemon);
  const candidates: SwapSuggestion[] = [];
  for (const [slot, replaced] of members.entries()) {
    const teammates = members.filter((_, index) => index !== slot);
    for (const suggestion of pokemonSuggestions(
      teammates,
      teams,
      currentRegulation,
      replaced.pokemon,
      tags,
      pokemon,
      { minShared: 1, limit: 6 },
      favoriteTeams
    ))
      if (
        (suggestion.favorite || suggestion.sharedTeammates > 0) &&
        normalize(resolveBattleForm(suggestion.member).pokemon) === wanted
      )
        candidates.push({ ...suggestion, slot });
  }
  return candidates.sort((a, b) => {
    const favDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    if (favDiff) return favDiff;
    if (a.favorite && b.favorite) {
      return (
        b.sharedTeammates - a.sharedTeammates ||
        b.matchingDetails - a.matchingDetails ||
        a.slot - b.slot
      );
    }
    return (
      b.sharedTeammates - a.sharedTeammates ||
      b.support - a.support ||
      b.matchingDetails - a.matchingDetails ||
      compareTeams(a.source, b.source, currentRegulation) ||
      a.slot - b.slot
    );
  });
}
