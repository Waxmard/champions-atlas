import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { parse as parseCsvRecords } from 'csv-parse/sync';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePaste } from '../src/lib/paste.ts';
import {
  assetSlug as slug,
  basePokemon as base,
  pokemonIndex,
  syncItems,
  syncSprites,
  validateIndex,
} from './sync-assets.mjs';

export const sheet =
  'https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';
const tabs = { 'M-C': '2001945654', 'M-B': '1458357160' };
export function parseCsv(text) {
  return parseCsvRecords(text, {
    relax_column_count: true,
    record_delimiter: ['\r\n', '\n', '\r'],
  });
}

const value = (text = '') =>
  ['-', 'None', 'N/A', 'No Tweet', 'Discord Submission'].includes(text.trim())
    ? ''
    : text.trim();
function url(text, host) {
  if (!value(text)) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`Invalid ${host} URL`);
  }
  if (
    host === 'pokepast.es' &&
    parsed.hostname === host &&
    parsed.protocol === 'http:'
  )
    parsed.protocol = 'https:';
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (host && parsed.hostname !== host)
  )
    throw new Error(`Unexpected source URL: ${text}`);
  return parsed.href;
}

function date(text) {
  if (!text) return '';
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(text);
  const month =
    match &&
    [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ].indexOf(match[2]);
  if (!match || month < 0) throw new Error(`Unexpected date: ${text}`);
  const result = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  if (result.getUTCMonth() !== month) throw new Error(`Invalid date: ${text}`);
  return result.toISOString().slice(0, 10);
}

