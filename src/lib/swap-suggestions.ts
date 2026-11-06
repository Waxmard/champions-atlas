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
      .filter(({ shared }) => shared > 0)
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

export function pokemonSuggestions(
  teammates: Member[],
  teams: Team[],
  currentRegulation: string,
  excludePokemon?: string,
  tags?: TeamTagsIndex,
  query = '',
  { minShared = 1, limit = 6 }: { minShared?: number; limit?: number } = {}
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
  const candidates = new Map<string, Candidate>();
  for (const { team, shared, details } of ranked) {
    if (shared < minShared) break;
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
  const suggestions: PokemonSuggestion[] = [];
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
    if (suggestions.length >= limit) break;
    const suggestion = synthesize(
      candidate,
      teammates,
      teams,
      currentRegulation,
      tags,
      missing
    );
    if (suggestion) suggestions.push(suggestion);
  }
  return suggestions;
}

export function swapTargets(
  members: Member[],
  teams: Team[],
  currentRegulation: string
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
  for (const team of teams) {
    if (team.regulation !== currentRegulation) continue;
    for (const member of team.members) {
      const form = resolveBattleForm(member);
      if (form.error) continue;
      if (
        present.has(normalize(form.pokemon)) ||
        present.has(basePokemon(form.pokemon)) ||
        (isMegaSpecies(form.pokemon) && megas >= MAX_TEAM_MEGAS)
      )
        continue;
      names.add(form.pokemon);
    }
  }
  return [...names].sort();
}

export function swapIdeas(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  tags?: TeamTagsIndex,
  limit = 4
): SwapSuggestion[] {
  const ideas: SwapSuggestion[] = [];
  for (const [slot, replaced] of members.entries()) {
    const teammates = members.filter((_, index) => index !== slot);
    const [best] = pokemonSuggestions(
      teammates,
      teams,
      currentRegulation,
      replaced.pokemon,
      tags,
      '',
      { minShared: 3, limit: 1 }
    );
    if (best) ideas.push({ ...best, slot });
  }
  const seen = new Set<string>();
  return ideas
    .sort(
      (a, b) =>
        b.sharedTeammates - a.sharedTeammates ||
        b.support - a.support ||
        b.matchingDetails - a.matchingDetails ||
        compareTeams(a.source, b.source, currentRegulation) ||
        a.slot - b.slot
    )
    .filter((idea) => {
      const key = normalize(resolveBattleForm(idea.member).pokemon);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function swapSuggestions(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  pokemon: string,
  tags?: TeamTagsIndex
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
      { minShared: 1, limit: 6 }
    ))
      if (normalize(resolveBattleForm(suggestion.member).pokemon) === wanted)
        candidates.push({ ...suggestion, slot });
  }
  return candidates.sort(
    (a, b) =>
      b.sharedTeammates - a.sharedTeammates ||
      b.support - a.support ||
      b.matchingDetails - a.matchingDetails ||
      compareTeams(a.source, b.source, currentRegulation) ||
      a.slot - b.slot
  );
}
