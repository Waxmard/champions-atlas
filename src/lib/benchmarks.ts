import { calculate, Field, Move, Pokemon, toID } from '@smogon/calc';
import { Generations } from '@smogon/calc/dist/data/index.js';
import { normalize, type Member } from './catalog.ts';
import { battleSpecies, resolveBattleForm } from './battle-forms.ts';
import { statRow } from './stats.ts';
import {
  CHAMPIONS_STATS,
  NATURES,
  parseChampionsSpread,
  championsSpreadTotal,
  type ChampionsStat,
} from './paste.ts';
export { buildBenchmarkIndex } from './benchmark-index.ts';
export type {
  BenchmarkIndex,
  BenchmarkSpecies,
  BenchmarkVariant,
} from './benchmark-index.ts';

export type CombatantConditions = {
  form: string | null;
  hpPercent: number;
  boosts: Record<Exclude<ChampionsStat, 'HP'>, number>;
  status: '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
  abilityOn: boolean;
};
export type BenchmarkConditions = {
  self: CombatantConditions;
  opponent: CombatantConditions;
  weather: '' | 'Sun' | 'Rain' | 'Sand' | 'Snow';
  terrain: '' | 'Electric' | 'Grassy' | 'Psychic' | 'Misty';
  reflect: boolean;
  lightScreen: boolean;
  helpingHand: boolean;
  spreadDamage: boolean;
  criticalHit: boolean;
};
export type MatchupResult =
  | {
      kind: 'exact';
      minDamage: number;
      maxDamage: number;
      defenderHp: number;
      defenderMaxHp: number;
      koChance: number;
      survivalChance: number;
      damageRolls: number[];
      description: string;
    }
  | { kind: 'unavailable'; reason: string };

const blankCombatant = (): CombatantConditions => ({
  form: null,
  hpPercent: 100,
  boosts: { Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 },
  status: '',
  abilityOn: false,
});
export const DEFAULT_BENCHMARK_CONDITIONS: BenchmarkConditions = {
  self: blankCombatant(),
  opponent: blankCombatant(),
  weather: '',
  terrain: '',
  reflect: false,
  lightScreen: false,
  helpingHand: false,
  spreadDamage: true,
  criticalHit: false,
};

export function ownSetConditions(
  self: Member,
  opponent: Member
): BenchmarkConditions {
  const conditions = structuredClone(DEFAULT_BENCHMARK_CONDITIONS);
  const abilities = [self, opponent].map(
    (member) =>
      generation.abilities.get(toID(resolveBattleForm(member).ability ?? ''))
        ?.name ?? null
  );
  if (abilities[0] === 'Intimidate') conditions.self.abilityOn = true;
  if (abilities[1] === 'Intimidate') conditions.opponent.abilityOn = true;
  const weather: Record<string, BenchmarkConditions['weather']> = {
    Drought: 'Sun',
    Drizzle: 'Rain',
    'Sand Stream': 'Sand',
    'Snow Warning': 'Snow',
  };
  const terrain: Record<string, BenchmarkConditions['terrain']> = {
    'Electric Surge': 'Electric',
    'Grassy Surge': 'Grassy',
    'Psychic Surge': 'Psychic',
    'Misty Surge': 'Misty',
  };
  conditions.weather =
    weather[abilities[0] ?? ''] || weather[abilities[1] ?? ''] || '';
  conditions.terrain =
    terrain[abilities[0] ?? ''] || terrain[abilities[1] ?? ''] || '';
  return conditions;
}
const generation = Generations.get(0);
const statIds: Record<
  ChampionsStat,
  'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
