import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BENCHMARK_CONDITIONS,
  deriveBenchmarkSet,
  evaluateMatchup,
  itemOptions,
} from '../src/lib/benchmarks.ts';
import { buildBenchmarkIndex } from '../src/lib/benchmark-index.ts';
import { solveBenchmark } from '../src/lib/benchmark-suggestions.ts';
import {
  championsSpreadTotal,
  formatChampionsSpread,
  parseChampionsSpread,
  spreadDeltas,
  spreadMoved,
} from '../src/lib/paste.ts';
import { ownSpreadSuggestions } from '../src/lib/workbench.ts';

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

const gholdengo = {
  pokemon: 'Gholdengo',
  item: 'Life Orb',
  ability: 'Good as Gold',
  nature: 'Modest',
  spread: '17 HP / 17 SpA / 32 Spe',
  moves: ['Make It Rain'],
};
const garchomp = {
  pokemon: 'Garchomp',
  item: 'Life Orb',
  ability: 'Rough Skin',
  nature: 'Modest',
  spread: '2 HP / 32 SpA / 32 Spe',
  moves: ['Earth Power'],
};
const hardySneasler = {
  pokemon: 'Sneasler',
  item: 'Life Orb',
  ability: 'Unburden',
  nature: 'Hardy',
  spread: '2 Def / 32 HP / 32 Spe',
  moves: ['Close Combat'],
};

const palafin = {
  pokemon: 'Palafin',
  item: 'Mystic Water',
  ability: 'Zero to Hero',
  nature: 'Adamant',
  spread: '2 HP / 32 Atk / 32 Spe',
  moves: ['Jet Punch'],
};
const highBalance = {
  pokemon: 'Gholdengo',
  item: 'Life Orb',
  ability: 'Good as Gold',
  nature: 'Modest',
  spread: '11 HP / 11 Atk / 11 Def / 0 SpA / 11 SpD / 22 Spe',
  moves: ['Make It Rain'],
};
const gardevoirMega = {
  pokemon: 'Gardevoir-Mega',
  item: 'Gardevoirite',
  ability: 'Trace',
  nature: 'Modest',
  spread: '4 HP / 28 Def / 15 SpA / 19 Spe',
  moves: ['Hyper Voice'],
};

/* Every legal spread with these two stats deals and takes identical damage, so
   a pinned pair stands in for its whole family. */
const pinnedSpread = (hp, def) => {
  const values = { HP: hp, Atk: 0, Def: def, SpA: 0, SpD: 0, Spe: 0 };
  let left = 66 - hp - def;
  for (const stat of ['Atk', 'SpA', 'SpD', 'Spe']) {
    values[stat] = Math.min(32, left);
    left -= values[stat];
  }
  return formatChampionsSpread(values);
};

const compositions = (total, limits) => {
  if (!limits.length) return total === 0 ? 1 : 0;
  let count = 0;
  for (let value = 0; value <= Math.min(limits[0], total); value++)
    count += compositions(total - value, limits.slice(1));
  return count;
};

