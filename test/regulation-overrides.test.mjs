import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeRegulationOverrides,
  withRegulationOverrides,
} from '../src/lib/regulation-overrides.ts';
import { legalRegulations } from '../src/lib/rosters.ts';

const team = (id, regulation) => ({ id, regulation });

test('merge keeps the newer entry per id, and a newer null replaces a regulation', () => {
  const merged = mergeRegulationOverrides(
    [
      { id: 'a', regulation: 'M-A', at: 1 },
      { id: 'b', regulation: 'M-B', at: 5 },
    ],
    [
      { id: 'a', regulation: null, at: 2 },
      { id: 'b', regulation: 'M-C', at: 3 },
    ]
  );
  assert.deepEqual(merged, [
    { id: 'a', regulation: null, at: 2 },
    { id: 'b', regulation: 'M-B', at: 5 },
  ]);
});

test('overrides relabel only Unknown teams with a known roster regulation', () => {
  const catalog = {
    teams: [team('u', 'Unknown'), team('c', 'M-C'), team('n', 'Unknown')],
  };
  const result = withRegulationOverrides(catalog, [
    { id: 'u', regulation: 'M-B', at: 1 },
    { id: 'c', regulation: 'M-B', at: 1 },
    { id: 'n', regulation: null, at: 1 },
  ]);
  assert.deepEqual(result.teams[0], {
    id: 'u',
    regulation: 'M-B',
    regulationSetByUser: true,
  });
  assert.equal(result.teams[1], catalog.teams[1]);
  assert.equal(result.teams[2], catalog.teams[2]);
});

test('overrides that do not apply return the same catalog', () => {
  const catalog = { teams: [team('u', 'Unknown'), team('c', 'M-C')] };
  assert.equal(
    withRegulationOverrides(catalog, [
      { id: 'u', regulation: 'M-Z', at: 1 },
      { id: 'c', regulation: 'M-B', at: 1 },
    ]),
    catalog
  );
});

test('legalRegulations lists rosters the whole team is legal in', () => {
  const legal = legalRegulations([
    { pokemon: 'Squawkabilly', item: null, ability: null },
  ]);
  assert.ok(legal.includes('M-C'));
  assert.ok(!legal.includes('M-A'));
  assert.deepEqual(
    legalRegulations([{ pokemon: 'Maushold-Four', item: null, ability: null }]),
    ['M-C']
  );
  assert.deepEqual(
    legalRegulations([{ pokemon: 'Maushold', item: null, ability: null }]),
    ['M-A', 'M-B']
  );
});
