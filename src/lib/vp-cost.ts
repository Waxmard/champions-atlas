import { resolveBattleForm } from './battle-forms.ts';
import {
  isMegaSpecies,
  normalize,
  pokemonId,
  type Member,
  type Team,
} from './catalog.ts';
import type { CurrentSet } from './current-sets.ts';
import {
  CHAMPIONS_STATS,
  natureEffect,
  parseChampionsSpread,
} from './paste.ts';
import {
  catalogSpreadSuggestions,
  catalogSuggestions,
  type CatalogSuggestion,
} from './workbench.ts';

export const VP_COSTS = {
  move: 250,
  nature: 500,
  ability: 500,
  statPoint: 5,
  // ponytail: flat guess for a Pokémon with no recorded in-game set, and items are never priced; upgrade to a per-species estimate or owned-item tracking if the totals mislead.
  unrecorded: 1500,
} as const;

export interface SetVpCost {
  vp: number;
  recorded: boolean;
}

export interface TeamVpCost {
  total: number;
  unrecorded: number;
  estimated: number;
}

export interface VpCatalog {
  teams: Team[];
  allTeams?: Team[];
  currentRegulation: string;
}

function trainedAbility(member: Member): string {
  const ability = normalize(member.ability ?? '');
  const form = resolveBattleForm(member);
  return !form.error &&
    isMegaSpecies(form.pokemon) &&
    ability === normalize(form.ability ?? '')
    ? ''
    : ability;
}

function addedStatPoints(from: Member, to: Member): number {
  if (!from.spread?.trim() || !to.spread?.trim()) return 0;
  const before = parseChampionsSpread(from.spread);
  const after = parseChampionsSpread(to.spread);
  if (!before || !after) return 0;
  return CHAMPIONS_STATS.reduce(
    (sum, stat) => sum + Math.max(0, after[stat] - before[stat]),
    0
  );
}

export function setVpCost(from: Member | undefined, to: Member): SetVpCost {
  if (from === undefined) return { vp: VP_COSTS.unrecorded, recorded: false };
  let vp = 0;

  const fromAbility = trainedAbility(from);
  const toAbility = trainedAbility(to);
  if (fromAbility && toAbility && fromAbility !== toAbility)
    vp += VP_COSTS.ability;

  const fromNature = normalize(from.nature ?? '');
  const toNature = normalize(to.nature ?? '');
  if (
    fromNature &&
    toNature &&
    fromNature !== toNature &&
    (natureEffect(from.nature) || natureEffect(to.nature))
  )
    vp += VP_COSTS.nature;

  const known = new Set(from.moves.map(normalize).filter(Boolean));
  if (known.size > 0)
    vp +=
      VP_COSTS.move *
      to.moves.filter((move) => {
        const key = normalize(move);
        return key && !known.has(key);
      }).length;

  vp += VP_COSTS.statPoint * addedStatPoints(from, to);
  return { vp, recorded: true };
}

const estimateCache = new WeakMap<Team[], Map<string, Member>>();

const listed = (value: string | null | undefined) => Boolean(value?.trim());
const incomplete = (member: Member) =>
  !listed(member.ability) ||
  !listed(member.nature) ||
  !listed(member.spread) ||
  member.moves.filter(listed).length < 4;
const seen = (values: CatalogSuggestion[]) =>
  values.filter(({ totalCount }) => totalCount > 0).map(({ value }) => value);

function filled(
  member: Member,
  teams: Team[],
  regulation: string,
  teammates: Member[]
): Member {
  const options = catalogSuggestions(member, teams, regulation, teammates);
  const ability = listed(member.ability)
    ? member.ability
    : (seen(options.abilities)[0] ?? null);
  const nature = listed(member.nature)
    ? member.nature
    : (seen(options.natures)[0] ?? null);
  const moves = member.moves.filter(listed);
  const known = new Set(moves.map(normalize));
  for (const move of seen(options.moves)) {
    if (moves.length >= 4) break;
    if (!known.has(normalize(move))) moves.push(move);
  }
  const spread = listed(member.spread)
    ? member.spread
    : (catalogSpreadSuggestions(
        { ...member, nature },
        teams,
        regulation,
        1,
        teammates
      )[0]?.spread ?? null);
  return { ...member, ability, nature, moves, spread };
}

function estimatedMember(
  member: Member,
  members: readonly Member[],
  catalog: VpCatalog
): Member {
  if (!incomplete(member)) return member;
  let cache = estimateCache.get(catalog.teams);
  if (!cache) estimateCache.set(catalog.teams, (cache = new Map()));
  const key = `${members.indexOf(member)}:${JSON.stringify(members)}`;
  let estimate = cache.get(key);
  if (!estimate) {
    const teammates = members.filter((other) => other !== member);
    estimate = member;
    for (const teams of [catalog.teams, catalog.allTeams ?? []])
      if (incomplete(estimate))
        estimate = filled(
          estimate,
          teams,
          catalog.currentRegulation,
          teammates
        );
    cache.set(key, estimate);
  }
  return estimate;
}

export function teamVpCost(
  sets: readonly CurrentSet[],
  members: readonly Member[],
  catalog: VpCatalog
): TeamVpCost {
  let estimated = 0;
  const costs = members.map((member) => {
    const from = sets.find(
      (entry) => entry.id === pokemonId(member.pokemon)
    )?.member;
    if (!from) return setVpCost(from, member);
    const to = estimatedMember(member, members, catalog);
    if (
      to.ability !== member.ability ||
      to.nature !== member.nature ||
      to.spread !== member.spread ||
      to.moves.filter(listed).length !== member.moves.filter(listed).length
    )
      estimated++;
    return setVpCost(from, to);
  });
  return {
    total: costs.reduce((sum, cost) => sum + cost.vp, 0),
    unrecorded: costs.filter((cost) => !cost.recorded).length,
    estimated,
  };
}

export function sortByVpCost<T extends { members: readonly Member[] }>(
  teams: readonly T[],
  sets: readonly CurrentSet[] | null
): T[] {
  if (!sets) return [...teams];
  return teams
    .map((team) => ({
      team,
      total: team.members.reduce(
        (sum, member) =>
          sum +
          setVpCost(
            sets.find((entry) => entry.id === pokemonId(member.pokemon))
              ?.member,
            member
          ).vp,
        0
      ),
    }))
    .sort((a, b) => a.total - b.total)
    .map(({ team }) => team);
}

export const formatVp = (vp: number) => `${vp.toLocaleString('en-US')} VP`;
