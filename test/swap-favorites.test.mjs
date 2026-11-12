import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pokemonSuggestions,
  swapIdeas,
  swapSuggestions,
  swapTargets,
} from '../src/lib/swap-suggestions.ts';
import { set, team } from './fixtures/swap.mjs';

test('swap ideas rank Favorites with catalog suggestions and fill from weaker fits', () => {
  const draft = [
    'Incineroar',
    'Rillaboom',
    'Sneasler',
    'Kingambit',
    'Gholdengo',
    'Dragonite',
  ].map((pokemon) => set(pokemon));
  const strong = (id) =>
    team(id, [
      set('Incineroar'),
      set('Rillaboom'),
      set('Sneasler'),
      set('Garchomp', { item: 'Life Orb' }),
    ]);
  const weavile = set('Weavile', { item: 'Life Orb' });
  const favClose = {
    id: 'fav-close',
    name: 'Fav Close',
    members: [
      set('Incineroar'),
      set('Rillaboom'),
      set('Sneasler'),
      set('Kingambit'),
      weavile,
    ],
  };
  const favEven = {
    id: 'fav-even',
    name: 'Fav Even',
    members: [set('Incineroar'), set('Rillaboom'), set('Sneasler'), weavile],
  };
  const favWeak = {
    id: 'fav-weak',
    name: 'Fav Weak',
    members: [set('Gholdengo'), set('Pelipper', { item: 'Life Orb' })],
  };
  const rows = (ideas) =>
    ideas.map((idea) => [idea.pokemon, Boolean(idea.favorite)]);

  assert.deepEqual(
    rows(
      swapIdeas(draft, [strong('strong')], 'M-C', undefined, 4, [
        favClose,
        favWeak,
      ])
    ),
    [
      ['Weavile', true],
      ['Garchomp', false],
      ['Pelipper', true],
    ]
  );
  assert.deepEqual(
    rows(
      swapIdeas(
        draft,
        [strong('strong'), strong('strong-2')],
        'M-C',
        undefined,
        4,
        [favEven, favWeak]
      )
    ),
    [
      ['Garchomp', false],
      ['Weavile', true],
      ['Pelipper', true],
    ]
  );
});

test('Favorite sets rank with catalog rows without averaging and preserve catalog limit', () => {
  const sn = set('Sneasler', { item: 'Focus Sash' });
  const kg = set('Kingambit');
  const teammates = [sn, kg];
  const mvs = ['Protect', 'Tackle', 'Rest', 'Sleep Talk'];
  const favA = {
    id: 'fav-a',
    name: 'Fav Alpha',
    members: [
      sn,
      set('Weavile', { item: 'Choice Band', ability: 'Pressure', moves: mvs }),
    ],
  };
  const favB = {
    id: 'fav-b',
    name: 'Fav Beta',
    members: [
      sn,
      kg,
      set('Weavile', {
        item: 'Clear Amulet',
        ability: 'Pickpocket',
        moves: mvs,
      }),
    ],
  };
  const favZero = {
    id: 'fav-zero',
    name: 'Fav Zero',
    members: [
      set('Pelipper', { item: 'Damp Rock', ability: 'Drizzle', moves: mvs }),
    ],
  };
  const species = ['Gholdengo', 'Incineroar', 'Rillaboom', 'Rotom-Wash'];
  const catTeams = species.map((sp, i) =>
    team(`cat-${i}`, [
      sn,
      set(sp, { item: 'Life Orb', ability: 'Pressure', moves: mvs }),
      set('Weavile', { item: 'Life Orb', ability: 'Pressure', moves: mvs }),
    ])
  );
  const res = pokemonSuggestions(
    teammates,
    catTeams,
    'M-C',
    undefined,
    undefined,
    '',
    { minShared: 1, limit: 3 },
    [favA, favB, favZero]
  );
  assert.equal(res.length, 5);
  assert.deepEqual(
    res.slice(0, 3).map((r) => [r.pokemon, r.favoriteTeamName, r.member.item]),
    [
      ['Weavile', 'Fav Beta', 'Clear Amulet'],
      ['Weavile', undefined, 'Life Orb'],
      ['Weavile', 'Fav Alpha', 'Choice Band'],
    ]
  );
  assert.equal(res.filter((r) => !r.favorite).length, 3);

  const queried = pokemonSuggestions(
    teammates,
    catTeams,
    'M-C',
    undefined,
    undefined,
    'pelip',
    { minShared: 1, limit: 3 },
    [favZero]
  );
  assert.equal(queried.length, 1);
  assert.equal(queried[0].pokemon, 'Pelipper');
  assert.equal(queried[0].favorite, true);
  assert.deepEqual(swapTargets(teammates, [], 'M-C', [favZero]), ['Pelipper']);

  const roster = [sn, kg, set('Garchomp', { item: 'Rocky Helmet' })];
  const specific = swapSuggestions(
    roster,
    catTeams,
    'M-C',
    'Pelipper',
    undefined,
    [favZero]
  );
  assert.equal(specific.length, 3);
  assert.ok(
    specific.every((s) => s.favorite && s.favoriteTeamName === 'Fav Zero')
  );
});
