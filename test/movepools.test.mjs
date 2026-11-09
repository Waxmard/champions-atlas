import assert from 'node:assert/strict';
import test from 'node:test';
import {
  abilitiesFor,
  championsItemsFor,
  movepoolFor,
} from '../src/lib/movepools.ts';
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

test('movepools include pre-evolution egg moves and parent form learnsets', () => {
  assert.ok(movepoolFor('Incineroar').includes('Fake Out'));
  assert.ok(movepoolFor('Incineroar').includes('Parting Shot'));
  assert.ok(movepoolFor('Kingambit').includes('Sucker Punch'));
  assert.ok(movepoolFor('Rotom-Wash').includes('Hydro Pump'));
  assert.ok(movepoolFor('Rotom-Wash').includes('Volt Switch'));
  assert.ok(movepoolFor('Aegislash-Shield').length > 0);
  assert.ok(movepoolFor('Maushold-Four').length > 0);
});

test('abilitiesFor and championsItemsFor return valid species options', () => {
  assert.deepEqual(abilitiesFor('Incineroar'), ['Blaze', 'Intimidate']);
  assert.ok(abilitiesFor('Mawile').includes('Huge Power'));
  assert.ok(abilitiesFor('Mawile').includes('Intimidate'));
  assert.deepEqual(abilitiesFor('Pokemon0'), []);

  const pikachuItems = championsItemsFor('Pikachu');
  assert.ok(pikachuItems.includes('Light Ball'));
  assert.ok(pikachuItems.includes('Focus Sash'));
  assert.ok(!pikachuItems.includes('Charizardite X'));
  assert.ok(!pikachuItems.includes('Heavy-Duty Boots'));

  const charizardItems = championsItemsFor('Charizard');
  assert.ok(charizardItems.includes('Charizardite X'));
  assert.ok(charizardItems.includes('Charizardite Y'));

  const megaXItems = championsItemsFor('Charizard-Mega-X');
  assert.ok(megaXItems.includes('Charizardite X'));
  assert.ok(!megaXItems.includes('Charizardite Y'));
});

test('movepools feed move suggestions without catalog teams', () => {
  const suggestions = catalogSuggestions(salamence, [], 'M-C');
  const moves = suggestions.moves.map((option) => option.value);
  assert.ok(moves.length >= 20);
  assert.ok(moves.includes('Hyper Voice'));
});
