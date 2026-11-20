import assert from 'node:assert/strict';
import test from 'node:test';
import { pokemonId } from '../src/lib/catalog.ts';
import { unrecordedMembers } from '../src/lib/current-sets.ts';
import {
  formatVp,
  setVpCost,
  sortByVpCost,
  teamVpCost,
} from '../src/lib/vp-cost.ts';
import { set, team } from './fixtures/swap.mjs';

const weavile = {
  pokemon: 'Weavile',
  item: 'Focus Sash',
  ability: 'Pressure',
  moves: ['Fake Out', 'Knock Off', 'Ice Shard', 'Protect'],
  nature: 'Jolly',
  spread: '32 Atk / 32 Spe / 2 HP',
};
const emptyCatalog = { teams: [], currentRegulation: 'M-C' };

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
    ],
    emptyCatalog
  );
  assert.equal(cost.total, 1750);
  assert.equal(cost.unrecorded, 1);
  assert.equal(cost.estimated, 0);
  assert.equal(formatVp(9000), '9,000 VP');
  assert.equal(formatVp(0), '0 VP');
});

test('VP sort orders teams cheapest first and keeps ties in order', () => {
  const sets = [{ id: pokemonId('Weavile'), member: weavile }];
  const a = { id: 'a', members: [{ ...weavile, pokemon: 'Pikachu' }] };
  const b = { id: 'b', members: [weavile] };
  const c = { id: 'c', members: [{ ...weavile, pokemon: 'Pikachu' }] };
  const teams = [a, b, c];
  assert.deepEqual(
    sortByVpCost(teams, sets, emptyCatalog).map(({ id }) => id),
    ['b', 'a', 'c']
  );
  assert.deepEqual(teams, [a, b, c]);
  assert.deepEqual(
    sortByVpCost(teams, null, emptyCatalog).map(({ id }) => id),
    ['a', 'b', 'c']
  );
});

test('team VP cost estimates stats for a new nature with no EVs listed', () => {
  const sets = [{ id: pokemonId('Weavile'), member: weavile }];
  const catalog = {
    teams: [
      team('source', [
        set('Weavile', {
          item: 'Focus Sash',
          ability: 'Pressure',
          moves: weavile.moves,
          nature: 'Adamant',
          spread: '32 HP / 32 Atk / 2 Spe',
        }),
      ]),
    ],
    currentRegulation: 'M-C',
  };
  const cost = (nature) =>
    teamVpCost(sets, [{ ...weavile, nature, spread: null }], catalog).total;
  assert.equal(cost('Adamant'), 650);
  assert.equal(cost('Jolly'), 0);
  assert.equal(cost(null), 650);
});

test('team VP cost fills a roster-only member from catalog sets', () => {
  const sets = [{ id: pokemonId('Weavile'), member: weavile }];
  const bare = {
    pokemon: 'Weavile',
    item: 'Focus Sash',
    ability: null,
    moves: [],
    nature: null,
    spread: null,
  };
  const source = team('source', [
    set('Weavile', {
      item: 'Focus Sash',
      ability: 'Pickpocket',
      moves: ['Fake Out', 'Knock Off', 'Ice Shard', 'Triple Axel'],
      nature: 'Adamant',
      spread: '32 HP / 32 Atk / 2 Spe',
    }),
  ]);
  assert.deepEqual(
    teamVpCost(sets, [bare], { teams: [source], currentRegulation: 'M-C' }),
    { total: 1400, unrecorded: 0, estimated: 1 }
  );
  assert.equal(
    teamVpCost(sets, [bare], {
      teams: [],
      allTeams: [source],
      currentRegulation: 'M-C',
    }).total,
    1400
  );
  assert.deepEqual(teamVpCost(sets, [bare], emptyCatalog), {
    total: 0,
    unrecorded: 0,
    estimated: 0,
  });
  assert.equal(
    teamVpCost(sets, [bare], {
      teams: [team('same', [structuredClone(weavile)])],
      currentRegulation: 'M-C',
    }).total,
    0
  );
});

test('unrecorded members skip recorded Pokémon and take the first team', () => {
  const pikachu = { ...weavile, pokemon: 'Pikachu', ability: 'Static' };
  const garchomp = { ...weavile, pokemon: 'Garchomp-Mega' };
  assert.deepEqual(
    unrecordedMembers(
      [{ id: pokemonId('Weavile'), member: weavile }],
      [
        { members: [weavile, pikachu] },
        {
          members: [
            { ...pikachu, ability: 'Lightning Rod' },
            garchomp,
            { ...weavile, pokemon: 'Garchomp' },
          ],
        },
      ]
    ),
    [pikachu, garchomp]
  );
});