test('solver answers with the fewest moved points and only surviving spreads', async () => {
  const result = await solveBenchmark(raichu, {
    goal: 'survive',
    opponent: sneasler,
    move: 'Close Combat',
    conditions: conditions(),
  });
  assert.equal(result.kind, 'answer');
  assert.equal(result.certain, true);
  assert.equal(result.current.nature, 'Timid');
  assert.equal(result.current.message, null);
  assert.equal(result.current.others, 0);
  assert.equal(result.current.solutions[0].spread, '18 HP / 31 Def / 17 Spe');
  const solutions = result.current.solutions;
  for (const solution of solutions) {
    const spread = parseChampionsSpread(solution.spread);
    assert.equal(championsSpreadTotal(spread), 66);
    assert.equal(solution.movedPoints, spreadMoved(solution.deltas) / 2);
    assert.deepEqual(
      solution.deltas,
      spreadDeltas(parseChampionsSpread(raichu.spread), spread)
    );
    assert.equal(solution.movedPoints, 6);
    const verified = evaluateMatchup(
      { ...raichu, spread: solution.spread },
      sneasler,
      'incoming',
      'Close Combat',
      conditions()
    );
    assert.equal(verified.kind, 'exact', verified.reason);
    assert.equal(verified.survivalChance, 1);
  }
  const widths = solutions.map((solution) => solution.deltas.length);
  assert.deepEqual(
    widths,
    [...widths].sort((a, b) => a - b)
  );
  assert.equal(widths[0], 2);
  for (let index = 1; index < solutions.length; index++) {
    if (widths[index] !== widths[index - 1]) continue;
    assert.ok(solutions[index - 1].stats.Spe >= solutions[index].stats.Spe);
  }
  assert.equal(result.changed.nature, 'Bold');

  const initial = parseChampionsSpread(raichu.spread);
  const claim = result.current.solutions[0].movedPoints;
  const cost = (hp, def) => {
    const hpDelta = hp - initial.HP;
    const defDelta = def - initial.Def;
    return (
      (Math.abs(hpDelta) + Math.abs(defDelta) + Math.abs(hpDelta + defDelta)) /
      2
    );
  };
  let cheaper = 0;
  let atMinimum = 0;
  for (let hp = 0; hp <= 32; hp++) {
    for (let def = 0; def <= 32; def++) {
      if (hp + def > 66) continue;
      const moved = cost(hp, def);
      if (moved > claim) continue;
      const probe = evaluateMatchup(
        { ...raichu, spread: pinnedSpread(hp, def) },
        sneasler,
        'incoming',
        'Close Combat',
        conditions()
      );
      if (probe.kind !== 'exact' || probe.survivalChance !== 1) continue;
      if (moved < claim) cheaper++;
      else atMinimum++;
    }
  }
  assert.equal(cheaper, 0, 'no cheaper HP/Def split survives');
  assert.ok(
    atMinimum >= result.current.others + result.current.solutions.length,
    'every co-minimal HP/Def family is listed'
  );
});

test('solver reaches the OHKO at the cheapest attack value and counts every donor split', async () => {
  const result = await solveBenchmark(hardySneasler, {
    goal: 'ko',
    opponent: raichu,
    move: 'Close Combat',
    conditions: conditions(),
  });
  assert.equal(result.kind, 'answer');
  assert.equal(result.certain, true);
  assert.equal(
    result.summary,
    'Your Hardy spread can reach this by moving 23 points.'
  );
  assert.equal(result.current.solutions.length, 6);
  assert.equal(result.current.others, 63);
  assert.equal(
    result.current.solutions[0].spread,
    '9 HP / 23 Atk / 2 Def / 32 Spe'
  );
  for (const solution of result.current.solutions) {
    assert.equal(parseChampionsSpread(solution.spread).Atk, 23);
    assert.equal(solution.movedPoints, 23);
    assert.equal(solution.movedPoints, spreadMoved(solution.deltas) / 2);
    const verified = evaluateMatchup(
      { ...hardySneasler, spread: solution.spread },
      raichu,
      'outgoing',
      'Close Combat',
      conditions()
    );
    assert.equal(verified.kind, 'exact', verified.reason);
    assert.equal(verified.koChance, 1);
  }
  const initial = parseChampionsSpread(hardySneasler.spread);
  assert.equal(
    result.current.others + result.current.solutions.length,
    compositions(
      23,
      ['HP', 'Def', 'SpA', 'SpD', 'Spe'].map((stat) => initial[stat])
    )
  );
  assert.equal(result.changed.nature, 'Adamant');
  assert.equal(result.changed.solutions[0].movedPoints, 8);
  assert.equal(
    result.changed.solutions[0].spread,
    '24 HP / 8 Atk / 2 Def / 32 Spe'
  );
});

test('solver outspeeds by raising Speed the fewest points, or by nature alone', async () => {
  const tied = await solveBenchmark(raichu, {
    goal: 'outspeed',
    opponent: { ...raichu },
    move: null,
    conditions: conditions(),
  });
  assert.equal(tied.certain, true);
  assert.equal(
    tied.summary,
    'Your Timid spread can reach this by moving 1 points.'
  );
  assert.deepEqual(
    tied.current.solutions.map((solution) => solution.spread),
    ['18 HP / 24 Def / 24 Spe', '17 HP / 25 Def / 24 Spe']
  );
  assert.equal(tied.current.others, 0);
  assert.equal(tied.changed, null);
  for (const solution of tied.current.solutions) {
    assert.equal(parseChampionsSpread(solution.spread).Spe, 24);
    assert.equal(solution.movedPoints, 1);
    assert.equal(solution.outcome, 'Speed 191 outspeeds 190');
  }

  const slower = { ...raichu, nature: 'Adamant' };
  const byNature = await solveBenchmark(slower, {
    goal: 'outspeed',
    opponent: { ...raichu, nature: 'Jolly', spread: '15 HP / 32 Atk / 19 Spe' },
    move: null,
    conditions: conditions(),
  });
  assert.equal(byNature.certain, true);
  assert.equal(
    byNature.summary,
    'This needs a different nature: Timid, moving 0 points.'
  );
  assert.equal(byNature.current.message, 'Maximum Speed is 182 with Adamant.');
  assert.equal(byNature.current.solutions.length, 0);
  assert.equal(byNature.changed.nature, 'Timid');
  assert.deepEqual(byNature.changed.solutions, [
    {
      spread: slower.spread,
      nature: 'Timid',
      movedPoints: 0,
      deltas: [],
      stats: {
        HP: 153,
        Atk: 108,
        Def: 100,
        SpA: 180,
        SpD: 100,
        Spe: 190,
      },
      speed: 190,
      outcome: 'Speed 190 outspeeds 185',
    },
  ]);
});

