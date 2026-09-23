import { normalize, type Team } from './catalog.ts';
import { battleSpecies, resolveBattleForm } from './battle-forms.ts';
import statsData from './data/pokemon-stats.json' with { type: 'json' };
import {
  CHAMPIONS_STATS,
  NATURES,
  championsSpreadTotal,
  formatChampionsSpread,
  natureEffect,
  parseChampionsSpread,
  spreadDeltas,
  type ChampionsSpread,
  type ChampionsStat,
  type SpreadDelta,
} from './paste.ts';

export type StatRow = [number, number, number, number, number, number];

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
export const finalStat = (intercept: number, sp: number, multiplier: number) =>
  Math.floor((intercept + sp) * multiplier);

export const finalHp = (intercept: number, sp: number) =>
  intercept === 1 ? 1 : intercept + sp;

export function statsFor(
  pokemon: string,
  spread: ChampionsSpread | null,
  nature: string | null
): Record<ChampionsStat, number> | null {
  const row = statRow(pokemon);
  if (
    !row ||
    !spread ||
    !NATURES.some((name) => normalize(name) === normalize(nature ?? ''))
  )
    return null;
  if (
    CHAMPIONS_STATS.some(
      (stat) =>
        !Number.isInteger(spread[stat]) || spread[stat] < 0 || spread[stat] > 32
    ) ||
    championsSpreadTotal(spread) > 66
  )
    return null;
  return Object.fromEntries(
    CHAMPIONS_STATS.map((stat, index) => [
      stat,
      index === 0
        ? finalHp(row[0], spread.HP)
        : finalStat(row[index], spread[stat], natureMultiplier(nature, stat)),
    ])
  ) as Record<ChampionsStat, number>;
}

export function natureMultiplier(
  nature: string | null,
  stat: ChampionsStat
): number {
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

export interface SpeedTier {
  pokemon: string;
  medianSpeed: number;
  count: number;
}

interface SpeedIndex {
  tiers: SpeedTier[];
  speeds: number[];
}

const speedCache = new WeakMap<Team[], SpeedIndex>();

/* Only legal 66-point spreads enter the benchmark, so a half-filled draft
   spread cannot skew it. */
function speedIndex(teams: Team[]): SpeedIndex {
  let cached = speedCache.get(teams);
  if (cached) return cached;
  const bySpecies = new Map<string, { pokemon: string; speeds: number[] }>();
  const speeds: number[] = [];
  for (const team of teams) {
    for (const member of team.members) {
      const parsed = member.spread ? parseChampionsSpread(member.spread) : null;
      if (!parsed || championsSpreadTotal(parsed) !== 66) continue;
      const form = resolveBattleForm(member);
      if (
        form.error ||
        !NATURES.some(
          (name) => normalize(name) === normalize(member.nature ?? '')
        )
      )
        continue;
      const speed = speedFor(form.pokemon, parsed, member.nature);
      if (speed === null) continue;
      speeds.push(speed);
      const key = normalize(form.pokemon);
      const entry = bySpecies.get(key);
      if (entry) entry.speeds.push(speed);
      else bySpecies.set(key, { pokemon: form.pokemon, speeds: [speed] });
    }
  }
  const tiers = [...bySpecies.values()]
    .map(({ pokemon, speeds: values }) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        pokemon,
        medianSpeed: sorted[Math.floor((sorted.length - 1) / 2)],
        count: values.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.pokemon.localeCompare(b.pokemon));
  cached = { tiers, speeds: speeds.sort((a, b) => a - b) };
  speedCache.set(teams, cached);
  return cached;
}

export function speedTiers(teams: Team[], limit = 12): SpeedTier[] {
  return speedIndex(teams).tiers.slice(0, limit);
}

export function speedBenchmark(
  pokemon: string,
  spread: ChampionsSpread | null,
  nature: string | null,
  teams: Team[]
): { speed: number; beatPercent: number } | null {
  const speed = speedFor(pokemon, spread, nature);
  if (speed === null) return null;
  const { speeds } = speedIndex(teams);
  if (!speeds.length) return null;
  let below = 0;
  for (const value of speeds) {
    if (value >= speed) break;
    below++;
  }
  return { speed, beatPercent: Math.round((below / speeds.length) * 100) };
}

export interface SpreadNudge {
  value: string;
  target: string;
  targetSpeed: number;
  speed: number;
  moved: number;
  deltas: SpreadDelta[];
}

/* Points come out of the stats with the most to spare, smallest tier first. */
export function spreadNudges(
  pokemon: string,
  spread: ChampionsSpread | null,
  nature: string | null,
  teams: Team[],
  limit = 2
): SpreadNudge[] {
  const row = statRow(pokemon);
  if (!row || !spread) return [];
  const currentSpeed = speedFor(pokemon, spread, nature);
  if (currentSpeed === null) return [];

  const bySpeed = new Map<number, SpeedTier>();
  for (const tier of speedTiers(teams, 12)) {
    if (tier.medianSpeed < currentSpeed) continue;
    if (!bySpeed.has(tier.medianSpeed)) bySpeed.set(tier.medianSpeed, tier);
  }

  const nudges: SpreadNudge[] = [];
  for (const tier of [...bySpeed.values()].sort(
    (a, b) => a.medianSpeed - b.medianSpeed
  )) {
    if (nudges.length >= limit) break;
    let spMin = -1;
    for (let sp = spread.Spe; sp <= 32; sp++) {
      if (
        finalStat(row[5], sp, natureMultiplier(nature, 'Spe')) >
        tier.medianSpeed
      ) {
        spMin = sp;
        break;
      }
    }
    const deficit = spMin - spread.Spe;
    if (spMin < 0 || deficit <= 0) continue;

    const next = { ...spread };
    let remaining = deficit;
    const donors = CHAMPIONS_STATS.filter((stat) => stat !== 'Spe').sort(
      (a, b) =>
        next[b] - next[a] ||
        CHAMPIONS_STATS.indexOf(a) - CHAMPIONS_STATS.indexOf(b)
    );
    for (const stat of donors) {
      if (remaining <= 0) break;
      const taken = Math.min(next[stat], remaining);
      next[stat] -= taken;
      remaining -= taken;
    }
    if (remaining > 0) continue;

    next.Spe = spMin;
    nudges.push({
      value: formatChampionsSpread(next),
      target: `median ${tier.pokemon} (${tier.medianSpeed})`,
      targetSpeed: tier.medianSpeed,
      speed: finalStat(row[5], spMin, natureMultiplier(nature, 'Spe')),
      moved: deficit,
      deltas: spreadDeltas(spread, next),
    });
  }
  return nudges;
}
