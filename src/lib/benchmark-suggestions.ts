import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { normalize, type Member } from './catalog.ts';
import { resolveBattleForm } from './battle-forms.ts';
import { evaluateMatchup, type BenchmarkConditions } from './benchmarks.ts';
import {
  CHAMPIONS_STATS,
  NATURES,
  championsSpreadTotal,
  formatChampionsSpread,
  isCompleteSpread,
  natureEffect,
  parseChampionsSpread,
  spreadDeltas,
  type ChampionsSpread,
  type ChampionsStat,
  type SpreadDelta,
} from './paste.ts';
import { speedFor, statsFor } from './stats.ts';

export type BenchmarkGoal = 'survive' | 'ko' | 'outspeed';

export type BenchmarkQuestion = {
  goal: BenchmarkGoal;
  opponent: Member;
  move: string | null;
  conditions: BenchmarkConditions;
};

export type BenchmarkSolution = {
  spread: string;
  nature: string;
  movedPoints: number;
  deltas: SpreadDelta[];
  stats: Record<ChampionsStat, number>;
  speed: number;
  outcome: string;
};

export type BenchmarkGroup = {
  nature: string;
  solutions: BenchmarkSolution[];
  others: number;
  message: string | null;
};

export type BenchmarkResult =
  | { kind: 'error'; message: string }
  | {
      kind: 'answer';
      certain: boolean;
      summary: string;
      current: BenchmarkGroup;
      changed: BenchmarkGroup | null;
      best: BenchmarkSolution | null;
    };

export const BENCHMARK_SOLUTION_LIMIT = 6;

type Pinned = Partial<Record<ChampionsStat, number>>;

type Attempt = {
  solution: BenchmarkSolution;
  chance: number;
  margin: number;
};

type GroupSearch = {
  solutions: BenchmarkSolution[];
  others: number;
  message: string | null;
  best: Attempt | null;
};