test('solver lowers the unused offence stat when the goal needs a different nature', async () => {
  const calm = await solveBenchmark(raichu, {
    goal: 'survive',
    opponent: garchomp,
    move: 'Earth Power',
    conditions: conditions(),
  });
  assert.equal(calm.certain, true);
  assert.equal(
    calm.current.message,
    'No 66-point spread reaches this with Timid.'
  );
  assert.equal(calm.changed.nature, 'Calm');
  assert.equal(calm.changed.others, 5);
  assert.equal(calm.changed.solutions[0].spread, '25 HP / 31 SpD / 10 Spe');
  assert.equal(calm.changed.solutions[0].movedPoints, 38);
  assert.equal(
    calm.changed.solutions[0].outcome,
    'survives 16/16 rolls (max 159 of 160 HP)'
  );
  assert.equal(
    calm.summary,
    'This needs a different nature: Calm, moving 38 points.'
  );

  const jolly = await solveBenchmark(
    { ...raichu, moves: ['Close Combat'] },
    {
      goal: 'outspeed',
      opponent: { ...raichu },
      move: null,
      conditions: conditions(),
    }
  );
  assert.equal(jolly.changed.nature, 'Jolly');

  const bold = await solveBenchmark(
    { ...raichu, moves: ['Thunderbolt', 'Fake Out'] },
    {
      goal: 'survive',
      opponent: sneasler,
      move: 'Close Combat',
      conditions: conditions(),
    }
  );
  assert.equal(bold.changed.nature, 'Bold');
});

