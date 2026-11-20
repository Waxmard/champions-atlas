import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBrowseTeams } from '../src/lib/catalog.ts';
import {
  parsePokedb,
  parsePokedbArticles,
  pokedbUrl,
} from '../scripts/pokedb-source.mjs';
import { pokedbFile, pokedbRoster } from './fixtures/catalog-import.mjs';

const entry = { season: 7, regulation: 'M-C' };
const row = (rank, team = pokedbRoster) => ({
  rank,
  rating_value: 2548.304,
  team,
});
const withFirst = (member) => [
  { ...pokedbRoster[0], ...member },
  ...pokedbRoster.slice(1),
];

test('maps a ranked singles file to a catalog team', () => {
  const { teams, skipped } = parsePokedb(pokedbFile(), entry);
  assert.deepEqual(skipped, []);
  assert.equal(teams.length, 1);
  const [team] = teams;
  assert.equal(team.id, 'pokedb-single-s7-1');
  assert.equal(team.name, 'Season M-7 singles — Rank 1');
  assert.equal(team.format, 'singles');
  assert.equal(team.regulation, 'M-C');
  assert.equal(team.creator, '');
  assert.equal(team.publishedAt, '2026-11-19');
  const event = 'Champions ranked battles — Season M-7';
  assert.deepEqual(team.reports, [
    { event, rank: 'Season finish #1', sourceUrl: pokedbUrl },
    { event, rank: '2548.304 rating', sourceUrl: pokedbUrl },
    {
      event: 'Battle Database Champions collection',
      rank: '',
      sourceUrl: pokedbUrl,
    },
  ]);
  assert.equal(team.members[0].item, 'Sitrus Berry');
  const byName = (name) =>
    team.members.find((member) => member.pokemon === name);
  assert.equal(byName('Lucario-Mega-Z')?.item, 'Lucarionite Z');
  assert.equal(byName('Slowking-Galar')?.item, null);
  assert.equal(team.members[5].item, null);
  assert.equal(typeof team.paste, 'string');
});

test('skips rows with an unmapped item or unknown species', () => {
  const { teams, skipped } = parsePokedb(
    pokedbFile([
      row(1),
      row(2, withFirst({ item: 'ふしぎなどうぐ' })),
      row(3, withFirst({ id: '9999-00' })),
    ]),
    entry
  );
  assert.deepEqual(
    teams.map(({ id }) => id),
    ['pokedb-single-s7-1']
  );
  assert.deepEqual(
    skipped.map(({ id, reason }) => [id, reason]),
    [
      ['2', 'unmapped_item'],
      ['3', 'unresolved_species'],
    ]
  );
  assert.match(skipped[0].message, /ふしぎなどうぐ/);
});

test('rejects a file for another season or rule', () => {
  assert.throws(
    () => parsePokedb(pokedbFile(undefined, 6), entry),
    (error) => error.reason === 'invalid_source'
  );
  const doubles = JSON.parse(pokedbFile());
  doubles.rule = 'ダブル';
  assert.throws(
    () => parsePokedb(JSON.stringify(doubles), entry),
    (error) => error.reason === 'invalid_source'
  );
  for (const value of [undefined, '2026-11-19', '2026-02-30 00:00:00']) {
    const file = JSON.parse(pokedbFile());
    file.updated_at = value;
    assert.throws(
      () => parsePokedb(JSON.stringify(file), entry),
      (error) => error.reason === 'invalid_source'
    );
  }
});

test('a dated season finish outranks a newer unranked post in Browse', () => {
  const [team] = parsePokedb(pokedbFile(), entry).teams;
  const post = {
    ...team,
    id: 'post',
    publishedAt: '2026-11-20',
    reports: [
      {
        event: 'Champions ranked battles',
        rank: '',
        sourceUrl: 'https://x.com/a/status/1',
      },
    ],
  };
  assert.ok(compareBrowseTeams(team, post, 'M-C') < 0);
});

test('gives shared ranks distinct ids and drops exact duplicates', () => {
  const other = withFirst({ id: '0006-00', item: 'いのちのたま' });
  const { teams } = parsePokedb(
    pokedbFile([row(626), row(626, other), row(626)]),
    entry
  );
  assert.deepEqual(
    teams.map(({ id }) => id),
    ['pokedb-single-s7-626', 'pokedb-single-s7-626-2']
  );
});

test('throws when every row is rejected', () => {
  assert.throws(
    () => parsePokedb(pokedbFile([row(1, pokedbRoster.slice(1))]), entry),
    (error) => error.reason === 'invalid_source'
  );
});

const articleCard = ({
  tag = 'シーズンM-7',
  rank = 1,
  whole = '2548',
  fraction = '.304',
  player = 'Claire',
  ids = pokedbRoster.map(({ id }) => id),
  href = 'https://example.com/report',
} = {}) =>
  `<article class="card article-card"><span class="tag is-primary">${tag}</span><span>${rank}位</span><span class="rating-integer">${whole}</span><span class="rating-decimal">${fraction}</span><div class="article-card-trainer"><p>${player}</p></div>${ids.map((id) => `<a href="/pokemon/show/${id}?rule=0"></a>`).join('')}<footer><a class="card-footer-item" href="${href}"></a></footer></article>`;
const articlePage = (cards, total = cards.length) =>
  `<span class="tag is-light">${total}件</span>${cards.map(articleCard).join('')}`;
const withArticles = (cards) => {
  const { articles } = parsePokedbArticles(articlePage(cards), 7);
  const map = new Map(articles.map(({ key, ...rest }) => [key, rest]));
  return parsePokedb(pokedbFile(), entry, new Map(), map).teams[0];
};

test('attaches the player and write-up to the matching team', () => {
  const page = articlePage([{}]);
  assert.equal(parsePokedbArticles(page, 7).total, 1);
  const team = withArticles([{}]);
  assert.equal(team.creator, 'Claire');
  assert.equal(team.reports[0].sourceUrl, 'https://example.com/report');
  assert.equal(team.reports[1].sourceUrl, 'https://example.com/report');
  assert.equal(team.reports.at(-1).sourceUrl, pokedbUrl);
});

test('ignores cards that do not match the team', () => {
  const team = withArticles([
    { tag: '公式大会' },
    { fraction: '.305' },
    { rank: 2 },
  ]);
  assert.equal(team.creator, '');
  assert.ok(team.reports.every(({ sourceUrl }) => sourceUrl === pokedbUrl));
  const unsafe = withArticles([{ href: 'javascript:alert(1)' }]);
  assert.equal(unsafe.creator, 'Claire');
  assert.ok(unsafe.reports.every(({ sourceUrl }) => sourceUrl === pokedbUrl));
});

test('rejects a page without a result count', () => {
  assert.throws(
    () => parsePokedbArticles('<html></html>', 7),
    (error) => error.reason === 'invalid_source'
  );
});