> = { HP: 'hp', Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe' };
const battleStats = ['Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
const ohkoMoves = new Set(['fissure', 'guillotine', 'horndrill', 'sheercold']);
const unavailable = (reason: string): MatchupResult => ({
  kind: 'unavailable',
  reason,
});

function validCombatant(conditions: CombatantConditions): string | null {
  if (
    !Number.isFinite(conditions.hpPercent) ||
    conditions.hpPercent < 1 ||
    conditions.hpPercent > 100
  )
    return 'HP percentage must be between 1 and 100';
  if (
    !['', 'brn', 'par', 'psn', 'tox', 'slp', 'frz'].includes(conditions.status)
  )
    return 'Unsupported status';
  for (const stat of battleStats) {
    const stage = conditions.boosts[stat];
    if (!Number.isInteger(stage) || stage < -6 || stage > 6)
      return `Invalid ${stat} stage: ${stage}`;
  }
  return null;
}

function canonicalNature(name: string | null): string | null {
  return (
    NATURES.find(
      (nature) => nature.toLowerCase() === name?.trim().toLowerCase()
    ) ?? null
  );
}

function makePokemon(member: Member, conditions: CombatantConditions) {
  if (!member.spread) return { error: 'Stat Point spread is missing' } as const;
  const spread = parseChampionsSpread(member.spread);
  if (!spread) return { error: 'Stat Point spread is invalid' } as const;
  if (
    CHAMPIONS_STATS.some(
      (stat) =>
        !Number.isInteger(spread[stat]) || spread[stat] < 0 || spread[stat] > 32
    ) ||
    championsSpreadTotal(spread) > 66
  )
    return {
      error: 'Stat Point allocations must be 0–32 with a maximum total of 66',
    } as const;
  const natureName = canonicalNature(member.nature);
  if (!natureName) return { error: 'Nature is unknown' } as const;
  if (!member.item || member.item === '---')
    return { error: 'Held item is unknown' } as const;
  const form = resolveBattleForm(member, conditions.form ?? undefined);
  if (form.error) return { error: form.error } as const;
  if (!form.ability) return { error: 'Ability is unknown' } as const;
  const species = battleSpecies(form.pokemon);
  if (!species)
    return { error: `Unknown battle species: ${form.pokemon}` } as const;
  const item = generation.items.get(toID(member.item));
  if (!item) return { error: `Unknown item: ${member.item}` } as const;
  const ability = generation.abilities.get(toID(form.ability ?? ''));
  if (!ability) return { error: `Unknown ability: ${form.ability}` } as const;
  const nature = generation.natures.get(toID(natureName));
  if (!nature) return { error: `Unknown nature: ${member.nature}` } as const;
  const row = statRow(species.name);
  if (!row) return { error: `Stats unavailable for ${species.name}` } as const;
  const baseStats = {
    hp: row[0] === 1 ? 1 : row[0] - 75,
    atk: row[1] - 20,
    def: row[2] - 20,
    spa: row[3] - 20,
    spd: row[4] - 20,
    spe: row[5] - 20,
  };
  const boosts = Object.fromEntries(
    battleStats.map((stat) => [statIds[stat], conditions.boosts[stat]])
  );
  const evs = Object.fromEntries(
    CHAMPIONS_STATS.map((stat) => [statIds[stat], spread[stat]])
  );
  let pokemon: Pokemon;
  try {
    pokemon = new Pokemon(generation, species.name, {
      level: 50,
      evs,
      nature: nature.name,
      ability: ability.name,
      abilityOn: conditions.abilityOn,
      item: item.name,
      status: conditions.status,
      boosts,
      overrides: { baseStats },
    });
  } catch (error) {
    return {
      error: `Calculator could not construct ${species.name}: ${error instanceof Error ? error.message : String(error)}`,
    } as const;
  }
  const maxHp = pokemon.maxHP();
  if (row[0] === 1 && maxHp !== 1)
    return {
      error: 'Calculator does not support this 1-HP species correctly',
    } as const;
  pokemon.originalCurHP = Math.max(
    1,
    Math.floor((maxHp * conditions.hpPercent) / 100)
  );
  return { pokemon, maxHp, currentHp: pokemon.originalCurHP, ability } as const;
}

export function evaluateMatchup(
  self: Member,
  opponent: Member,
  direction: 'incoming' | 'outgoing',
  moveName: string,
  conditions: BenchmarkConditions
): MatchupResult {
  const invalidSelf = validCombatant(conditions.self);
  if (invalidSelf) return unavailable(`Self ${invalidSelf}`);
  const invalidOpponent = validCombatant(conditions.opponent);
  if (invalidOpponent) return unavailable(`Opponent ${invalidOpponent}`);
  const attacker = makePokemon(
    direction === 'outgoing' ? self : opponent,
    direction === 'outgoing' ? conditions.self : conditions.opponent
  );
  if ('error' in attacker) return unavailable(`Attacker ${attacker.error}`);
  const defender = makePokemon(
    direction === 'outgoing' ? opponent : self,
    direction === 'outgoing' ? conditions.opponent : conditions.self
  );
  if ('error' in defender) return unavailable(`Defender ${defender.error}`);
  const moveData = generation.moves.get(toID(moveName));
  if (!moveData) return unavailable(`Unknown move: ${moveName}`);
  if (moveData.category === 'Status')
    return unavailable(`${moveData.name} does not deal direct damage`);
  if (ohkoMoves.has(moveData.id))
    return unavailable(`${moveData.name} is an OHKO move`);
  if (moveData.multihit || moveData.multiaccuracy)
    return unavailable(`${moveData.name} is a multi-hit or multiaccuracy move`);
  if (attacker.pokemon.hasAbility('Parental Bond'))
    return unavailable('Parental Bond damage has multiple hits');
  if (['disguise', 'iceface'].includes(normalize(defender.ability.name)))
    return unavailable(`${defender.ability.name} protection is unsupported`);
  if (defender.pokemon.hasItem('Focus Band'))
    return unavailable('Focus Band survival is probabilistic and unsupported');
  try {
    const move = new Move(generation, moveData.name, {
      isCrit: conditions.criticalHit,
      ...((moveData.target === 'allAdjacentFoes' ||
        moveData.target === 'allAdjacent') &&
      !conditions.spreadDamage
        ? { overrides: { target: 'normal' } }
        : {}),
    });
    if (move.hits !== 1 || move.multiaccuracy)
      return unavailable(`${move.name} does not resolve as one hit`);
    const field = new Field({
      gameType: 'Doubles',
      weather: conditions.weather || undefined,
      terrain: conditions.terrain || undefined,
      attackerSide: { isHelpingHand: conditions.helpingHand },
      defenderSide: {
        isReflect: conditions.reflect,
        isLightScreen: conditions.lightScreen,
      },
    });
    const result = calculate(
      generation,
      attacker.pokemon,
      defender.pokemon,
      move,
      field
    );
    const raw = result.damage;
    const rolls =
      typeof raw === 'number'
        ? [raw]
        : Array.isArray(raw) && raw.every((value) => typeof value === 'number')
          ? raw
          : null;
    if (
      !rolls?.length ||
      rolls.some(
        (value) =>
          !Number.isFinite(value) || !Number.isInteger(value) || value < 0
      )
    )
      return unavailable(
        'Calculator returned unsupported or invalid damage output'
      );
    const sash =
      result.defender.hasItem('Focus Sash') &&
      defender.currentHp === defender.maxHp &&
      rolls.some((damage) => damage >= defender.currentHp);
    const sturdy =
      result.defender.ability === 'Sturdy' &&
      defender.currentHp === defender.maxHp &&
      rolls.some((damage) => damage >= defender.currentHp);
    const protectedFromKO = defender.currentHp > 1 && (sash || sturdy);
    const damageRolls = rolls.map((damage) =>
      protectedFromKO && damage >= defender.currentHp
        ? defender.currentHp - 1
        : damage
    );
    const koCount = damageRolls.filter(
      (damage) => damage >= defender.currentHp
    ).length;
    return {
      kind: 'exact',
      minDamage: Math.min(...damageRolls),
      maxDamage: Math.max(...damageRolls),
      defenderHp: defender.currentHp,
      defenderMaxHp: defender.maxHp,
      damageRolls,
      koChance: koCount / damageRolls.length,
      survivalChance: 1 - koCount / damageRolls.length,
      description: `${result.attacker.name} ${move.name} vs. ${result.defender.name}: ${result.moveDesc()}`,
    };
  } catch (error) {
    return unavailable(
      `Calculator could not evaluate ${moveName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
