import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { normalize, type Member, type Team } from './catalog.ts';
import { resolveBattleForm } from './battle-forms.ts';
import {
  evaluateMatchup,
  ownSetConditions,
  type BenchmarkIndex,
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
import { speedFor, speedTiers, spreadNudges, statsFor } from './stats.ts';

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

export async function suggestBenchmarkSpreads(
  self: Member,
  opponent: Member,
  direction: 'incoming' | 'outgoing',
  move: string,
  conditions: BenchmarkConditions,
  options: BenchmarkSearchOptions,
  signal?: AbortSignal
): Promise<BenchmarkSuggestion[]> {
  abortIfNeeded(signal);
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
  let allocations = 0;
  for (let first = 0; first <= 32; first++) {
    for (
      let second = 0;
      second <= (optimized.length === 2 ? 32 : 0);
      second++
    ) {
      abortIfNeeded(signal);
      if (allocations && allocations % 32 === 0) await yieldToBrowser(signal);
      allocations++;
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

export type SpreadRecommendation = {
  value: string;
  nature: string;
  movedPoints: number;
  deltas: SpreadDelta[];
  speed: number;
  reasons: string[];
  tradeoffs: string[];
};

export type SpreadRecommendations = {
  suggestions: SpreadRecommendation[];
  message: string | null;
};

type DamageTarget = {
  pokemon: string;
  member: Member;
  frequency: number;
  direction: 'incoming' | 'outgoing';
  move: string;
  conditions: BenchmarkConditions;
  baseline: Extract<MatchupResult, { kind: 'exact' }>;
};

const generation = Generations.get(0);
const statForCalc: Record<string, ChampionsStat> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};
const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted)
    throw new DOMException('The operation was aborted', 'AbortError');
};
const yieldToBrowser = async (signal?: AbortSignal) => {
  abortIfNeeded(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  abortIfNeeded(signal);
};
const isLegalSpread = (spread: ReturnType<typeof parseChampionsSpread>) =>
  !!spread &&
  championsSpreadTotal(spread) === 66 &&
  CHAMPIONS_STATS.every(
    (stat) =>
      Number.isInteger(spread[stat]) && spread[stat] >= 0 && spread[stat] <= 32
  );
const moveStat = (
  move: string,
  direction: 'incoming' | 'outgoing'
): ChampionsStat | null => {
  const data = generation.moves.get(normalize(move) as ID);
  if (!data || data.category === 'Status') return null;
  const stat =
    direction === 'incoming'
      ? (data.overrideDefensiveStat ??
        (data.category === 'Physical' ? 'def' : 'spd'))
      : (data.overrideOffensiveStat ??
        (data.category === 'Physical' ? 'atk' : 'spa'));
  return statForCalc[stat] ?? null;
};

export async function recommendSpreads(
  self: Member,
  index: BenchmarkIndex,
  teams: Team[],
  signal?: AbortSignal
): Promise<SpreadRecommendations> {
  abortIfNeeded(signal);
  const initial = self.spread ? parseChampionsSpread(self.spread) : null;
  if (!isLegalSpread(initial))
    return {
      suggestions: [],
      message: 'Complete a valid 66-point spread to see suggestions.',
    };
  const nature = NATURES.find(
    (name) => normalize(name) === normalize(self.nature ?? '')
  );
  if (!nature)
    return { suggestions: [], message: 'Choose a nature to see suggestions.' };
  const form = resolveBattleForm(self);
  if (form.error) return { suggestions: [], message: form.error };
  if (!statsFor(form.pokemon, initial, nature))
    return {
      suggestions: [],
      message: 'Stat data is unavailable for this form.',
    };

  const speedTeams = teams.filter(
    (team) => team.regulation === index.regulation
  );
  const tiers = speedTiers(speedTeams, 12);
  const currentSpeed = speedFor(form.pokemon, initial, nature);
  const nudges =
    currentSpeed === null
      ? []
      : spreadNudges(form.pokemon, initial, nature, speedTeams, 2);
  const targets: DamageTarget[] = [];
  let unavailableReason: string | null = null;
  const species = index.species
    .filter((entry) => entry.variants.length)
    .slice(0, 12);

  for (const entry of species) {
    abortIfNeeded(signal);
    const opponent = entry.variants[0].member;
    for (const direction of ['incoming', 'outgoing'] as const) {
      const source = direction === 'incoming' ? opponent : self;
      const conditions = ownSetConditions(self, opponent);
      let best: DamageTarget | null = null;
      let bestKo = -1;
      let bestMax = -1;
      for (const move of source.moves) {
        const result = evaluateMatchup(
          self,
          opponent,
          direction,
          move,
          conditions
        );
        if (result.kind !== 'exact') {
          unavailableReason ??= result.reason;
          continue;
        }
        if (
          result.koChance > bestKo ||
          (result.koChance === bestKo && result.maxDamage > bestMax)
        ) {
          best = {
            pokemon: entry.pokemon,
            member: opponent,
            frequency: entry.variants[0].teamIds.length,
            direction,
            move,
            conditions,
            baseline: result,
          };
          bestKo = result.koChance;
          bestMax = result.maxDamage;
        }
      }
      if (best) targets.push(best);
    }
  }

  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    const parsed = parseChampionsSpread(value);
    if (parsed && isLegalSpread(parsed))
      candidates.add(formatChampionsSpread(parsed));
  };
  for (const target of targets) {
    abortIfNeeded(signal);
    const goal = target.direction === 'incoming' ? 'survive' : 'ko';
    const chance =
      goal === 'survive'
        ? target.baseline.survivalChance
        : target.baseline.koChance;
    if (chance < 1) {
      const stat = moveStat(target.move, target.direction);
      if (stat) {
        const results = await suggestBenchmarkSpreads(
          self,
          target.member,
          target.direction,
          target.move,
          target.conditions,
          {
            goal,
            probability: 1,
            optimizeStats:
              target.direction === 'incoming' ? ['HP', stat] : [stat],
            lockedStats: [],
          },
          signal
        );
        if (results[0]) addCandidate(results[0].spread);
      }
    }
    await yieldToBrowser(signal);
  }
  for (const nudge of nudges) addCandidate(nudge.value);

  const baselineSpeedTiers = new Set<string>();
  for (const tier of tiers)
    if ((currentSpeed ?? -1) > tier.medianSpeed)
      baselineSpeedTiers.add('speed:' + normalize(tier.pokemon));
  const evaluated: Array<{
    recommendation: SpreadRecommendation;
    lost: number;
    gained: number;
    frequency: number;
  }> = [];
  let batch = 0;
  for (const candidate of candidates) {
    abortIfNeeded(signal);
    const allocation = parseChampionsSpread(candidate)!;
    const candidateSelf = { ...self, spread: candidate };
    const reasons: string[] = [];
    const tradeoffs: string[] = [];
    let frequency = 0;
    for (const target of targets) {
      abortIfNeeded(signal);
      const result = evaluateMatchup(
        candidateSelf,
        target.member,
        target.direction,
        target.move,
        target.conditions
      );
      const wasMet =
        target.direction === 'incoming'
          ? target.baseline.survivalChance === 1
          : target.baseline.koChance === 1;
      const isMet =
        result.kind === 'exact' &&
        (target.direction === 'incoming'
          ? result.survivalChance === 1
          : result.koChance === 1);
      if (isMet && !wasMet) {
        const effect = [target.conditions.weather, target.conditions.terrain]
          .filter(Boolean)
          .join(' · ');
        reasons.push(
          target.direction === 'incoming'
            ? 'Survives ' +
                target.pokemon +
                "'s " +
                target.move +
                (effect ? ' (' + effect + ')' : '')
            : 'OHKOs ' +
                target.pokemon +
                ' with ' +
                target.move +
                (effect ? ' (' + effect + ')' : '')
        );
        frequency = Math.max(frequency, target.frequency);
      } else if (wasMet && !isMet) {
        tradeoffs.push(
          target.direction === 'incoming'
            ? 'No longer survives ' + target.pokemon + "'s " + target.move
            : 'No longer OHKOs ' + target.pokemon + ' with ' + target.move
        );
      }
      batch++;
      if (batch % 32 === 0) await yieldToBrowser(signal);
    }
    const speed = speedFor(form.pokemon, allocation, nature);
    if (speed !== null) {
      for (const tier of tiers) {
        const key = 'speed:' + normalize(tier.pokemon);
        const wasMet = baselineSpeedTiers.has(key);
        const isMet = speed > tier.medianSpeed;
        if (isMet && !wasMet) {
          reasons.push(
            'Unmodified Speed: outspeeds median ' +
              tier.pokemon +
              ' (' +
              tier.medianSpeed +
              ')'
          );
        } else if (wasMet && !isMet) {
          tradeoffs.push(
            'No longer outspeeds median ' +
              tier.pokemon +
              ' (' +
              tier.medianSpeed +
              ')'
          );
        }
      }
    }
    if (reasons.length) {
      const deltas = spreadDeltas(initial, allocation);
      evaluated.push({
        recommendation: {
          value: candidate,
          nature,
          movedPoints: spreadMoved(deltas) / 2,
          deltas,
          speed: speed ?? 0,
          reasons,
          tradeoffs,
        },
        lost: tradeoffs.length,
        gained: reasons.length,
        frequency,
      });
    }
    batch++;
    if (batch % 32 === 0) await yieldToBrowser(signal);
  }
  abortIfNeeded(signal);
  evaluated.sort(
    (a, b) =>
      a.recommendation.movedPoints - b.recommendation.movedPoints ||
      a.lost - b.lost ||
      b.gained - a.gained ||
      b.frequency - a.frequency ||
      b.recommendation.speed - a.recommendation.speed ||
      a.recommendation.value.localeCompare(b.recommendation.value)
  );
  if (evaluated.length)
    return {
      suggestions: evaluated.slice(0, 6).map((entry) => entry.recommendation),
      message: null,
    };
  if (!targets.length && unavailableReason)
    return { suggestions: [], message: unavailableReason };
  if (!species.length && !tiers.length)
    return {
      suggestions: [],
      message: 'No current-regulation benchmark sets available.',
    };
  return {
    suggestions: [],
    message: 'No benchmark improvements found for this spread.',
  };
}
