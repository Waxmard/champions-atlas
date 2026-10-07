import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogSpreadSuggestions } from '../src/lib/workbench.ts';

const team = (id, regulation, members) => ({ id, regulation, members });
const member = (pokemon, nature, spread) => ({
  pokemon,
  item: null,
  ability: 'Levitate',
  nature,
  spread,
  moves: ['Hydro Pump'],
});
const self = member('Rotom-Wash', 'Modest', null);
const pairs = [
  ['Modest', '31 HP / 4 Def / 31 SpA'],
  ['Timid', '31 HP / 4 Def / 30 SpA / 1 Spe'],
  ['Modest', '30 HP / 5 Def / 31 SpA'],
  ['Timid', '30 HP / 5 Def / 30 SpA / 1 Spe'],
];
const catalog = [
  ...pairs.map(([nature, spread], i) =>
    team('set-' + i, 'M-C', [member('Rotom-Wash', nature, spread)])
  ),
  team('bold', 'M-B', [
    member('Rotom-Wash', 'Bold', '31 HP / 13 Def / 16 SpD / 6 Spe'),
  ]),
  team('incomplete-bold', 'M-C', [member('Rotom-Wash', 'Bold', '31 HP')]),
  team('other-form', 'M-C', [
    member('Rotom-Heat', 'Bold', '31 HP / 13 Def / 16 SpD / 6 Spe'),
  ]),
];
const ordinary = () => catalogSpreadSuggestions(self, catalog, 'M-C');
const selected = (nature) =>
  catalogSpreadSuggestions(self, catalog, 'M-C', 4, nature);
const boldSpread = '31 HP / 13 Def / 16 SpD / 6 Spe';

test('preferred nature reserves a real ranked pair without changing ordinary order', () => {
  const baseline = ordinary();
  const bold = selected('Bold');
  assert.deepEqual(
    bold.slice(0, 3).map(({ nature, spread }) => [nature, spread]),
    baseline.slice(0, 3).map(({ nature, spread }) => [nature, spread])
  );
  assert.equal(bold[3].nature, 'Bold');
  assert.equal(bold[3].spread, boldSpread);
  assert.equal(bold[3].currentCount, 0);
  assert.equal(bold[3].totalCount, 1);
  assert.equal(bold[3].speed, 112);
  assert.deepEqual(
    bold[3].deltas.map(({ stat, from, to }) => [stat, from, to]),
    [
      ['HP', 0, 31],
      ['Def', 0, 13],
      ['SpD', 0, 16],
      ['Spe', 0, 6],
    ]
  );
  assert.equal(bold[3].movedPoints, 33);
  assert.equal(
    new Set(bold.map(({ nature, spread }) => nature + '|' + spread)).size,
    bold.length
  );
  assert.equal(
    catalogSpreadSuggestions(self, catalog, 'M-C', 1, 'Bold')[0].nature,
    'Bold'
  );
  assert.deepEqual(
    catalogSpreadSuggestions(self, catalog, 'M-C', 0, 'Bold'),
    []
  );
});

test('invalid, absent, and normalized preferences preserve cached ranking', () => {
  const baseline = ordinary();
  for (const preference of [null, '', 'not-a-nature', 'Adamant'])
    assert.deepEqual(selected(preference), baseline);
  assert.deepEqual(selected('bOlD'), selected('Bold'));
  assert.deepEqual(selected('Timid').slice(0, 3), baseline.slice(0, 3));
  assert.ok(selected('Timid').some(({ nature }) => nature === 'Timid'));
  assert.deepEqual(selected('Modest'), baseline);
  assert.deepEqual(ordinary(), baseline);
});

test('incomplete and other-form data cannot create a preferred pair', () => {
  const noBold = catalog.filter(({ id }) => id !== 'bold');
  assert.ok(
    catalogSpreadSuggestions(self, noBold, 'M-C', 4, 'Bold').every(
      ({ nature }) => nature !== 'Bold'
    )
  );
  assert.deepEqual(
    catalogSpreadSuggestions(
      member('Missingno', 'Modest', null),
      catalog,
      'M-C',
      4,
      'Bold'
    ),
    []
  );
});