test('solver reports already-met goals, unreachable goals and unusable questions', async () => {
  const already = await solveBenchmark(
    { ...raichu, spread: '32 HP / 32 Def / 2 Spe' },
    {
      goal: 'survive',
      opponent: sneasler,
      move: 'Close Combat',
      conditions: conditions(),
    }
  );
  assert.equal(already.kind, 'answer');
  assert.equal(already.certain, true);
  assert.equal(
    already.summary,
    'Already survives 16/16 rolls (max 150 of 167 HP)'
  );
  assert.deepEqual(already.current.solutions, []);
  assert.equal(already.changed, null);
  assert.equal(already.best, null);

  const unreachable = await solveBenchmark(
    { ...raichu, item: 'Leftovers' },
    {
      goal: 'outspeed',
      opponent: { ...sneasler, item: 'Choice Scarf' },
      move: null,
      conditions: conditions(),
    }
  );
  assert.equal(unreachable.kind, 'answer');
  assert.equal(unreachable.certain, false);
  assert.match(
    unreachable.summary,
    /^No 66-point spread reaches this; the closest is /
  );
  assert.equal(unreachable.current.message, 'Maximum Speed is 178 with Timid.');
  assert.equal(unreachable.changed, null);
  assert.equal(unreachable.best.speed, 178);
  assert.ok(unreachable.best.spread);

  const question = (overrides = {}) => ({
    goal: 'ko',
    opponent: sneasler,
    move: 'Thunderbolt',
    conditions: conditions(),
    ...overrides,
  });
  assert.deepEqual(await solveBenchmark(raichu, question({ move: null })), {
    kind: 'error',
    message: 'Choose a move to see suggestions.',
  });
  assert.deepEqual(
    await solveBenchmark(raichu, question({ move: 'Protect' })),
    {
      kind: 'error',
      message: 'Protect does not deal direct damage',
    }
  );
  assert.deepEqual(
    await solveBenchmark(raichu, question({ move: 'Not A Move' })),
    {
      kind: 'error',
      message: 'Not A Move does not deal direct damage',
    }
  );
  assert.deepEqual(
    await solveBenchmark(raichu, question({ move: 'Population Bomb' })),
    {
      kind: 'error',
      message: 'Population Bomb is a multi-hit or multiaccuracy move',
    }
  );
  assert.deepEqual(
    await solveBenchmark(
      { ...raichu, spread: '32 HP' },
      question({ move: 'Close Combat' })
    ),
    {
      kind: 'error',
      message: 'Complete a valid 66-point spread to see suggestions.',
    }
  );
  assert.deepEqual(
    await solveBenchmark(
      { ...raichu, nature: null },
      question({ move: 'Close Combat' })
    ),
    { kind: 'error', message: 'Choose a nature to see suggestions.' }
  );
  assert.deepEqual(
    await solveBenchmark(
      { ...raichu, item: null },
      question({ move: 'Close Combat' })
    ),
    { kind: 'error', message: 'Choose an item to see suggestions.' }
  );
  assert.deepEqual(
    await solveBenchmark(raichu, {
      goal: 'ko',
      opponent: gholdengo,
      move: 'Focus Blast',
      conditions: conditions(),
    }),
    { kind: 'error', message: 'Focus Blast deals no damage to Gholdengo.' }
  );

  const controller = new AbortController();
  const pending = solveBenchmark(
    raichu,
    question({ move: 'Close Combat' }),
    controller.signal
  );
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('solver reports an immune move as guaranteed survival', async () => {
  assert.deepEqual(
    await solveBenchmark(gholdengo, {
      goal: 'survive',
      opponent: sneasler,
      move: 'Close Combat',
      conditions: conditions(),
    }).then((result) => [result.kind, result.certain, result.summary]),
    ['answer', true, 'Already survives 1/1 rolls (max 0 of 179 HP)']
  );
});

test('solver expands the winning spread family once, not per pinned assignment', async () => {
  const start = performance.now();
  const result = await solveBenchmark(highBalance, {
    goal: 'ko',
    opponent: gardevoirMega,
    move: 'Make It Rain',
    conditions: conditions(),
  });
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 500, `deferred family expansion: ${elapsed} ms`);
  assert.equal(
    result.summary,
    'Your Modest spread can reach this by moving 3 points.'
  );
  assert.equal(result.current.solutions[0].movedPoints, 3);
});

test('solver honours condition form overrides for both combatants', async () => {
  const base = await solveBenchmark(palafin, {
    goal: 'ko',
    opponent: gholdengo,
    move: 'Jet Punch',
    conditions: conditions(),
  });
  const heroConditions = conditions();
  heroConditions.self.form = 'Palafin-Hero';
  const hero = await solveBenchmark(palafin, {
    goal: 'ko',
    opponent: gholdengo,
    move: 'Jet Punch',
    conditions: heroConditions,
  });
  assert.equal(base.best.stats.Atk, 134);
  assert.deepEqual(hero.best.stats, {
    HP: 177,
    Atk: 233,
    Def: 117,
    SpA: 113,
    SpD: 107,
    Spe: 152,
  });

  const invalid = conditions();
  invalid.self.form = 'Palafin-Hero';
  const invalidResult = await solveBenchmark(raichu, {
    goal: 'ko',
    opponent: sneasler,
    move: 'Close Combat',
    conditions: invalid,
  });
  assert.equal(invalidResult.kind, 'error');
  assert.match(invalidResult.message, /Invalid battle form/);
});

test('solver surfaces an unresolvable opponent form as an error on every goal', async () => {
  assert.deepEqual(
    await solveBenchmark(raichu, {
      goal: 'outspeed',
      opponent: { ...sneasler, pokemon: 'NotAPokemon' },
      move: null,
      conditions: conditions(),
    }),
    { kind: 'error', message: 'Unknown battle species: NotAPokemon' }
  );
});

test('derived sets filter by item, exclude Choice Scarf and aggregate team counts', () => {
  const sparse = { ...sneasler, spread: '12 HP / 32 Atk / 22 Spe' };
  const index = buildBenchmarkIndex(
    [
      team('alpha', 'M-C', [raichu, sneasler]),
      team('beta', 'M-C', [raichu, sneasler]),
      team('gamma', 'M-C', [
        { ...raichu, item: 'Choice Scarf' },
        { ...sneasler, item: 'Choice Scarf' },
      ]),
      team('delta', 'M-C', [sparse]),
    ],
    'M-C'
  );
  const mega = deriveBenchmarkSet(index, 'Raichu-Mega-Y');
  assert.equal(mega.pokemon, 'Raichu-Mega-Y');
  assert.equal(mega.member.item, 'Raichunite Y');
  assert.equal(mega.member.spread, '18 HP / 25 Def / 23 Spe');
  assert.equal(mega.teams, 2);
  assert.equal(mega.spreads, 1);
  assert.deepEqual(mega.moves, ['Thunderbolt']);
  assert.equal(
    deriveBenchmarkSet(index, 'Raichu-Mega-Y', { excludeChoiceScarf: true })
      .teams,
    2
  );
  assert.equal(
    deriveBenchmarkSet(index, 'Raichu-Mega-Y', { item: 'Leftovers' }),
    null
  );

  const scarf = deriveBenchmarkSet(index, 'Raichu', { item: 'Choice Scarf' });
  assert.equal(scarf.member.pokemon, 'Raichu');
  assert.equal(scarf.teams, 1);

  const bare = deriveBenchmarkSet(index, 'Sneasler', {
    excludeChoiceScarf: true,
  });
  assert.equal(bare.teams, 2);
  assert.equal(bare.member.item, 'White Herb');
  const sneaslers = deriveBenchmarkSet(index, 'Sneasler');
  assert.equal(sneaslers.teams, 3);
  assert.equal(sneaslers.spreads, 2);
  assert.equal(sneaslers.member.item, 'White Herb');
  const scarfOnly = deriveBenchmarkSet(index, 'Sneasler', {
    item: 'Choice Scarf',
  });
  assert.equal(scarfOnly.teams, 1);
  assert.equal(scarfOnly.spreads, 1);
  assert.equal(scarfOnly.member.item, 'Choice Scarf');
  assert.deepEqual(itemOptions(index, 'Sneasler'), [
    { item: 'White Herb', teams: 3 },
    { item: 'Choice Scarf', teams: 1 },
  ]);
  assert.equal(deriveBenchmarkSet(index, 'Missingno'), null);
});

test('own spreads copy a same-species spread from another saved team', () => {
  const own = [
    {
      id: 'alpha',
      name: 'Alpha',
      regulation: 'M-C',
      members: [{ ...raichu, spread: '19 HP / 30 Def / 17 Spe' }, sneasler],
    },
    {
      id: 'beta',
      name: 'Beta',
      regulation: 'M-B',
      members: [{ ...raichu, spread: '18 HP / 24 Def / 24 Spe' }],
    },
  ];
  assert.deepEqual(ownSpreadSuggestions(raichu, own, null), [
    {
      teamName: 'Beta',
      regulation: 'M-B',
      spread: '18 HP / 24 Def / 24 Spe',
      nature: 'Timid',
      deltas: [
        { stat: 'Def', from: 25, to: 24, delta: -1 },
        { stat: 'Spe', from: 23, to: 24, delta: 1 },
      ],
      movedPoints: 1,
      speed: 191,
    },
    {
      teamName: 'Alpha',
      regulation: 'M-C',
      spread: '19 HP / 30 Def / 17 Spe',
      nature: 'Timid',
      deltas: [
        { stat: 'HP', from: 18, to: 19, delta: 1 },
        { stat: 'Def', from: 25, to: 30, delta: 5 },
        { stat: 'Spe', from: 23, to: 17, delta: -6 },
      ],
      movedPoints: 6,
      speed: 183,
    },
  ]);
  assert.deepEqual(
    ownSpreadSuggestions(raichu, own, 'beta').map(({ teamName }) => teamName),
    ['Alpha']
  );
  assert.deepEqual(
    ownSpreadSuggestions(
      {
        ...raichu,
        pokemon: 'Raichu-Mega-Y',
        spread: '18 HP / 24 Def / 24 Spe',
      },
      own,
      null
    ).map(({ teamName }) => teamName),
    ['Alpha']
  );
  assert.deepEqual(
    ownSpreadSuggestions(
      raichu,
      [
        {
          id: 'gamma',
          name: 'Gamma',
          regulation: 'M-C',
          members: [{ ...raichu, spread: '32 HP' }],
        },
      ],
      null
    ),
    []
  );
  assert.deepEqual(
    ownSpreadSuggestions(
      raichu,
      [{ id: 'delta', name: 'Delta', regulation: 'M-C', members: [raichu] }],
      null
    ),
    []
  );
});