type SearchContext = {
  self: Member;
  question: BenchmarkQuestion;
  initial: ChampionsSpread;
  pokemon: string;
  move: string | null;
  goalStat: ChampionsStat;
  target: number;
  scarf: boolean;
  conditions: BenchmarkConditions;
  signal?: AbortSignal;
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

function usedOffenceStat(member: Member): ChampionsStat | null {
  const categories = member.moves
    .map((move) => generation.moves.get(normalize(move) as ID)?.category)
    .filter((category) => category && category !== 'Status');
  if (!categories.length) return null;
  if (categories.every((category) => category === 'Physical')) return 'Atk';
  if (categories.every((category) => category === 'Special')) return 'SpA';
  return null;
}

const effectiveSpeed = (
  pokemon: string,
  spread: ChampionsSpread | null,
  nature: string | null,
  item: string | null
) =>
  Math.floor(
    (speedFor(pokemon, spread, nature) ?? 0) *
      (normalize(item ?? '') === 'choicescarf' ? 1.5 : 1)
  );

/* Closed form: movement onto the pinned stats plus the shortfall the free
   stats must absorb, halved because every moved point leaves one stat and
   enters another. */
function minCost(initial: ChampionsSpread, fixed: Pinned): number | null {
  const pinned = CHAMPIONS_STATS.filter((stat) => fixed[stat] !== undefined);
  const donors = CHAMPIONS_STATS.filter((stat) => fixed[stat] === undefined);
  const available = 66 - pinned.reduce((sum, stat) => sum + fixed[stat]!, 0);
  if (available < 0 || available > donors.length * 32) return null;
  const target = donors.reduce((sum, stat) => sum + initial[stat], 0);
  const balance = target - available;
  const room = donors.reduce(
    (sum, stat) => sum + (balance > 0 ? initial[stat] : 32 - initial[stat]),
    0
  );
  if (Math.abs(balance) > room) return null;
  const movement = pinned.reduce(
    (sum, stat) => sum + Math.abs(fixed[stat]! - initial[stat]),
    0
  );
  return (movement + Math.abs(balance)) / 2;
}

/* Every spread that reaches `fixed` at exactly the minimum cost: the free
   stats only give up the shortfall, or only take it, never both. */
function equalCostSpreads(initial: ChampionsSpread, fixed: Pinned): string[] {
  const donors = CHAMPIONS_STATS.filter((stat) => fixed[stat] === undefined);
  const candidate = { ...initial };
  for (const stat of CHAMPIONS_STATS)
    if (fixed[stat] !== undefined) candidate[stat] = fixed[stat]!;
  const available =
    66 - CHAMPIONS_STATS.reduce((sum, stat) => sum + candidate[stat], 0);
  const balance = -available;
  const values: string[] = [];
  const walk = (index: number, remaining: number) => {
    if (index === donors.length) {
      if (!remaining) values.push(formatChampionsSpread(candidate));
      return;
    }
    const stat = donors[index];
    const limit = Math.min(
      balance > 0 ? initial[stat] : 32 - initial[stat],
      remaining
    );
    for (let amount = 0; amount <= limit; amount++) {
      candidate[stat] = initial[stat] + (balance > 0 ? -amount : amount);
      walk(index + 1, remaining - amount);
    }
    candidate[stat] = initial[stat];
  };
  walk(0, Math.abs(balance));
  return values;
}

/* Damage depends only on the pinned stats, so one legal member of the family
   stands in for all of them. */
function representativeSpread(
  initial: ChampionsSpread,
  fixed: Pinned
): ChampionsSpread {
  const candidate = { ...initial };
  for (const stat of CHAMPIONS_STATS)
    if (fixed[stat] !== undefined) candidate[stat] = fixed[stat]!;
  let balance = championsSpreadTotal(candidate) - 66;
  for (const stat of CHAMPIONS_STATS) {
    if (fixed[stat] !== undefined || !balance) continue;
    const change =
      balance > 0
        ? Math.min(balance, candidate[stat])
        : -Math.min(-balance, 32 - candidate[stat]);
    candidate[stat] -= change;
    balance -= change;
  }
  return candidate;
}

function compareSolutions(
  a: BenchmarkSolution,
  b: BenchmarkSolution,
  defence: ChampionsStat | null
): number {
  return (
    a.movedPoints - b.movedPoints ||
    a.deltas.length - b.deltas.length ||
    b.stats.Spe - a.stats.Spe ||
    b.stats.HP - a.stats.HP ||
    (defence ? b.stats[defence] - a.stats[defence] : 0) ||
    a.spread.localeCompare(b.spread)
  );
}

function compareAttempts(goal: BenchmarkGoal, a: Attempt, b: Attempt): number {
  const score = (attempt: Attempt) =>
    goal === 'outspeed'
      ? [attempt.solution.speed, -attempt.solution.movedPoints]
      : [
          attempt.chance,
          goal === 'survive' ? -attempt.margin : attempt.margin,
          -attempt.solution.movedPoints,
        ];
  const left = score(a);
  const right = score(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

const speedOutcome = (context: SearchContext, speed: number, met: boolean) =>
  `Speed ${speed} ${met ? 'outspeeds' : 'does not outspeed'} ${context.target}${
    context.scarf ? ' (Choice Scarf ×1.5)' : ''
  }`;

function solutionFor(
  context: SearchContext,
  formatted: string,
  nature: string,
  movedPoints: number,
  outcome: string
): BenchmarkSolution | null {
  const spread = parseChampionsSpread(formatted);
  const stats = spread && statsFor(context.pokemon, spread, nature);
  if (!spread || !stats) return null;
  return {
    spread: formatted,
    nature,
    movedPoints,
    deltas: spreadDeltas(context.initial, spread),
    stats,
    speed: effectiveSpeed(context.pokemon, spread, nature, context.self.item),
    outcome,
  };
}

async function searchSpeed(
  context: SearchContext,
  nature: string
): Promise<GroupSearch> {
  const { self, initial, pokemon, goalStat, signal } = context;
  abortIfNeeded(signal);
  const current = effectiveSpeed(pokemon, initial, nature, self.item);
  if (current > context.target) {
    const solution = solutionFor(
      context,
      formatChampionsSpread(initial),
      nature,
      0,
      speedOutcome(context, current, true)
    );
    return {
      solutions: solution ? [solution] : [],
      others: 0,
      message: null,
      best: null,
    };
  }
  let minimal = -1;
  for (let value = 0; value <= 32 && minimal < 0; value++) {
    if (
      effectiveSpeed(pokemon, { ...initial, Spe: value }, nature, self.item) >
      context.target
    )
      minimal = value;
  }
  if (minimal < 0) {
    const fixed: Pinned = { [goalStat]: 32 };
    const ceiling = effectiveSpeed(
      pokemon,
      { ...initial, Spe: 32 },
      nature,
      self.item
    );
    const solution = solutionFor(
      context,
      formatChampionsSpread(representativeSpread(initial, fixed)),
      nature,
      minCost(initial, fixed) ?? 0,
      speedOutcome(context, ceiling, false)
    );
    return {
      solutions: [],
      others: 0,
      message: `Maximum Speed is ${ceiling} with ${nature}.`,
      best: solution ? { solution, chance: 0, margin: 0 } : null,
    };
  }
  const fixed: Pinned = { Spe: minimal };
  const movedPoints = minCost(initial, fixed) ?? 0;
  const outcome = speedOutcome(
    context,
    effectiveSpeed(pokemon, { ...initial, Spe: minimal }, nature, self.item),
    true
  );
  const candidates: BenchmarkSolution[] = [];
  for (const formatted of equalCostSpreads(initial, fixed)) {
    const solution = solutionFor(
      context,
      formatted,
      nature,
      movedPoints,
      outcome
    );
    if (solution) candidates.push(solution);
  }
  candidates.sort((a, b) => compareSolutions(a, b, null));
  const solutions = candidates.slice(0, BENCHMARK_SOLUTION_LIMIT);
  return {
    solutions,
    others: candidates.length - solutions.length,
    message: null,
    best: null,
  };
}

async function searchDamage(
  context: SearchContext,
  nature: string
): Promise<GroupSearch> {
  const { self, question, initial, goalStat, conditions, signal } = context;
  const survive = question.goal === 'survive';
  const direction = survive ? 'incoming' : 'outgoing';
  const candidates: BenchmarkSolution[] = [];
  const seen = new Set<string>();
  const winners: Array<{
    fixed: Pinned;
    movedPoints: number;
    reached: string;
  }> = [];
  let minimalWinning = Infinity;
  const hpOptions = survive
    ? Array.from({ length: 33 }, (_, hp) => hp)
    : [null];
  let best: Attempt | null = null;
  let allocations = 0;
  for (const hp of hpOptions) {
    for (let value = 0; value <= 32; value++) {
      abortIfNeeded(signal);
      if (allocations++ % 32 === 0) await yieldToBrowser(signal);
      const fixed: Pinned = { [goalStat]: value };
      if (hp !== null) fixed.HP = hp;
      const movedPoints = minCost(initial, fixed);
      if (movedPoints === null) continue;
      const formatted = formatChampionsSpread(
        representativeSpread(initial, fixed)
      );
      const result = evaluateMatchup(
        { ...self, nature, spread: formatted },
        question.opponent,
        direction,
        context.move!,
        conditions
      );
      if (result.kind !== 'exact') continue;
      const rolls = result.damageRolls.length;
      const surviving = result.damageRolls.filter(
        (damage) => damage < result.defenderHp
      ).length;
      const chance = survive ? result.survivalChance : result.koChance;
      if (chance === 1) {
        const reached = survive
          ? `survives ${rolls}/${rolls} rolls (max ${result.maxDamage} of ${result.defenderHp} HP)`
          : `OHKOs on the minimum roll (min ${result.minDamage} of ${result.defenderHp} HP)`;
        if (movedPoints < minimalWinning) {
          minimalWinning = movedPoints;
          winners.length = 0;
        }
        if (movedPoints === minimalWinning)
          winners.push({ fixed, movedPoints, reached });
        continue;
      }
      const outcome = survive
        ? `survives ${surviving}/${rolls} rolls (max ${result.maxDamage} of ${result.defenderHp} HP)`
        : `OHKOs on ${rolls - surviving}/${rolls} rolls (min ${result.minDamage} of ${result.defenderHp} HP)`;
      const solution = solutionFor(
        context,
        formatted,
        nature,
        movedPoints,
        outcome
      );
      if (!solution) continue;
      const attempt = {
        solution,
        chance,
        margin: survive ? result.maxDamage : result.minDamage,
      };
      if (!best || compareAttempts(question.goal, attempt, best) > 0)
        best = attempt;
    }
  }
  for (const winner of winners) {
    abortIfNeeded(signal);
    for (const spread of equalCostSpreads(initial, winner.fixed)) {
      if (seen.has(spread)) continue;
      seen.add(spread);
      const solution = solutionFor(
        context,
        spread,
        nature,
        winner.movedPoints,
        winner.reached
      );
      if (solution) candidates.push(solution);
    }
  }
  if (!candidates.length)
    return {
      solutions: [],
      others: 0,
      message: `No 66-point spread reaches this with ${nature}.`,
      best,
    };
  candidates.sort((a, b) => compareSolutions(a, b, survive ? goalStat : null));
  const minimum = candidates[0].movedPoints;
  const equal = candidates.filter((entry) => entry.movedPoints === minimum);
  const solutions = equal.slice(0, BENCHMARK_SOLUTION_LIMIT);
  return {
    solutions,
    others: equal.length - solutions.length,
    message: null,
    best,
  };
}

function changedNature(
  initial: ChampionsSpread,
  member: Member,
  goalStat: ChampionsStat
): string | null {
  const offence = usedOffenceStat(member);
  const spare = offence === 'Atk' ? 'SpA' : offence === 'SpA' ? 'Atk' : null;
  const rank = (stat: ChampionsStat) => [
    initial[stat],
    stat === spare ? 0 : 1,
    stat === 'Spe' ? 1 : 0,
    CHAMPIONS_STATS.indexOf(stat),
  ];
  const options: Array<{ nature: string; order: number[] }> = [];
  for (const candidate of NATURES) {
    const effect = natureEffect(candidate);
    if (effect?.raised !== goalStat) continue;
    options.push({ nature: candidate, order: rank(effect.lowered) });
  }
  options.sort((a, b) => {
    for (let index = 0; index < a.order.length; index++)
      if (a.order[index] !== b.order[index])
        return a.order[index] - b.order[index];
    return 0;
  });
  return options[0]?.nature ?? null;
}

export async function solveBenchmark(
  self: Member,
  question: BenchmarkQuestion,
  signal?: AbortSignal
): Promise<BenchmarkResult> {
  abortIfNeeded(signal);
  const initial = parseChampionsSpread(self.spread);
  if (!isCompleteSpread(initial))
    return {
      kind: 'error',
      message: 'Complete a valid 66-point spread to see suggestions.',
    };
  const nature = NATURES.find(
    (name) => normalize(name) === normalize(self.nature ?? '')
  );
  if (!nature)
    return { kind: 'error', message: 'Choose a nature to see suggestions.' };
  if (!self.item || self.item === '---')
    return { kind: 'error', message: 'Choose an item to see suggestions.' };
  const form = resolveBattleForm(
    self,
    question.conditions.self.form ?? undefined
  );
  if (form.error) return { kind: 'error', message: form.error };
  if (!statsFor(form.pokemon, initial, nature))
    return {
      kind: 'error',
      message: 'Stat data is unavailable for this form.',
    };
  const move = question.move?.trim() || null;
  const damageGoal = question.goal !== 'outspeed';
  if (damageGoal && !move)
    return { kind: 'error', message: 'Choose a move to see suggestions.' };
  const goalStat = damageGoal
    ? moveStat(move!, question.goal === 'survive' ? 'incoming' : 'outgoing')
    : 'Spe';
  if (!goalStat)
    return { kind: 'error', message: `${move} does not deal direct damage` };

  const opponentForm = resolveBattleForm(
    question.opponent,
    question.conditions.opponent.form ?? undefined
  );
  if (opponentForm.error) return { kind: 'error', message: opponentForm.error };
  const context: SearchContext = {
    self,
    question,
    initial,
    pokemon: form.pokemon,
    move,
    goalStat,
    target: effectiveSpeed(
      opponentForm.pokemon,
      parseChampionsSpread(question.opponent.spread),
      question.opponent.nature,
      question.opponent.item
    ),
    scarf:
      normalize(self.item) === 'choicescarf' ||
      normalize(question.opponent.item ?? '') === 'choicescarf',
    conditions: question.conditions,
    signal,
  };
  const emptyGroup: BenchmarkGroup = {
    nature,
    solutions: [],
    others: 0,
    message: null,
  };

  if (question.goal === 'outspeed') {
    const speed = effectiveSpeed(form.pokemon, initial, nature, self.item);
    if (speed > context.target)
      return {
        kind: 'answer',
        certain: true,
        summary: `Already ${speedOutcome(context, speed, true)}`,
        current: emptyGroup,
        changed: null,
        best: null,
      };
  } else {
    const baseline = evaluateMatchup(
      self,
      question.opponent,
      question.goal === 'survive' ? 'incoming' : 'outgoing',
      move!,
      question.conditions
    );
    if (baseline.kind !== 'exact')
      return { kind: 'error', message: baseline.reason };
    const chance =
      question.goal === 'survive' ? baseline.survivalChance : baseline.koChance;
    if (chance === 1)
      return {
        kind: 'answer',
        certain: true,
        summary:
          'Already ' +
          (question.goal === 'survive'
            ? `survives ${baseline.damageRolls.length}/${baseline.damageRolls.length} rolls (max ${baseline.maxDamage} of ${baseline.defenderHp} HP)`
            : `OHKOs on the minimum roll (min ${baseline.minDamage} of ${baseline.defenderHp} HP)`),
        current: emptyGroup,
        changed: null,
        best: null,
      };
    if (baseline.maxDamage === 0)
      return {
        kind: 'error',
        message: `${move} deals no damage to ${question.opponent.pokemon}.`,
      };
  }

  const candidates: string[] = [nature];
  const other = changedNature(initial, self, goalStat);
  if (other && other !== nature) candidates.push(other);
  const searches: Array<{ nature: string; groups: GroupSearch }> = [];
  for (const candidate of candidates)
    searches.push({
      nature: candidate,
      groups: damageGoal
        ? await searchDamage(context, candidate)
        : await searchSpeed(context, candidate),
    });
  const withNature = (entry: {
    nature: string;
    groups: GroupSearch;
  }): BenchmarkGroup => ({ nature: entry.nature, ...entry.groups });
  const current = withNature(searches[0]);
  const changed = searches[1] ? withNature(searches[1]) : null;
  const reached = current.solutions.length
    ? current
    : changed?.solutions.length
      ? changed
      : null;
  const attempts = [
    searches[0].groups.best,
    searches[1]?.groups.best ?? null,
  ].filter((attempt): attempt is Attempt => attempt !== null);
  attempts.sort((a, b) => compareAttempts(question.goal, b, a));
  const best = reached ? null : (attempts[0]?.solution ?? null);
  let summary: string;
  if (!reached)
    summary = `No 66-point spread reaches this; the closest is ${best?.spread} with ${best?.nature}, which ${best?.outcome}.`;
  else if (reached === current)
    summary = `Your ${nature} spread can reach this by moving ${reached.solutions[0].movedPoints} points.`;
  else
    summary = `This needs a different nature: ${reached.nature}, moving ${reached.solutions[0].movedPoints} points.`;
  return {
    kind: 'answer',
    certain: !!reached,
    summary,
    current,
    changed,
    best,
  };
}
