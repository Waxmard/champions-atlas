import assert from 'node:assert/strict';
import test from 'node:test';
import { movepoolFor } from '../src/lib/movepools.ts';
import { catalogSuggestions } from '../src/lib/workbench.ts';

const salamence = {
  pokemon: 'Salamence',
  item: null,
  ability: null,
  nature: 'Timid',
  spread: '2 HP / 32 SpA / 32 Spe',
  moves: [],
};

test('movepools cover the roster from each newest learnset', () => {
  assert.ok(movepoolFor('Salamence').includes('Hyper Voice'));
  assert.ok(!movepoolFor('Salamence').includes('Pursuit'));
  assert.deepEqual(movepoolFor('Salamence-Mega'), movepoolFor('salamence'));
  assert.deepEqual(movepoolFor('Pokemon0'), []);
});

test('a species without a gen 9 learnset keeps its newest movepool', () => {
  assert.ok(movepoolFor('Beedrill').includes('Poison Jab'));
  assert.ok(movepoolFor('Beedrill').includes('Pursuit'));
});

test('movepools feed move suggestions without catalog teams', () => {
  const moves = catalogSuggestions(salamence, [], 'M-C').moves.map(
    (option) => option.value
  );
  assert.ok(moves.length >= 20);
  assert.ok(moves.includes('Hyper Voice'));
});
