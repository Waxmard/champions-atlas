import { resolveBattleForm } from '../src/lib/battle-forms.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChampionsSpread } from '../src/lib/paste.ts';
import {
  finalHp,
  finalStat,
  statsFor,
  speedFor,
  speedTiers,
  statRow,
} from '../src/lib/stats.ts';

const member = (pokemon, spread, nature = 'Serious') => ({
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
  assert.ok(statRow('Vivillon'));
  assert.equal(statRow('Missingno'), null);
});

test('level-50 stat math applies the nature multiplier to the SP total', () => {
  const spe = parseChampionsSpread('32 Spe');
  assert.equal(speedFor('Absol', spe, 'Timid'), 139);
  assert.equal(speedFor('Absol', spe, 'Adamant'), 127);
  assert.equal(finalStat(95, 32, 1.1), 139);
  assert.equal(finalHp(140, 32), 172);
  assert.equal(speedFor('Missingno', spe, 'Timid'), null);
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

test('final stats use evolved form, nature, and the HP-one exception', () => {
  const spread = parseChampionsSpread('18 HP / 25 Def / 23 Spe');
  assert.deepEqual(
    Object.values(statsFor('Raichu-Mega-Y', spread, 'Timid')),
    [153, 108, 100, 180, 100, 190]
  );
  assert.equal(finalHp(1, 32), 1);
  assert.equal(statsFor('Raichu-Mega-Y', spread, null), null);
});

test('Mega stones resolve exact forms without rewriting saved pre-Mega abilities', () => {
  const member = {
    pokemon: 'Raichu',
    item: 'Raichunite Y',
    ability: 'Lightning Rod',
  };
  assert.deepEqual(resolveBattleForm(member), {
    pokemon: 'Raichu-Mega-Y',
    ability: 'No Guard',
    error: null,
  });
  assert.equal(resolveBattleForm(member, 'Raichu').ability, 'Lightning Rod');
  assert.equal(member.ability, 'Lightning Rod');
  assert.equal(
    resolveBattleForm({ ...member, item: 'Raichunite X' }).pokemon,
    'Raichu-Mega-X'
  );
  assert.match(
    resolveBattleForm({ ...member, pokemon: 'Raichu-Mega-X' }).error,
    /conflict/i
  );
  assert.match(
    resolveBattleForm(member, 'Palafin-Hero').error,
    /Invalid battle form/
  );
});

test('Palafin stays in its saved form until a transient Hero choice', () => {
  const saved = {
    pokemon: 'Palafin',
    item: 'Leftovers',
    ability: 'Zero to Hero',
  };
  assert.equal(resolveBattleForm(saved).pokemon, 'Palafin');
  assert.equal(
    resolveBattleForm(saved, 'Palafin-Hero').pokemon,
    'Palafin-Hero'
  );
  assert.deepEqual(statRow('Palafin-Hero'), [175, 180, 117, 126, 107, 120]);
  assert.deepEqual(statRow('Palafin'), [175, 90, 92, 73, 82, 120]);
  assert.equal(saved.pokemon, 'Palafin');
});

test('Speed tiers group evolved stones and omit unknown natures', () => {
  const spread = '18 HP / 25 Def / 23 Spe';
  const base = {
    ...member('Raichu', spread, 'Timid'),
    item: 'Raichunite Y',
    ability: 'Lightning Rod',
  };
  const mega = { ...base, pokemon: 'Raichu-Mega-Y' };
  const tiers = speedTiers([
    team('current', [base, mega, { ...base, nature: null }]),
  ]);
  assert.deepEqual(tiers, [
    { pokemon: 'Raichu-Mega-Y', medianSpeed: 190, count: 2 },
  ]);
});
