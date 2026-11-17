import assert from 'node:assert/strict';
import test from 'node:test';
import { pokemonId } from '../src/lib/catalog.ts';
import { formatVp, setVpCost, teamVpCost } from '../src/lib/vp-cost.ts';

const weavile = {
  pokemon: 'Weavile',
  item: 'Focus Sash',
  ability: 'Pressure',
  moves: ['Fake Out', 'Knock Off', 'Ice Shard', 'Protect'],
  nature: 'Jolly',
  spread: '32 Atk / 32 Spe / 2 HP',
};

test('set VP cost prices retraining from the in-game set', () => {
  assert.deepEqual(setVpCost(weavile, structuredClone(weavile)), {
    vp: 0,
    recorded: true,
  });
  assert.equal(
    setVpCost(weavile, {
      ...weavile,
      moves: ['Protect', 'Fake Out', 'Knock Off', 'Triple Axel'],
      nature: 'Adamant',
      ability: 'Pickpocket',
      spread: '32 HP / 32 Atk / 2 Spe',
    }).vp,
    1400
  );
  assert.equal(setVpCost(weavile, { ...weavile, item: 'Life Orb' }).vp, 0);
  assert.equal(
    setVpCost(
      { ...weavile, nature: 'Hardy' },
      { ...weavile, nature: 'Serious' }
    ).vp,
    0
  );
  assert.equal(
    setVpCost(weavile, {
      ...weavile,
      ability: null,
      nature: null,
      moves: [],
      spread: null,
    }).vp,
    0
  );
  assert.deepEqual(setVpCost(undefined, weavile), {
    vp: 1500,
    recorded: false,
  });
});

test('set VP cost ignores a Mega ability listed on a Mega-named member', () => {
  const salamence = {
    ...weavile,
    pokemon: 'Salamence',
    item: 'Salamencite',
    ability: 'Intimidate',
  };
  assert.equal(
    setVpCost(salamence, {
      ...salamence,
      pokemon: 'Salamence-Mega',
      ability: 'Aerilate',
    }).vp,
    0
  );
  assert.equal(
    setVpCost(salamence, {
      ...salamence,
      item: 'Leftovers',
      ability: 'Moxie',
    }).vp,
    500
  );
});

test('team VP cost looks up in-game sets by Browse identity', () => {
  const garchomp = {
    pokemon: 'Garchomp',
    item: 'Garchompite',
    ability: 'Rough Skin',
    moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
    nature: 'Jolly',
    spread: '32 Atk / 32 Spe / 2 HP',
  };
  const pikachu = { ...weavile, pokemon: 'Pikachu', ability: 'Static' };
  const cost = teamVpCost(
    [
      { id: pokemonId('Weavile'), member: weavile },
      { id: pokemonId('Garchomp'), member: garchomp },
    ],
    [
      {
        ...weavile,
        moves: ['Fake Out', 'Knock Off', 'Ice Shard', 'Triple Axel'],
      },
      { ...garchomp, pokemon: 'Garchomp-Mega' },
      pikachu,
    ]
  );
  assert.equal(cost.total, 1750);
  assert.equal(cost.unrecorded, 1);
  assert.deepEqual(
    cost.members.map(({ vp }) => vp),
    [250, 0, 1500]
  );
  assert.equal(formatVp(9000, true), '≈ 9,000 VP');
  assert.equal(formatVp(0, false), '0 VP');
});
