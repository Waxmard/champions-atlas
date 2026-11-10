import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareBrowseTeams,
  compareTeams,
  voteWeights,
} from '../src/lib/catalog.ts';
import { RECENCY_WINDOW_DAYS, recencyPeriod } from '../src/lib/recency.ts';
import { pokemonSuggestions } from '../src/lib/swap-suggestions.ts';
import { catalogSuggestions } from '../src/lib/workbench.ts';
import { set, team } from './fixtures/swap.mjs';

const dayIn = (window, offset = 0) =>
  new Date((window * RECENCY_WINDOW_DAYS + offset) * 86_400_000)
    .toISOString()
    .slice(0, 10);
const W = 740;

const ranked = (rank) => [
  { event: 'Champions ranked battles', rank, sourceUrl: '' },
];
const ladder = (id, rank, window) => ({
  id,
  regulation: 'M-C',
  publishedAt: dayIn(window),
  reports: ranked(rank),
  members: [],
});
const tier = ladder('tier', 'Champion Tier', W);
const mb2 = (n) => ladder('mb2', 'Master Ball 2', W + n);
const plain = {
  id: 'plain',
  regulation: 'M-C',
  publishedAt: dayIn(W),
  reports: [],
  members: [],
};
const first = (compare, a, b) => (compare(a, b, 'M-C') < 0 ? a.id : b.id);

const teammates = [set('Sneasler'), set('Kingambit'), set('Gholdengo')];
const dated = (prefix, count, window, members, reports = []) =>
  Array.from({ length: count }, (_, i) =>
    team(prefix + i, members, { publishedAt: dayIn(window), reports })
  );

test('recencyPeriod maps share dates to fixed windows and unknown dates to zero', () => {
  assert.equal(recencyPeriod(''), 0);
  assert.equal(recencyPeriod('not a date'), 0);
  assert.equal(recencyPeriod(dayIn(W)), W);
  assert.equal(recencyPeriod(dayIn(W, 27)), W);
  assert.equal(recencyPeriod(dayIn(W + 1)), W + 1);
});

test('each window of age costs one achievement band in both comparators', () => {
  assert.equal(first(compareTeams, tier, mb2(2)), 'tier');
  assert.equal(first(compareTeams, tier, mb2(3)), 'tier');
  assert.equal(first(compareTeams, tier, mb2(4)), 'mb2');
  assert.equal(first(compareBrowseTeams, tier, mb2(4)), 'tier');
  assert.equal(first(compareBrowseTeams, tier, mb2(5)), 'tier');
  assert.equal(first(compareBrowseTeams, tier, mb2(6)), 'mb2');
});

test('a team without a share date ranks as oldest', () => {
  const undated = { ...tier, publishedAt: '' };
  assert.equal(first(compareTeams, undated, plain), 'plain');
  assert.equal(first(compareBrowseTeams, undated, plain), 'plain');
});

test('Pokémon support halves for each window of age', () => {
  const all = [
    ...dated('g', 3, W - 2, [
      ...teammates,
      set('Gardevoir', { item: 'Life Orb' }),
    ]),
    ...dated('f', 1, W, [...teammates, set('Froslass', { item: 'Life Orb' })]),
  ];
  const rows = pokemonSuggestions(teammates, all, 'M-C');
  assert.equal(rows[0].pokemon, 'Froslass');
  assert.equal(rows[0].support, 1);
  assert.equal(rows[1].pokemon, 'Gardevoir');
  assert.equal(rows[1].support, 0.75);
});

test('recent sets outvote a larger number of older sets', () => {
  const rillaboom = (item) =>
    set('Rillaboom', { item, ability: 'Grassy Surge' });
  const all = [
    ...dated('old', 3, W - 2, [...teammates, rillaboom('Miracle Seed')]),
    ...dated('new', 2, W, [...teammates, rillaboom('Life Orb')]),
  ];
  const [row] = pokemonSuggestions(teammates, all, 'M-C');
  assert.equal(row.pokemon, 'Rillaboom');
  assert.equal(row.member.item, 'Life Orb');
  assert.equal(row.support, 2.75);
});

test('field suggestions weight each team by recency', () => {
  const all = [
    ...dated('old', 3, W - 2, [set('Incineroar', { item: 'Life Orb' })]),
    ...dated('new', 1, W, [set('Incineroar')]),
  ];
  assert.deepEqual(
    catalogSuggestions(set('Incineroar'), all, 'M-C')
      .items.slice(0, 2)
      .map(({ value }) => value),
    ['Leftovers', 'Life Orb']
  );
});

test('a vote halves for each band or window behind the best team', () => {
  const weigh = (...teams) => teams.map(voteWeights(teams, 'M-C'));
  assert.deepEqual(weigh(tier, mb2(0), plain), [1, 0.125, 0.0078125]);
  assert.deepEqual(weigh(tier, mb2(3)), [1, 1]);
  assert.deepEqual(weigh(tier, mb2(4)), [0.5, 1]);
  assert.deepEqual(weigh(plain), [1]);
});

test('field suggestions weight each team by its result', () => {
  const topItem = (count) =>
    catalogSuggestions(
      set('Incineroar'),
      [
        ...dated(
          'mb2-',
          count,
          W,
          [set('Incineroar', { item: 'Life Orb' })],
          ranked('Master Ball 2')
        ),
        ...dated('tier-', 1, W, [set('Incineroar')], ranked('Champion Tier')),
      ],
      'M-C'
    ).items[0].value;
  assert.equal(topItem(7), 'Leftovers');
  assert.equal(topItem(9), 'Life Orb');
});

test('better-placed sets outvote a larger number of weaker ones', () => {
  const rillaboom = (item) =>
    set('Rillaboom', { item, ability: 'Grassy Surge' });
  const all = [
    ...dated(
      'mb2-',
      3,
      W,
      [...teammates, rillaboom('Miracle Seed')],
      ranked('Master Ball 2')
    ),
    ...dated(
      'tier-',
      2,
      W,
      [...teammates, rillaboom('Life Orb')],
      ranked('Champion Tier')
    ),
  ];
  const [row] = pokemonSuggestions(teammates, all, 'M-C');
  assert.equal(row.pokemon, 'Rillaboom');
  assert.equal(row.member.item, 'Life Orb');
  assert.equal(row.support, 2.375);
});

test('teams of unknown regulation are counted but do not vote', () => {
  const unknown = dated(
    'unknown-',
    2,
    W,
    [set('Incineroar', { item: 'Life Orb' })],
    ranked('Champion Tier')
  ).map((entry) => ({ ...entry, regulation: 'Unknown' }));
  const { items } = catalogSuggestions(
    set('Incineroar'),
    [...unknown, ...dated('plain-', 1, W, [set('Incineroar')])],
    'M-C'
  );
  assert.deepEqual(
    items.slice(0, 2).map(({ value, totalCount }) => [value, totalCount]),
    [
      ['Leftovers', 1],
      ['Life Orb', 2],
    ]
  );
});
