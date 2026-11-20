import { readFileSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { battleSpecies, resolveBattleForm } from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';
import { exportPaste, setText } from '../src/lib/workbench.ts';
import {
  attr,
  classHas,
  descendants,
  text as nodeText,
} from './catalog-sources.mjs';
import { parse } from 'parse5';
import {
  admitSourceTeams,
  officialPokemonKeys,
} from './champions-eligibility.mjs';

export const pokedbName = 'Battle Database Champions';
export const pokedbUrl = 'https://champs.pokedb.tokyo/guide/opendata';
export const pokedbSeasons = [
  { season: 1, regulation: 'M-A' },
  { season: 2, regulation: 'M-A' },
  { season: 3, regulation: 'M-B' },
  { season: 4, regulation: 'M-B' },
  { season: 5, regulation: 'M-B' },
  { season: 6, regulation: 'M-C' },
  { season: 7, regulation: 'M-C' },
  { season: 8, regulation: 'M-C' },
];
export const pokedbFile = (season) => `pokedb-s${season}-single.json`;
export const pokedbFileUrl = (season) =>
  `https://champs.pokedb.tokyo/opendata/s${season}_single_ranked_teams.json`;

const { items } = JSON.parse(
  readFileSync(new URL('./data/pokedb-items.json', import.meta.url), 'utf8')
);

function fail(reason, message) {
  const error = new Error(`${pokedbName}: ${message}`);
  error.reason = reason;
  throw error;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function itemName(value) {
  if (typeof value !== 'string')
    fail('invalid_record', 'member.item must be a string');
  const raw = value.normalize('NFKC').trim();
  if (raw === '' || raw === '持ち物なし') return null;
  if (!Object.hasOwn(items, raw)) fail('unmapped_item', `Unmapped item ${raw}`);
  return items[raw];
}

function memberFrom(row, regulation, canonicalNames) {
  if (!object(row)) fail('invalid_roster', 'Member must be an object');
  const match = typeof row.id === 'string' && /^(\d{4})-(\d{2})$/.exec(row.id);
  if (!match) fail('invalid_record', 'member.id must look like 0000-00');
  const officialId = `${match[1]}-${match[2].padStart(3, '0')}`;
  const keys = officialPokemonKeys(regulation, officialId);
  if (!keys)
    fail('unresolved_species', `No ${regulation} Pokémon for ${officialId}`);
  const member = {
    pokemon: battleSpecies(keys[0]).name,
    item: itemName(row.item),
    ability: null,
    moves: [],
    nature: null,
    spread: null,
  };
  const form = resolveBattleForm(member);
  if (form.error) fail('unresolved_species', form.error);
  member.pokemon = canonicalNames.get(normalize(form.pokemon)) || form.pokemon;
  member.set = setText(member);
  return member;
}

const articleKey = (rank, rating, ids) =>
  `${rank}|${rating}|${[...ids].sort().join(',')}`;

export const pokedbArticlesUrl = (season, page) =>
  `https://champs.pokedb.tokyo/article/search?rule=0&season_start=${season}&season_end=${season}&per_page=100&page=${page}`;

const element = (node, name, ...classes) =>
  node.nodeName === name && classes.every((value) => classHas(node, value));

export function parsePokedbArticles(html, season) {
  const document = parse(html);
  let total = null;
  for (const node of descendants(document, (n) =>
    element(n, 'span', 'tag', 'is-light')
  )) {
    const match = /^([\d,]+)件$/.exec(nodeText(node).trim());
    if (match) {
      total = Number(match[1].replaceAll(',', ''));
      break;
    }
  }
  if (total === null)
    fail('invalid_source', 'Article search page has no result count');
  const articles = [];
  for (const card of descendants(document, (n) =>
    element(n, 'article', 'article-card')
  )) {
    const spans = descendants(card, (n) => n.nodeName === 'span');
    const tagged = spans.some(
      (n) =>
        classHas(n, 'tag') &&
        classHas(n, 'is-primary') &&
        nodeText(n).trim() === `シーズンM-${season}`
    );
    const rank = spans
      .map((n) => /^(\d+)位$/.exec(nodeText(n).trim()))
      .find(Boolean)?.[1];
    const part = (name) =>
      nodeText(descendants(card, (n) => classHas(n, name))[0]).trim();
    const rating = `${part('rating-integer')}${part('rating-decimal')}`;
    const ids = descendants(card, (n) => n.nodeName === 'a')
      .map((n) => /^\/pokemon\/show\/(\d{4}-\d{2})\?/.exec(attr(n, 'href')))
      .filter(Boolean)
      .map((match) => match[1]);
    if (!tagged || !rank || !/^\d+\.\d+$/.test(rating) || ids.length !== 6)
      continue;
    const trainer = descendants(card, (n) =>
      classHas(n, 'article-card-trainer')
    )[0];
    const name = nodeText(
      trainer && descendants(trainer, (n) => n.nodeName === 'p')[0]
    ).trim();
    const href = attr(
      descendants(card, (n) => element(n, 'a', 'card-footer-item'))[0] ?? {},
      'href'
    );
    let url = '';
    try {
      if (['https:', 'http:'].includes(new URL(href).protocol)) url = href;
    } catch {
      url = '';
    }
    articles.push({
      key: articleKey(Number(rank), Number(rating), ids),
      creator: name.length > 60 || /\p{Cc}/u.test(name) ? '' : name,
      url,
    });
  }
  return { total, articles };
}

function catalogTeam(
  row,
  { season, regulation, publishedAt, articles },
  id,
  canonicalNames
) {
  const rating = row.rating_value;
  if (
    rating !== null &&
    rating !== undefined &&
    (typeof rating !== 'number' || !Number.isFinite(rating) || rating <= 0)
  )
    fail('invalid_record', 'rating_value must be a finite positive number');
  if (
    !Array.isArray(row.team) ||
    row.team.length !== 6 ||
    !row.team.every(object)
  )
    fail('invalid_roster', 'Roster must contain exactly six members');
  const members = row.team.map((member) =>
    memberFrom(member, regulation, canonicalNames)
  );
  if (new Set(members.map((member) => normalize(member.pokemon))).size !== 6)
    fail('invalid_roster', 'Roster contains duplicate canonical species');
  const article = articles.get(
    articleKey(
      row.rank,
      rating,
      row.team.map((member) => member.id)
    )
  );
  const sourceUrl = article?.url || pokedbUrl;
  const event = `Champions ranked battles — Season M-${season}`;
  const reports = [{ event, rank: `Season finish #${row.rank}`, sourceUrl }];
  if (rating !== null && rating !== undefined)
    reports.push({ event, rank: `${rating} rating`, sourceUrl });
  reports.push({
    event: 'Battle Database Champions collection',
    rank: '',
    sourceUrl: pokedbUrl,
  });
  return {
    id,
    sheetIds: [],
    name: `Season M-${season} singles — Rank ${row.rank}`,
    creator: article?.creator ?? '',
    regulation,
    publishedAt,
    pasteUrl: '',
    replicaCode: null,
    replicaStatus: '',
    reports,
    members,
    paste: members.some((member) => member.item) ? exportPaste(members) : null,
    pasteNotes: null,
    format: 'singles',
  };
}

export function parsePokedb(
  text,
  { season, regulation },
  canonicalNames = new Map(),
  articles = new Map()
) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('invalid_source', 'File is not valid JSON');
  }
  if (
    !object(data) ||
    data.season_number !== season ||
    data.season !== `M-${season}` ||
    data.rule !== 'シングル' ||
    !Array.isArray(data.teams)
  )
    fail('invalid_source', `File is not the season ${season} singles file`);
  const publishedAt = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}$/.exec(
    data.updated_at
  )?.[1];
  if (
    !publishedAt ||
    Number.isNaN(Date.parse(publishedAt)) ||
    new Date(publishedAt).toISOString().slice(0, 10) !== publishedAt
  )
    fail(
      'invalid_source',
      'updated_at must be a YYYY-MM-DD HH:MM:SS timestamp'
    );
  const teams = [];
  const skipped = [];
  const seen = new Map();
  for (const row of data.teams) {
    try {
      const rank = row?.rank;
      if (!Number.isSafeInteger(rank) || rank < 1 || rank > 9999)
        fail('invalid_record', 'rank must be an integer from 1 to 9999');
      const rows = seen.get(rank) ?? [];
      if (rows.some((other) => isDeepStrictEqual(other, row))) continue;
      rows.push(row);
      seen.set(rank, rows);
      const id =
        `pokedb-single-s${season}-${rank}` +
        (rows.length > 1 ? `-${rows.length}` : '');
      teams.push(
        catalogTeam(
          row,
          { season, regulation, publishedAt, articles },
          id,
          canonicalNames
        )
      );
    } catch (error) {
      skipped.push({
        id: String(row?.rank ?? ''),
        source: `s${season}`,
        reason: error.reason || 'invalid_record',
        message: error.message,
      });
    }
  }
  if (data.teams.length && !teams.length)
    fail('invalid_source', 'Every record was rejected');
  return { teams, skipped };
}

