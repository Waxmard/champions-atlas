import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sheet =
  'https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';
const tabs = { 'M-C': '2001945654', 'M-B': '1458357160' };

export function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
      closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      closed = false;
    } else {
      if (closed || char === '"') throw new Error('Malformed CSV quoting');
      cell += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || row.length || closed) rows.push([...row, cell]);
  return rows;
}

const value = (text = '') =>
  ['-', 'None', 'N/A', 'No Tweet', 'Discord Submission'].includes(text.trim())
    ? ''
    : text.trim();
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const base = (text) => slug(text).replace(/mega[a-z]?$/, '');

function url(text, host) {
  if (!value(text)) return '';
  const parsed = new URL(text);
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
  if (typeof data.paste !== 'string' || data.paste.length > 50000)
    throw new Error('Invalid paste payload');
  const sets = data.paste
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const [first, ...lines] = block.split(/\r?\n/).map((line) => line.trim());
      const [rawName, item] = first.split(' @ ');
      const name = rawName.replace(/ \([MF]\)$/, '');
      const pokemon = /\(([^)]+)\)$/.exec(name)?.[1] || name;
      const prefix = (label) =>
        lines.find((line) => line.startsWith(label))?.slice(label.length) ||
        null;
      return {
        pokemon,
        item: item || null,
        ability: prefix('Ability: '),
        moves: lines
          .filter((line) => line.startsWith('- '))
          .map((line) => line.slice(2)),
        nature:
          lines
            .find((line) => line.endsWith(' Nature'))
            ?.replace(/ Nature$/, '') || null,
        spread: prefix('EVs: '),
      };
    });
  if (sets.length !== 6)
    throw new Error(`Paste does not contain six sets: ${team.pasteUrl}`);
  const members = team.members.map((member) => {
    const matches = sets.filter(
      (set) =>
        base(set.pokemon) === base(member.pokemon) && set.item === member.item
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
  };
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
  if (process.argv.includes('--if-missing')) {
    try {
      await access(output);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const count = Number(process.env.PASTE_LIMIT || '12');
  if (!Number.isInteger(count) || count < 0 || count > 100)
    throw new Error('PASTE_LIMIT must be 0–100');
  await mkdir(cache, { recursive: true });
  async function fetchCached(name, address) {
    const path = resolve(cache, name);
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
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
    await writeFile(path, text);
    return text;
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
  for (const team of unique.slice(0, count)) {
    const key = team.pasteUrl.split('/').at(-1);
    const data = JSON.parse(
      await fetchCached(`${key}.json`, `${team.pasteUrl}/json`)
    );
    Object.assign(team, enrich(team, data));
  }
  await writeCatalog(output, {
    updatedAt: new Date().toISOString(),
    currentRegulation: 'M-C',
    sources: [{ name: 'VGCPastes', url: `${sheet}/edit` }],
    teams: unique,
  });
  console.log(
    `Imported ${unique.length} teams; ${count} pastes enriched. Catalog written atomically.`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