export function parseSheet(text, regulation) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => row[0] === 'Team ID');
  if (headerIndex < 0) throw new Error('Team sheet header missing');
  const header = rows[headerIndex];
  const column = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Missing sheet column: ${name}`);
    return index;
  };
  const pokemonStart = column('Pokemon Text for Copypasta');
  const teams = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const field = (name) => value(row[column(name)]);
      if (!new RegExp(`^${regulation.replace('-', '')}\\d+$`).test(row[0]))
        throw new Error(`Unexpected team ID: ${row[0]}`);
      const members = Array.from({ length: 6 }, (_, i) => {
        const pokemon = value(row[pokemonStart + i]);
        if (!pokemon) throw new Error(`Missing member in ${row[0]}`);
        return {
          pokemon,
          item: value(row[column(String(i + 1)) + 2]) || null,
          ability: null,
          moves: [],
          nature: null,
          spread: null,
        };
      });
      const pasteUrl = url(field('Pokepaste'), 'pokepast.es');
      if (!/^https:\/\/pokepast\.es\/[a-f0-9]{16}$/.test(pasteUrl))
        throw new Error(`Invalid paste URL in ${row[0]}`);
      const signature = JSON.stringify([
        regulation,
        pasteUrl,
        members.map(({ pokemon, item }) => [pokemon, item]).sort(),
      ]);
      return {
        id: `${regulation.toLowerCase()}-${createHash('sha256').update(signature).digest('hex').slice(0, 16)}`,
        sheetIds: [row[0]],
        name: field('Team Description'),
        creator: field('Full Name') || field('Owner'),
        regulation,
        publishedAt: date(field('Date Shared')),
        pasteUrl,
        replicaCode: field('Replica Code\n(Click text for image)') || null,
        replicaStatus: field('Replica Status'),
        reports: [
          {
            event: field('Tournament / Event'),
            rank: field('Rank'),
            sourceUrl: url(field('Link to Source')),
          },
        ],
        members,
        paste: null,
        pasteNotes: null,
      };
    });
  if (!teams.length) throw new Error(`Empty ${regulation} catalog`);
  return teams;
}

export function deduplicate(teams) {
  const unique = new Map();
  for (const team of teams) {
    const existing = unique.get(team.id);
    if (!existing) unique.set(team.id, team);
    else {
      existing.sheetIds = [
        ...new Set([...existing.sheetIds, ...team.sheetIds]),
      ];
      existing.reports = [
        ...new Map(
          [...existing.reports, ...team.reports].map((report) => [
            JSON.stringify(report),
            report,
          ])
        ).values(),
      ];
    }
  }
  return [...unique.values()];
}

export function enrich(team, data) {
  const sets = parsePaste(data.paste);
  const members = team.members.map((member) => {
    const matches = sets.filter(
      (set) =>
        base(set.pokemon) === base(member.pokemon) &&
        slug(set.item || '') === slug(member.item || '')
    );
    if (matches.length !== 1)
      throw new Error(`Cannot match ${member.pokemon} in ${team.pasteUrl}`);
    return { ...matches[0], pokemon: member.pokemon };
  });
  return {
    ...team,
    members,
    paste: data.paste,
    pasteNotes: typeof data.notes === 'string' ? data.notes : null,
    pasteError: undefined,
  };
}

export async function enrichPastes(
  teams,
  { loadPaste, previousTeams = [], limit = teams.length, concurrency = 3 }
) {
  const previous = new Map(previousTeams.map((team) => [team.pasteUrl, team]));
  for (const team of teams) {
    const prior = previous.get(team.pasteUrl);
    if (!prior?.paste) continue;
    try {
      Object.assign(
        team,
        enrich(team, { paste: prior.paste, notes: prior.pasteNotes })
      );
    } catch {
      // A changed sheet composition invalidates stale enrichment.
    }
  }
  const selected = teams.slice(0, limit);
  let enriched = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const team = selected[cursor++];
      try {
        Object.assign(team, enrich(team, await loadPaste(team)));
        enriched++;
      } catch (error) {
        team.pasteError =
          error instanceof Error ? error.message : String(error);
        failed++;
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), selected.length) },
      worker
    )
  );
  return { attempted: selected.length, enriched, failed };
}

export async function writeCatalog(path, catalog) {
  if (!catalog.teams.length)
    throw new Error('Refusing to write an empty catalog');
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n');
  await rename(temporary, path);
}

async function main() {
  const cache = resolve('.cache/catalog');
  const output = resolve('src/lib/data/catalog.json');
  const count = process.env.PASTE_LIMIT
    ? Number(process.env.PASTE_LIMIT)
    : Infinity;
  if ((!Number.isInteger(count) && count !== Infinity) || count < 0)
    throw new Error('PASTE_LIMIT must be a non-negative integer');
  await mkdir(cache, { recursive: true });
  async function fetchCached(
    name,
    address,
    validate = () => {},
    refresh = false
  ) {
    const path = resolve(cache, name);
    if (!refresh) {
      try {
        const cached = await readFile(path, 'utf8');
        validate(cached);
        return cached;
      } catch (error) {
        if (error.code !== 'ENOENT' && process.env.OFFLINE === '1') throw error;
      }
    }
    if (process.env.OFFLINE === '1')
      throw new Error(`Missing cached file: ${name}`);
    const response = await fetch(address, {
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`${response.status} fetching ${address}`);
    const text = await response.text();
    if (text.length > 5000000)
      throw new Error('Source response exceeds size limit');
    validate(text);
    await writeFile(path, text);
    return text;
  }
  async function restoreSprites(teams) {
    try {
      const index = validateIndex(
        await fetchCached(
          'pokemon.json',
          pokemonIndex,
          validateIndex,
          process.env.REFRESH === '1'
        )
      );
      return await syncSprites(teams, index);
    } catch (error) {
      console.warn(`Sprites unavailable: ${error.message}`);
      return null;
    }
  }
  async function restoreItems(teams) {
    try {
      return await syncItems(teams);
    } catch (error) {
      console.warn(`Item icons unavailable: ${error.message}`);
      return null;
    }
  }
  if (process.argv.includes('--if-missing')) {
    try {
      const catalog = JSON.parse(await readFile(output, 'utf8'));
      await restoreSprites(catalog.teams || []);
      await restoreItems(catalog.teams || []);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const teams = [];
  for (const [regulation, gid] of Object.entries(tabs)) {
    // Google CSV exports redirect to a Google-hosted download endpoint.
    const address = `${sheet}/export?format=csv&gid=${gid}`;
    let csv = null;
    if (process.env.REFRESH !== '1') {
      try {
        csv = await readFile(resolve(cache, `${regulation}.csv`), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (csv === null) {
      if (process.env.OFFLINE === '1')
        throw new Error(`Missing cached sheet: ${regulation}`);
      const response = await fetch(address, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(`Sheet fetch failed: ${response.status}`);
      csv = await response.text();
      if (csv.length > 5000000) throw new Error('Sheet exceeds size limit');
      parseSheet(csv, regulation);
      await writeFile(resolve(cache, `${regulation}.csv`), csv);
    }
    teams.push(...parseSheet(csv, regulation));
  }
  const unique = deduplicate(teams);
  let previousTeams = [];
  try {
    previousTeams = JSON.parse(await readFile(output, 'utf8')).teams || [];
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const stats = await enrichPastes(unique, {
    limit: count,
    previousTeams,
    loadPaste: async (team) => {
      const key = team.pasteUrl.split('/').at(-1);
      const cached = await fetchCached(
        `${key}.json`,
        `${team.pasteUrl}/json`,
        JSON.parse
      );
      try {
        return JSON.parse(cached);
      } catch {
        throw new Error(`Invalid cached paste: ${key}`);
      }
    },
  });
  await writeCatalog(output, {
    updatedAt: new Date().toISOString(),
    currentRegulation: 'M-C',
    sources: [{ name: 'VGCPastes', url: `${sheet}/edit` }],
    teams: unique,
  });
  const sprites = await restoreSprites(unique);
  const items = await restoreItems(unique);
  console.log(
    `Imported ${unique.length} teams; ${stats.enriched}/${stats.attempted} pastes enriched, ${stats.failed} failed. Catalog written atomically.${sprites ? ` ${sprites.wanted} sprites ready, ${sprites.failed} failed.` : ''}${items ? ` ${items.wanted} item icons ready, ${items.failed} failed.` : ''}`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
