import { normalize } from './catalog.ts';
import { battleSpecies } from './battle-forms.ts';
import statsData from './data/pokemon-stats.json' with { type: 'json' };
import {
  natureEffect,
  type ChampionsSpread,
  type ChampionsStat,
} from './paste.ts';

type StatRow = [number, number, number, number, number, number];

const TABLE = statsData.stats as Record<string, number[] | undefined>;
const STAT_ALIASES: Record<string, string> = {
  aegislashshield: 'aegislash',
  floettemega: 'floetteeternalmega',
};

export function statRow(pokemon: string): StatRow | null {
  const key = normalize(pokemon);
  const row = TABLE[key] ?? TABLE[STAT_ALIASES[key]];
  if (row?.length === 6) return row as StatRow;
  const base = battleSpecies(pokemon)?.baseStats;
  return base
    ? [
        base.hp === 1 ? 1 : base.hp + 75,
        base.atk + 20,
        base.def + 20,
        base.spa + 20,
        base.spd + 20,
        base.spe + 20,
      ]
    : null;
}

/* Level-50 stat from a 0-SP intercept and a neutral-nature intercept table. */
const finalStat = (intercept: number, sp: number, multiplier: number) =>
  Math.floor((intercept + sp) * multiplier);

function natureMultiplier(nature: string | null, stat: ChampionsStat): number {
  const effect = natureEffect(nature);
  if (effect?.raised === stat) return 1.1;
  if (effect?.lowered === stat) return 0.9;
  return 1;
}

export function speedFor(
  pokemon: string,
  spread: ChampionsSpread | null,
  nature: string | null
): number | null {
  const row = statRow(pokemon);
  if (!row) return null;
  return finalStat(row[5], spread?.Spe ?? 0, natureMultiplier(nature, 'Spe'));
}
