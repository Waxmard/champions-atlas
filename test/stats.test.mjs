import assert from 'node:assert/strict';
import test from 'node:test';
import statsData from '../src/lib/data/pokemon-stats.json' with { type: 'json' };
import { parseChampionsSpread } from '../src/lib/paste.ts';
import {
  finalHp,
  finalStat,
  speedFor,
  speedTiers,
  spreadNudges,
  statRow,
} from '../src/lib/stats.ts';

const member = (pokemon, spread, nature = null) => ({
  pokemon,
  item: 'Item',
  ability: 'Ability',
  nature,
  spread,
  moves: ['Protect'],
});
const team = (id, members) => ({
  id,
  name: id,
  regulation: 'M-C',
  publishedAt: '2026-09-01',
  paste: null,
  pasteUrl: 'https://pokepast.es/0000000000000000',
  members,
  reports: [],
});

/* Absol Spe intercept 95, Decidueye 90, Dragonite 100; every spread totals 66. */
const fixture = team('fixture', [
  member('Absol', '32 Atk / 29 Def / 5 Spe'),
  member('Absol', '32 Atk / 19 Def / 15 Spe'),
  member('Absol', '32 Atk / 9 Def / 25 Spe'),
  member('Dragonite', '20 Atk / 26 Def / 20 Spe'),
  member('Dragonite', '20 Atk / 26 Def / 20 Spe'),
  member('Decidueye', '32 Atk / 32 Def / 2 HP'),
]);

test('Champions stat table resolves level-50 intercepts', () => {
  assert.deepEqual(statRow('Absol'), [140, 150, 80, 95, 80, 95]);
  assert.equal(statRow('Absol-Mega-Z')[5], 171);
  assert.equal(statRow('Vivillon'), null);
  assert.ok(Object.keys(statsData.stats).length >= 340);
});

test('level-50 stat math applies the nature multiplier to the SP total', () => {
  const spe = parseChampionsSpread('32 Spe');
  assert.equal(speedFor('Absol', spe, 'Timid'), 139);
  assert.equal(speedFor('Absol', spe, 'Adamant'), 127);
  assert.equal(finalStat(95, 32, 1.1), 139);
  assert.equal(finalHp(140, 32), 172);
  assert.equal(speedFor('Vivillon', spe, 'Timid'), null);
  assert.equal(speedFor('Absol', parseChampionsSpread(''), 'Timid'), 104);
});

test('speedTiers ranks species by member count and reports the lower median', () => {
  const tiers = speedTiers([fixture]);
  assert.deepEqual(
    tiers.map((tier) => tier.pokemon),
    ['Absol', 'Dragonite', 'Decidueye']
  );
  assert.equal(tiers[0].medianSpeed, 110);
  assert.equal(tiers[0].count, 3);
  assert.equal(tiers[1].medianSpeed, 120);
  assert.equal(tiers[2].medianSpeed, 90);
});

test('spreadNudges reaches the next Speed tier by moving the fewest points', () => {
  const current = parseChampionsSpread('32 Atk / 2 Spe');
  assert.equal(speedFor('Absol', current, 'Jolly'), 106);

  const nudges = spreadNudges('Absol', current, 'Jolly', [fixture]);
  assert.equal(nudges.length, 2);
  assert.equal(nudges[0].targetSpeed, 110);
  assert.equal(nudges[0].target, 'median Absol (110)');
  assert.equal(nudges[0].value, '28 Atk / 6 Spe');
  assert.equal(nudges[0].speed, 111);
  assert.equal(nudges[0].moved, 4);
  assert.deepEqual(nudges[0].deltas, [
    { stat: 'Atk', from: 32, to: 28, delta: -4 },
    { stat: 'Spe', from: 2, to: 6, delta: 4 },
  ]);
  assert.ok(
    nudges.every((nudge) => nudge.targetSpeed > 106),
    'every nudge outspeeds the current build'
  );
  assert.equal(nudges[1].targetSpeed, 120);

  assert.deepEqual(spreadNudges('Vivillon', current, 'Jolly', [fixture]), []);
  assert.deepEqual(spreadNudges('Absol', null, 'Jolly', [fixture]), []);
});
