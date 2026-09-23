import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BENCHMARK_CONDITIONS,
  evaluateMatchup,
  ownSetConditions,
} from '../src/lib/benchmarks.ts';
import { buildBenchmarkIndex } from '../src/lib/benchmark-index.ts';
import { resolveBattleForm } from '../src/lib/battle-forms.ts';
import {
  recommendSpreads,
  suggestBenchmarkSpreads,
} from '../src/lib/benchmark-suggestions.ts';
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

test('targeted survival reallocates six points and honors every lock', async () => {
  const options = {
    goal: 'survive',
    probability: 1,
    optimizeStats: ['HP', 'Def'],
    lockedStats: [],
  };
  const results = await suggestBenchmarkSpreads(
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
    await suggestBenchmarkSpreads(
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
    await suggestBenchmarkSpreads(
      { ...raichu, spread: results[0].spread },
      sneasler,
      'incoming',
      'Close Combat',
      conditions(),
      options
    ),
    []
  );
  const controller = new AbortController();
  const pending = suggestBenchmarkSpreads(
    raichu,
    sneasler,
    'incoming',
    'Close Combat',
    conditions(),
    options,
    controller.signal
  );
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('own-set Mega snow uses the resolved ability without editing the saved set', () => {
  const froslass = {
    pokemon: 'Froslass',
    item: 'Froslassite',
    ability: 'Cursed Body',
    nature: 'Timid',
    spread: '2 HP / 32 SpA / 32 Spe',
    moves: ['Ice Beam'],
  };
  const before = JSON.stringify([froslass, sneasler]);
  const own = ownSetConditions(froslass, sneasler);
  assert.equal(own.weather, 'Snow');
  const incoming = evaluateMatchup(
    froslass,
    sneasler,
    'incoming',
    'Dire Claw',
    own
  );
  assert.equal(incoming.kind, 'exact', incoming.reason);
  assert.deepEqual(
    incoming.damageRolls,
    [33, 34, 34, 35, 36, 36, 36, 36, 37, 37, 38, 38, 39, 39, 39, 40]
  );
  const explicit = conditions();
  explicit.weather = 'Snow';
  assert.deepEqual(
    incoming.damageRolls,
    evaluateMatchup(froslass, sneasler, 'incoming', 'Dire Claw', explicit)
      .damageRolls
  );
  assert.deepEqual(
    incoming.damageRolls,
    evaluateMatchup(
      { ...froslass, pokemon: 'Froslass-Mega', ability: null },
      sneasler,
      'incoming',
      'Dire Claw',
      own
    ).damageRolls
  );
  assert.ok(
    evaluateMatchup(froslass, sneasler, 'incoming', 'Dire Claw', conditions())
      .minDamage > incoming.maxDamage
  );
  assert.deepEqual(
    evaluateMatchup(froslass, sneasler, 'outgoing', 'Ice Beam', own)
      .damageRolls,
    evaluateMatchup(froslass, sneasler, 'outgoing', 'Ice Beam', conditions())
      .damageRolls
  );
  assert.equal(
    buildBenchmarkIndex(
      [team('mega', 'M-C', [{ ...froslass, ability: null }])],
      'M-C'
    ).species[0].eligibleTeamCount,
    1
  );
  assert.equal(JSON.stringify([froslass, sneasler]), before);
  assert.notEqual(own.self.boosts, DEFAULT_BENCHMARK_CONDITIONS.self.boosts);
});

test('automatic fields prefer self setters, respect suppression and do not invent effects', () => {
  const froslass = {
    ...raichu,
    pokemon: 'Froslass',
    item: 'Froslassite',
    ability: null,
    spread: '2 HP / 32 SpA / 32 Spe',
    moves: ['Ice Beam'],
  };
  const drought = { ...sneasler, ability: 'Drought', moves: ['Dire Claw'] };
  assert.equal(
    ownSetConditions(
      { ...sneasler, item: 'Leftovers', ability: 'Grassy Surge' },
      { ...sneasler, ability: 'Electric Surge' }
    ).terrain,
    'Grassy'
  );
  assert.equal(ownSetConditions(sneasler, sneasler).terrain, '');
  assert.equal(ownSetConditions(froslass, drought).weather, 'Snow');
  const snow = ownSetConditions(froslass, sneasler);
  const cloud = { ...sneasler, ability: 'Cloud Nine' };
  assert.deepEqual(
    evaluateMatchup(froslass, cloud, 'incoming', 'Dire Claw', snow).damageRolls,
    evaluateMatchup(froslass, cloud, 'incoming', 'Dire Claw', conditions())
      .damageRolls
  );
  assert.equal(
    ownSetConditions(raichu, { ...sneasler, item: 'Icy Rock' }).weather,
    ''
  );
  const orb = { ...sneasler, item: 'Life Orb' };
  assert.ok(
    evaluateMatchup(froslass, orb, 'incoming', 'Dire Claw', snow).maxDamage >
      evaluateMatchup(froslass, sneasler, 'incoming', 'Dire Claw', snow)
        .maxDamage
  );
  assert.equal(
    evaluateMatchup(
      { ...sneasler, ability: null },
      raichu,
      'outgoing',
      'Close Combat',
      conditions()
    ).kind,
    'unavailable'
  );
  assert.equal(
    evaluateMatchup(
      sneasler,
      { ...raichu, item: 'invalid' },
      'outgoing',
      'Close Combat',
      conditions()
    ).kind,
    'unavailable'
  );
  assert.equal(
    ownSetConditions(
      { ...raichu, ability: 'Intimidate', item: 'Leftovers' },
      { ...sneasler, ability: 'Intimidate' }
    ).self.abilityOn,
    true
  );
  assert.equal(
    ownSetConditions(
      { ...raichu, ability: 'Intimidate', item: 'Leftovers' },
      { ...sneasler, ability: 'Intimidate' }
    ).opponent.abilityOn,
    true
  );
});

test('recommendations generate verified own-set survival refinements deterministically', async () => {
  const before = JSON.stringify([raichu, sneasler]);
  const teams = [team('sneasler', 'M-C', [sneasler])];
  const index = buildBenchmarkIndex(teams, 'M-C');
  const first = await recommendSpreads(raichu, index, teams);
  const again = await recommendSpreads(raichu, index, teams);
  assert.ok(first.suggestions.length);
  assert.deepEqual(first.suggestions, again.suggestions);
  const suggestion = first.suggestions[0];
  assert.equal(suggestion.value, '18 HP / 31 Def / 17 Spe');
  assert.equal(suggestion.nature, 'Timid');
  assert.equal(suggestion.movedPoints, 6);
  assert.ok(suggestion.reasons.includes("Survives Sneasler's Close Combat"));
  const verified = evaluateMatchup(
    { ...raichu, spread: suggestion.value },
    sneasler,
    'incoming',
    'Close Combat',
    ownSetConditions(raichu, sneasler)
  );
  assert.equal(verified.kind, 'exact');
  assert.equal(verified.survivalChance, 1);
  const parsed = parseChampionsSpread(suggestion.value);
  assert.equal(championsSpreadTotal(parsed), 66);
  assert.ok(
    CHAMPIONS_STATS.every((stat) => parsed[stat] >= 0 && parsed[stat] <= 32)
  );
  assert.equal(JSON.stringify([raichu, sneasler]), before);
});

test('recommendations require a legal complete baseline and never borrow historical sets', async () => {
  const teams = [team('old', 'M-B', [sneasler])];
  const noCurrentSets = buildBenchmarkIndex(teams, 'M-C');
  assert.equal(
    (await recommendSpreads(raichu, noCurrentSets, teams)).message,
    'No current-regulation benchmark sets available.'
  );
  assert.equal(
    (
      await recommendSpreads(
        { ...raichu, spread: '32 HP' },
        noCurrentSets,
        teams
      )
    ).message,
    'Complete a valid 66-point spread to see suggestions.'
  );
  assert.equal(
    (await recommendSpreads({ ...raichu, nature: null }, noCurrentSets, teams))
      .message,
    'Choose a nature to see suggestions.'
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    recommendSpreads(raichu, noCurrentSets, teams, controller.signal),
    {
      name: 'AbortError',
    }
  );
});

test('unsupported own-set items do not create damage claims', async () => {
  const unsupported = { ...raichu, item: 'not a real item' };
  const teams = [team('sneasler', 'M-C', [sneasler])];
  const result = await recommendSpreads(
    unsupported,
    buildBenchmarkIndex(teams, 'M-C'),
    teams
  );
  assert.ok(result.suggestions.length);
  assert.ok(
    result.suggestions.every((suggestion) =>
      suggestion.reasons.every((reason) =>
        reason.startsWith('Unmodified Speed:')
      )
    )
  );
  assert.equal(result.message, null);
});

test('recommendations report a lost Speed tier alongside a damage gain', async () => {
  const raichuTier = {
    ...raichu,
    spread: '18 HP / 28 Def / 20 Spe',
  };
  const teams = [
    team('sneasler', 'M-C', [sneasler]),
    team('raichu-tier', 'M-C', [raichuTier]),
  ];
  const result = await recommendSpreads(
    raichu,
    buildBenchmarkIndex(teams, 'M-C'),
    teams
  );
  const suggestion = result.suggestions.find(
    (entry) => entry.value === '18 HP / 31 Def / 17 Spe'
  );
  assert.ok(suggestion);
  assert.ok(suggestion.reasons.includes("Survives Sneasler's Close Combat"));
  assert.ok(
    suggestion.tradeoffs.includes(
      'No longer outspeeds median Raichu-Mega-Y (187)'
    )
  );
});

test('unsupported multi-hit attacks never become recommendation claims', async () => {
  const target = { ...sneasler, moves: ['Bullet Seed'] };
  const editor = { ...raichu, moves: ['Protect'] };
  const teams = [team('multi-hit', 'M-C', [target])];
  const result = await recommendSpreads(
    editor,
    buildBenchmarkIndex(teams, 'M-C'),
    teams
  );
  assert.equal(result.suggestions.length, 0);
  assert.match(result.message, /multi-hit/i);
});

test('unknown ordinary ability blocks damage claims but leaves raw-Speed suggestions available', async () => {
  const editor = {
    pokemon: 'Raichu',
    item: 'Leftovers',
    ability: null,
    nature: 'Timid',
    spread: '18 HP / 25 Def / 23 Spe',
    moves: ['Thunderbolt'],
  };
  const opponent = {
    ...editor,
    item: 'Leftovers',
    ability: 'Lightning Rod',
    spread: '18 HP / 24 Def / 24 Spe',
  };
  const teams = [team('speed-tier', 'M-C', [opponent])];
  const result = await recommendSpreads(
    editor,
    buildBenchmarkIndex(teams, 'M-C'),
    teams
  );
  assert.ok(result.suggestions.length);
  assert.ok(
    result.suggestions.every((entry) =>
      entry.reasons.every((reason) => reason.startsWith('Unmodified Speed:'))
    )
  );
});