async function loadArticles(fetchCached, season, text, cache) {
  const pages = [];
  try {
    const stamp = JSON.parse(text).updated_at.replace(/\D/g, '');
    let total = 1;
    for (let page = 1; page <= Math.min(20, Math.ceil(total / 100)); page++) {
      const html = await fetchCached(
        `pokedb-s${season}-articles-${stamp}-${page}.html`,
        pokedbArticlesUrl(season, page),
        (value) => {
          const parsed = parsePokedbArticles(value, season);
          if (page === 1) total = parsed.total;
        },
        false,
        { optional: true }
      );
      if (html === null) break;
      pages.push(html);
    }
    if (cache) {
      const prefix = `pokedb-s${season}-articles-`;
      for (const file of await readdir(cache))
        if (file.startsWith(prefix) && !file.startsWith(`${prefix}${stamp}-`))
          await rm(join(cache, file));
    }
  } catch (error) {
    console.warn(
      `${pokedbName}: write-up links unavailable for season ${season} (${error.message})`
    );
    return [];
  }
  return pages;
}

export async function loadPokedb(
  fetchCached,
  { fullHistory, currentRegulation, refresh, cache }
) {
  const files = [];
  for (const entry of pokedbSeasons) {
    if (!fullHistory && entry.regulation !== currentRegulation) continue;
    const text = await fetchCached(
      pokedbFile(entry.season),
      pokedbFileUrl(entry.season),
      (value) => parsePokedb(value, entry),
      refresh,
      { optional: true }
    );
    if (text === null) continue;
    const articles = await loadArticles(fetchCached, entry.season, text, cache);
    files.push({ ...entry, text, articles });
  }
  return files;
}

export function admitPokedb(files, canonicalNames, options) {
  const teams = [];
  const skipped = [];
  for (const file of files) {
    const articles = new Map();
    const repeated = new Set();
    for (const html of file.articles ?? [])
      for (const { key, creator, url } of parsePokedbArticles(html, file.season)
        .articles) {
        if (articles.has(key)) repeated.add(key);
        articles.set(key, { creator, url });
      }
    for (const key of repeated) articles.delete(key);
    const parsed = parsePokedb(file.text, file, canonicalNames, articles);
    teams.push(...parsed.teams);
    skipped.push(...parsed.skipped);
  }
  return admitSourceTeams(pokedbName, { teams, skipped }, options);
}
