import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BENCHMARK_CONDITIONS,
  evaluateMatchup,
} from '../src/lib/benchmarks.ts';
import { buildBenchmarkIndex } from '../src/lib/benchmark-index.ts';
import { resolveBattleForm } from '../src/lib/battle-forms.ts';
import { suggestBenchmarkSpreads } from '../src/lib/benchmark-suggestions.ts';
import {
  CHAMPIONS_STATS,
  championsSpreadTotal,
  parseChampionsSpread,
} from '../src/lib/paste.ts';

const conditions = () => structuredClone(DEFAULT_BENCHMARK_CONDITIONS);
const raichu = {
  pokemon: 'Raichu',
  item: 'Raichunite Y',
  ability: 'Lightning Rod',
  nature: 'Timid',
  spread: '18 HP / 25 Def / 23 Spe',
  moves: ['Thunderbolt'],
};
const sneasler = {
  pokemon: 'Sneasler',
  item: 'White Herb',
  ability: 'Unburden',
  nature: 'Adamant',
  spread: '2 HP / 32 Atk / 32 Spe',
  moves: ['Close Combat'],
};

const team = (id, regulation, members) => ({ id, regulation, members });

test('published Champions roll fixture uses evolved form and one landed attack', () => {
  const original = JSON.stringify([raichu, sneasler]);
  const scenario = conditions();
  const before = JSON.stringify(scenario);
  const result = evaluateMatchup(
    raichu,
    sneasler,
    'incoming',
    'Close Combat',
    scenario
  );
  assert.equal(result.kind, 'exact', result.reason);
  assert.deepEqual(
    result.damageRolls,
    [
      135, 138, 139, 141, 142, 144, 145, 147, 148, 150, 151, 153, 154, 156, 157,
      160,
    ]
  );
  assert.equal(result.koChance, 0.3125);
  assert.equal(result.survivalChance, 0.6875);
  assert.equal(resolveBattleForm(raichu).ability, 'No Guard');
  evaluateMatchup(sneasler, raichu, 'outgoing', 'Close Combat', scenario);
  assert.equal(JSON.stringify([raichu, sneasler]), original);
  assert.equal(JSON.stringify(scenario), before);
});

test('six-point defensive transfer survives all rolls; invalid matches stay unavailable', () => {
  const safer = { ...raichu, spread: '18 HP / 31 Def / 17 Spe' };
  const result = evaluateMatchup(
    safer,
    sneasler,
    'incoming',
    'Close Combat',
    conditions()
  );
  assert.equal(result.kind, 'exact', result.reason);
  assert.deepEqual(
    [result.minDamage, result.maxDamage, result.survivalChance],
    [127, 151, 1]
  );
  assert.equal(
    evaluateMatchup(
      { ...raichu, spread: null },
      sneasler,
      'incoming',
      'Close Combat',
      conditions()
    ).kind,
    'unavailable'
  );
  assert.equal(
    evaluateMatchup(raichu, sneasler, 'incoming', 'Fissure', conditions()).kind,
    'unavailable'
  );
  assert.equal(
    evaluateMatchup(raichu, sneasler, 'incoming', 'Protect', conditions()).kind,
    'unavailable'
  );
  const unrelated = conditions();
  unrelated.self.form = 'Palafin-Hero';
  assert.equal(
    evaluateMatchup(raichu, sneasler, 'incoming', 'Close Combat', unrelated)
      .kind,
    'unavailable'
  );
});

test('unsupported multi-hit and intact Disguise never claim a one-roll probability', () => {
  assert.match(
    evaluateMatchup(raichu, sneasler, 'incoming', 'Bullet Seed', conditions())
      .reason,
    /multi-hit/i
  );
  const disguised = {
    ...raichu,
    pokemon: 'Mimikyu',
    item: 'Leftovers',
    ability: 'Disguise',
  };
  assert.match(
    evaluateMatchup(
      disguised,
      sneasler,
      'incoming',
      'Close Combat',
      conditions()
    ).reason,
    /Disguise/
  );
  assert.equal(
    evaluateMatchup(
      { ...raichu, item: 'Not an item' },
      sneasler,
      'incoming',
      'Close Combat',
      conditions()
    ).kind,
    'unavailable'
  );
});

test('current regulation index counts each actual team and variant only once', () => {
  const incomplete = { ...sneasler, spread: null };
  const index = buildBenchmarkIndex(
    [
      team('current-a', 'M-C', [sneasler, { ...sneasler }, incomplete]),
      team('current-b', 'M-C', [
        { ...sneasler, spread: '32 HP / 32 Atk / 2 Spe' },
      ]),
      team('historical', 'M-B', [raichu]),
    ],
    'M-C'
  );
  assert.equal(index.teamCount, 2);
  assert.equal(index.species.length, 1);
  assert.equal(index.species[0].teamCount, 2);
  assert.equal(index.species[0].eligibleTeamCount, 2);
  assert.deepEqual(
    index.species[0].variants.map((variant) => variant.teamIds),
    [['current-a'], ['current-b']]
  );
  const megas = buildBenchmarkIndex(
    [
      team('base-stone', 'M-C', [raichu]),
      team('explicit-mega', 'M-C', [{ ...raichu, pokemon: 'Raichu-Mega-Y' }]),
    ],
    'M-C'
  );
  assert.equal(megas.species[0].pokemon, 'Raichu-Mega-Y');
  assert.deepEqual(megas.species[0].variants[0].teamIds, [
    'base-stone',
    'explicit-mega',
  ]);
});

