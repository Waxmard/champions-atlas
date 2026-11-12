import assert from 'node:assert/strict';
import test from 'node:test';
import { reducePartners } from '../scripts/sync-ladder.mjs';
import { ladderScore } from '../src/lib/ladder.ts';
import { pokemonSuggestions, swapIdeas } from '../src/lib/swap-suggestions.ts';
import { set, team } from './fixtures/swap.mjs';

const draft = [
  'Incineroar',
  'Rillaboom',
  'Sneasler',
  'Kingambit',
  'Gholdengo',
  'Dragonite',
].map((pokemon) => set(pokemon));

test('ladder files reduce to per-form teammate shares', () => {
  assert.deepEqual(
    reducePartners({
      Aegislash: {
        Abilities: { 'Stance Change': 30, Other: 20 },
        Teammates: { Rillaboom: 25, 'Raichu-Mega-Y': 5, Pikachu: 0.5 },
      },
      Unused: { Abilities: {}, Teammates: { Rillaboom: 1 } },
    }),
    { aegislashshield: { rillaboom: 0.5, raichumegay: 0.1 } }
  );
});

test('ladder score averages teammate shares across form spellings', () => {
  const shares = {
    incineroar: { rillaboom: 0.5, maushold: 0.25 },
    houndoommega: { torkoal: 0.75 },
    sceptile: { torkoal: 0.25 },
  };
  assert.equal(
    ladderScore(shares, 'Rillaboom', ['Incineroar', 'Gholdengo']),
    0.25
  );
  assert.equal(ladderScore(shares, 'Maushold-Four', ['Incineroar']), 0.25);
  assert.equal(
    ladderScore(shares, 'Torkoal', ['Houndoom', 'Sceptile-Mega']),
    0.5
  );
  assert.equal(ladderScore(shares, 'Torkoal', []), 0);
  assert.equal(ladderScore(undefined, 'Torkoal', ['Houndoom']), 0);
});

test('ladder pairings admit and rank Pokémon without a close catalog team', () => {
  const teams = [
    team('strong', [
      set('Incineroar', { item: 'Life Orb' }),
      set('Rillaboom', { item: 'Life Orb' }),
      set('Sneasler', { item: 'Life Orb' }),
      set('Garchomp', { item: 'Life Orb' }),
    ]),
    team('weak', [
      set('Gholdengo', { item: 'Life Orb' }),
      set('Gardevoir', { item: 'Life Orb' }),
    ]),
    team('far', [
      set('Torkoal', { item: 'Life Orb' }),
      set('Pelipper', { item: 'Choice Scarf' }),
    ]),
  ];
  const ladder = { incineroar: { torkoal: 0.5, gardevoir: 0.1 } };
  const rows = (options) =>
    pokemonSuggestions(
      draft.slice(0, 5),
      teams,
      'M-C',
      'Dragonite',
      undefined,
      '',
      options
    ).map(({ pokemon, sharedTeammates }) => [pokemon, sharedTeammates]);
  assert.deepEqual(rows({ limit: 30 }), [
    ['Garchomp', 3],
    ['Gardevoir', 1],
  ]);
  assert.deepEqual(rows({ limit: 30, ladder }), [
    ['Garchomp', 3],
    ['Torkoal', 0],
    ['Gardevoir', 1],
  ]);
});

test('swap ideas replace the member the ladder pairs least with the rest', () => {
  const teams = [team('far', [set('Torkoal', { item: 'Life Orb' })])];
  const ladder = { incineroar: { rillaboom: 0.5, torkoal: 0.5 } };
  assert.deepEqual(
    swapIdeas(draft, teams, 'M-C', undefined, 4, [], ladder).map(
      ({ pokemon, slot, sharedTeammates }) => [pokemon, slot, sharedTeammates]
    ),
    [['Torkoal', 2, 0]]
  );
  assert.deepEqual(swapIdeas(draft, teams, 'M-C'), []);
});

test('extended swap ideas keep the first rows and list each Pokémon once', () => {
  const teams = [
    team('strong', [
      set('Incineroar', { item: 'Life Orb' }),
      set('Rillaboom', { item: 'Life Orb' }),
      set('Sneasler', { item: 'Life Orb' }),
      set('Garchomp', { item: 'Life Orb' }),
      set('Tyranitar', { item: 'Focus Sash' }),
    ]),
    team('weak', [
      set('Gholdengo', { item: 'Life Orb' }),
      set('Gardevoir', { item: 'Choice Scarf' }),
    ]),
  ];
  const rows = (...rest) =>
    swapIdeas(draft, teams, 'M-C', undefined, ...rest).map(
      ({ pokemon, slot }) => [pokemon, slot]
    );
  assert.deepEqual(rows(1), [['Garchomp', 3]]);
  assert.deepEqual(rows(1, [], undefined, true), [
    ['Garchomp', 3],
    ['Tyranitar', 3],
    ['Gardevoir', 0],
  ]);
});
