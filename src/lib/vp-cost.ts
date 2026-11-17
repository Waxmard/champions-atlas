import { resolveBattleForm } from './battle-forms.ts';
import { isMegaSpecies, normalize, pokemonId, type Member } from './catalog.ts';
import type { CurrentSet } from './current-sets.ts';
import {
  CHAMPIONS_STATS,
  natureEffect,
  parseChampionsSpread,
} from './paste.ts';

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
  members: SetVpCost[];
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

export function teamVpCost(
  sets: readonly CurrentSet[],
  members: readonly Member[]
): TeamVpCost {
  const costs = members.map((member) =>
    setVpCost(
      sets.find((entry) => entry.id === pokemonId(member.pokemon))?.member,
      member
    )
  );
  return {
    total: costs.reduce((sum, cost) => sum + cost.vp, 0),
    unrecorded: costs.filter((cost) => !cost.recorded).length,
    members: costs,
  };
}

export const formatVp = (vp: number, estimated: boolean) =>
  `${estimated ? '≈ ' : ''}${vp.toLocaleString('en-US')} VP`;