test('full-HP Focus Sash and effective Sturdy prevent a one-hit KO', () => {
  const target = {
    ...raichu,
    pokemon: 'Raichu',
    item: 'Focus Sash',
    ability: 'Sturdy',
  };
  const attacker = { ...sneasler, ability: 'Mold Breaker' };
  const full = evaluateMatchup(
    target,
    sneasler,
    'incoming',
    'Close Combat',
    conditions()
  );
  assert.equal(full.kind, 'exact');
  assert.equal(full.koChance, 0);
  const injured = conditions();
  injured.self.hpPercent = 99;
  assert.ok(
    evaluateMatchup(target, sneasler, 'incoming', 'Close Combat', injured)
      .koChance > 0
  );
  const sturdy = { ...target, item: 'Leftovers' };
  assert.equal(
    evaluateMatchup(sturdy, sneasler, 'incoming', 'Close Combat', conditions())
      .koChance,
    0
  );
  assert.ok(
    evaluateMatchup(sturdy, attacker, 'incoming', 'Close Combat', conditions())
      .koChance > 0
  );
  assert.equal(
    evaluateMatchup(target, attacker, 'incoming', 'Close Combat', conditions())
      .koChance,
    0
  );
  assert.equal(
    evaluateMatchup(
      { ...target, item: 'Focus Band' },
      sneasler,
      'incoming',
      'Close Combat',
      conditions()
    ).kind,
    'unavailable'
  );
});

test('canonical item and ability names preserve protection across source casing', () => {
  const target = {
    ...raichu,
    pokemon: 'Raichu',
    item: 'fOcUs SaSh',
    ability: 'sturdy',
  };
  const attacker = { ...sneasler, item: 'white herb', ability: 'UNBURDEN' };
  const scenario = conditions();
  scenario.self.status = 'psn';
  const mixed = evaluateMatchup(
    target,
    attacker,
    'incoming',
    'close combat',
    scenario
  );
  const canonical = evaluateMatchup(
    { ...target, item: 'Focus Sash', ability: 'Sturdy' },
    sneasler,
    'incoming',
    'Close Combat',
    scenario
  );
  assert.equal(mixed.kind, 'exact');
  assert.deepEqual(mixed.damageRolls, canonical.damageRolls);
  assert.equal(mixed.koChance, 0);
});

test('setup stages change damage without changing sets', () => {
  const ceruledge = {
    pokemon: 'Ceruledge',
    item: 'Colbur Berry',
    ability: 'Flash Fire',
    nature: 'Adamant',
    spread: '32 HP / 5 Atk / 22 Def / 7 Spe',
    moves: ['Bitter Blade'],
  };
  const rillaboom = {
    pokemon: 'Rillaboom',
    item: 'Leftovers',
    ability: 'Grassy Surge',
    nature: 'Adamant',
    spread: '32 HP / 32 Def / 2 SpD',
    moves: ['Wood Hammer'],
  };
  const before = JSON.stringify([ceruledge, rillaboom]);
  const clear = conditions();
  const setup = conditions();
  setup.self.boosts.Atk = 1;
  setup.self.boosts.Def = 1;
  assert.deepEqual(
    [
      evaluateMatchup(ceruledge, rillaboom, 'outgoing', 'Bitter Blade', clear)
        .minDamage,
      evaluateMatchup(ceruledge, rillaboom, 'outgoing', 'Bitter Blade', clear)
        .maxDamage,
    ],
    [120, 144]
  );
  assert.deepEqual(
    [
      evaluateMatchup(ceruledge, rillaboom, 'outgoing', 'Bitter Blade', setup)
        .minDamage,
      evaluateMatchup(ceruledge, rillaboom, 'outgoing', 'Bitter Blade', setup)
        .maxDamage,
    ],
    [176, 210]
  );
  assert.deepEqual(
    [
      evaluateMatchup(ceruledge, rillaboom, 'incoming', 'Wood Hammer', clear)
        .minDamage,
      evaluateMatchup(ceruledge, rillaboom, 'incoming', 'Wood Hammer', clear)
        .maxDamage,
    ],
    [44, 52]
  );
  assert.deepEqual(
    [
      evaluateMatchup(ceruledge, rillaboom, 'incoming', 'Wood Hammer', setup)
        .minDamage,
      evaluateMatchup(ceruledge, rillaboom, 'incoming', 'Wood Hammer', setup)
        .maxDamage,
    ],
    [29, 35]
  );
  assert.equal(JSON.stringify([ceruledge, rillaboom]), before);
});

test('targeted survival reallocates six points and honors every lock', () => {
  const options = {
    goal: 'survive',
    probability: 1,
    optimizeStats: ['HP', 'Def'],
    lockedStats: [],
  };
  const results = suggestBenchmarkSpreads(
    raichu,
    sneasler,
    'incoming',
    'Close Combat',
    conditions(),
    options
  );
  assert.equal(results[0].spread, '18 HP / 31 Def / 17 Spe');
  assert.equal(results[0].movedPoints, 6);
  assert.equal(results[0].matchup.survivalChance, 1);
  for (const suggestion of results) {
    const allocation = parseChampionsSpread(suggestion.spread);
    assert.equal(championsSpreadTotal(allocation), 66);
    assert.ok(
      CHAMPIONS_STATS.every(
        (stat) =>
          Number.isInteger(allocation[stat]) &&
          allocation[stat] >= 0 &&
          allocation[stat] <= 32
      )
    );
    assert.equal(suggestion.nature, 'Timid');
  }
  assert.deepEqual(
    suggestBenchmarkSpreads(
      raichu,
      sneasler,
      'incoming',
      'Close Combat',
      conditions(),
      { ...options, lockedStats: ['Spe'] }
    ),
    []
  );
  assert.deepEqual(
    suggestBenchmarkSpreads(
      { ...raichu, spread: results[0].spread },
      sneasler,
      'incoming',
      'Close Combat',
      conditions(),
      options
    ),
    []
  );
});
