import type { Member } from './catalog.ts';
import { normalize } from './catalog.ts';
import { resolveBattleForm } from './battle-forms.ts';
import {
  evaluateMatchup,
  type BenchmarkConditions,
  type MatchupResult,
} from './benchmarks.ts';
import {
  CHAMPIONS_STATS,
  NATURES,
  championsSpreadTotal,
  formatChampionsSpread,
  parseChampionsSpread,
  spreadDeltas,
  spreadMoved,
  type ChampionsStat,
  type SpreadDelta,
} from './paste.ts';
import { statsFor } from './stats.ts';

export type BenchmarkSuggestion = {
  spread: string;
  nature: string;
  movedPoints: number;
  deltas: SpreadDelta[];
  stats: Record<ChampionsStat, number>;
  matchup: Extract<MatchupResult, { kind: 'exact' }>;
};

export type BenchmarkSearchOptions = {
  goal: 'survive' | 'ko';
  probability: number;
  optimizeStats: ChampionsStat[];
  lockedStats: ChampionsStat[];
};

export function suggestBenchmarkSpreads(
  self: Member,
  opponent: Member,
  direction: 'incoming' | 'outgoing',
  move: string,
  conditions: BenchmarkConditions,
  options: BenchmarkSearchOptions
): BenchmarkSuggestion[] {
  const { goal, probability, optimizeStats, lockedStats } = options;
  if (
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1 ||
    !['survive', 'ko'].includes(goal) ||
    optimizeStats.length < 1 ||
    optimizeStats.length > 2 ||
    new Set(optimizeStats).size !== optimizeStats.length ||
    [...optimizeStats, ...lockedStats].some(
      (stat) => !CHAMPIONS_STATS.includes(stat)
    ) ||
    new Set(lockedStats).size !== lockedStats.length
  )
    return [];
  const nature = NATURES.find(
    (name) => normalize(name) === normalize(self.nature ?? '')
  );
  const initial = self.spread ? parseChampionsSpread(self.spread) : null;
  if (
    !nature ||
    !initial ||
    championsSpreadTotal(initial) !== 66 ||
    CHAMPIONS_STATS.some(
      (stat) =>
        !Number.isInteger(initial[stat]) ||
        initial[stat] < 0 ||
        initial[stat] > 32
    )
  )
    return [];
  const original = evaluateMatchup(self, opponent, direction, move, conditions);
  const chance = (result: Extract<MatchupResult, { kind: 'exact' }>) =>
    goal === 'survive' ? result.survivalChance : result.koChance;
  if (original.kind !== 'exact' || chance(original) >= probability) return [];

  const optimized = optimizeStats.filter((stat) => !lockedStats.includes(stat));
  const donors = CHAMPIONS_STATS.filter(
    (stat) => !optimizeStats.includes(stat) && !lockedStats.includes(stat)
  );
  const form = resolveBattleForm(self, conditions.self.form ?? undefined);
  if (form.error) return [];
  const candidates = new Map<string, BenchmarkSuggestion>();
  for (let first = 0; first <= 32; first++) {
    for (
      let second = 0;
      second <= (optimized.length === 2 ? 32 : 0);
      second++
    ) {
      const candidate = { ...initial };
      if (optimized[0]) candidate[optimized[0]] = first;
      if (optimized[1]) candidate[optimized[1]] = second;
      let balance = championsSpreadTotal(candidate) - 66;
      const ordered = [...donors].sort((a, b) =>
        balance > 0
          ? initial[b] - initial[a] ||
            CHAMPIONS_STATS.indexOf(a) - CHAMPIONS_STATS.indexOf(b)
          : 32 - initial[b] - (32 - initial[a]) ||
            CHAMPIONS_STATS.indexOf(a) - CHAMPIONS_STATS.indexOf(b)
      );
      for (const stat of ordered) {
        if (!balance) break;
        const change =
          balance > 0
            ? Math.min(balance, candidate[stat])
            : -Math.min(-balance, 32 - candidate[stat]);
        candidate[stat] -= change;
        balance -= change;
      }
      if (balance) continue;
      const spread = formatChampionsSpread(candidate);
      if (spread === formatChampionsSpread(initial) || candidates.has(spread))
        continue;
      const matchup = evaluateMatchup(
        { ...self, spread },
        opponent,
        direction,
        move,
        conditions
      );
      if (matchup.kind !== 'exact' || chance(matchup) < probability) continue;
      const stats = statsFor(form.pokemon, candidate, nature);
      if (!stats) continue;
      const deltas = spreadDeltas(initial, candidate);
      candidates.set(spread, {
        spread,
        nature,
        movedPoints: spreadMoved(deltas) / 2,
        deltas,
        stats,
        matchup,
      });
    }
  }
  return [...candidates.values()]
    .sort(
      (a, b) =>
        a.movedPoints - b.movedPoints ||
        a.deltas.length - b.deltas.length ||
        b.stats.Spe - a.stats.Spe ||
        a.spread.localeCompare(b.spread)
    )
    .slice(0, 3);
}
