import { resolveBattleForm } from '../src/lib/battle-forms.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChampionsSpread } from '../src/lib/paste.ts';
import { finalStat, speedFor, statRow } from '../src/lib/stats.ts';

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
  assert.equal(speedFor('Missingno', spe, 'Timid'), null);
  assert.equal(speedFor('Absol', parseChampionsSpread(''), 'Timid'), 104);
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
  assert.equal(member.ability, 'Lightning Rod');
  assert.equal(
    resolveBattleForm({ ...member, item: 'Raichunite X' }).pokemon,
    'Raichu-Mega-X'
  );
  assert.match(
    resolveBattleForm({ ...member, pokemon: 'Raichu-Mega-X' }).error,
    /conflict/i
  );
});

test('Palafin preserves its saved form by default', () => {
  const saved = {
    pokemon: 'Palafin',
    item: 'Leftovers',
    ability: 'Zero to Hero',
  };
  assert.equal(resolveBattleForm(saved).pokemon, 'Palafin');
  assert.deepEqual(statRow('Palafin-Hero'), [175, 180, 117, 126, 107, 120]);
  assert.deepEqual(statRow('Palafin'), [175, 90, 92, 73, 82, 120]);
  assert.equal(saved.pokemon, 'Palafin');
});
