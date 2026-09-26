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
import { battleSpecies, resolveBattleForm } from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';
import {
  devonCorpUrl,
  parseDevonCorp,
  parseVictoryRoad,
  parseVrPaste,
  victoryRoadUrl,
} from './catalog-sources.mjs';
export const sheet =
  'https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';
const tabs = { 'M-C': '2001945654', 'M-B': '1458357160' };
export function parseCsv(text) {
  return parseCsvRecords(text, {
    relax_column_count: true,
    record_delimiter: ['\r\n', '\n', '\r'],
  });
}

const hashSources = (sources) =>
  createHash('sha256').update(sources.join('\n')).digest('hex');

const catalogId = (regulation, pasteUrl, members) =>
  `${regulation.toLowerCase()}-${createHash('sha256')
    .update(
      JSON.stringify([
        regulation,
        pasteUrl,
        members.map(({ pokemon, item }) => [pokemon, item]).sort(),
      ])
    )
    .digest('hex')
    .slice(0, 16)}`;

function errorWithReason(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
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
      return {
        id: catalogId(regulation, pasteUrl, members),
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
const isVrPasteUrl = (value) => value.startsWith('https://www.vrpastes.com/');

const championRegulation = (value) => {
  if (typeof value !== 'string') return null;
  const text = normalize(value);
  return (
    /vgcregulation([a-z]{2})$/.exec(text)?.[1] ??
    /champions.*reg([a-z]{2})$/.exec(text)?.[1] ??
    null
  );
};

function validateIndexFormat(candidate, payload) {
  const regulation = normalize(candidate.regulation);
  if (!['ma', 'mb', 'mc'].includes(regulation))
    throw errorWithReason('invalid_payload', 'Invalid candidate regulation');
  if (payload.provider === 'victory-road') {
    const format = payload.format;
    if (format === undefined || format === null || format === '') return;
    if (typeof format !== 'string')
      throw errorWithReason('invalid_payload', 'VR format must be a string');
    if (normalize(format) !== `vgcregulation${regulation}`)
      throw errorWithReason('format_conflict', `Unexpected format: ${format}`);
    return;
  }
  const notes = payload.notes;
  if (notes === undefined || notes === null) return;
  if (typeof notes !== 'string')
    throw errorWithReason('invalid_payload', 'Paste notes must be a string');
  for (const line of notes.split(/\r?\n/)) {
    const match = /^\s*Format\s*:\s*(.*?)\s*$/i.exec(line);
    if (match && championRegulation(match[1]) !== regulation)
      throw errorWithReason(
        'format_conflict',
        `Unexpected format: ${match[1]}`
      );
  }
}

function resolvedPokemon(member) {
  const resolved = resolveBattleForm(member);
  return resolved.error ? member.pokemon : resolved.pokemon;
}

function rosterMatches(members, expectedSpecies) {
  if (expectedSpecies === null || expectedSpecies === undefined) return true;
  if (
    !Array.isArray(expectedSpecies) ||
    expectedSpecies.length !== 6 ||
    !expectedSpecies.every(
      (species) => typeof species === 'string' && species.trim()
    )
  )
    throw errorWithReason('invalid_roster', 'Invalid published roster');
  const canonical = (name) => battleSpecies(name)?.name || name;
  const actual = members
    .map((member) => normalize(canonical(resolvedPokemon(member))))
    .sort();
  const expected = expectedSpecies
    .map((species) => normalize(canonical(species)))
    .sort();
  if (actual.some((species, index) => species !== expected[index]))
    throw errorWithReason(
      'roster_mismatch',
      'Paste species do not match the published roster'
    );
  return true;
}

export function teamFromIndex(candidate, payload, canonicalNames) {
  if (
    !candidate ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  )
    throw errorWithReason(
      'invalid_payload',
      'Invalid index candidate or paste payload'
    );
  validateIndexFormat(candidate, payload);
  if (typeof payload.paste !== 'string' || !payload.paste)
    throw errorWithReason('invalid_payload', 'Paste payload is missing sets');
  if (
    payload.notes !== undefined &&
    payload.notes !== null &&
    typeof payload.notes !== 'string'
  )
    throw errorWithReason('invalid_payload', 'Paste notes must be a string');
  let parsed;
  try {
    parsed = parsePaste(payload.paste);
  } catch (error) {
    throw errorWithReason('invalid_payload', error.message);
  }
  rosterMatches(parsed, candidate.expectedSpecies);
  const members = parsed.map((member) => {
    const pokemon = resolvedPokemon(member);
    return {
      ...member,
      pokemon: canonicalNames.get(normalize(pokemon)) || pokemon,
    };
  });
  if (
    !Array.isArray(candidate.reports) ||
    candidate.reports.some(
      (report) =>
        !report ||
        typeof report.event !== 'string' ||
        typeof report.rank !== 'string' ||
        typeof report.sourceUrl !== 'string'
    )
  )
    throw errorWithReason('invalid_payload', 'Index reports are invalid');
  if (
    payload.publishedAt !== undefined &&
    typeof payload.publishedAt !== 'string'
  )
    throw errorWithReason('invalid_payload', 'Published date must be a string');
  return {
    id: catalogId(candidate.regulation, candidate.pasteUrl, members),
    sheetIds: [],
    name: candidate.name,
    creator: candidate.creator,
    regulation: candidate.regulation,
    publishedAt: payload.publishedAt || '',
    pasteUrl: candidate.pasteUrl,
    replicaCode: candidate.replicaCode || null,
    replicaStatus: '',
    reports: candidate.reports.map((report) => ({ ...report })),
    members,
    paste: payload.paste,
    pasteNotes: payload.notes || null,
  };
}
const vrPasteApi = (id) =>
  `https://vrpaste-backend.vercel.app/api/paste/${id}?lang=english`;

function validateProviderJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw errorWithReason(
      'invalid_payload',
      'Provider payload is not a JSON object'
    );
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
  const checkSheet = process.env.CHECK_SHEET === '1';
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
  if (process.argv.includes('--if-missing') && !checkSheet) {
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
  const csvs = [];
  for (const [regulation, gid] of Object.entries(tabs)) {
    // Google CSV exports redirect to a Google-hosted download endpoint.
    const address = `${sheet}/export?format=csv&gid=${gid}`;
    let csv = null;
    if (process.env.REFRESH !== '1' && !checkSheet) {
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
    csvs.push(csv);
    teams.push(...parseSheet(csv, regulation));
  }
  const indexRefresh = process.env.REFRESH === '1' || checkSheet;
  const victoryRoadHtml = await fetchCached(
    'victory-road.html',
    victoryRoadUrl,
    parseVictoryRoad,
    indexRefresh
  );
  const devonCorpHtml = await fetchCached(
    'devoncorp-m-a.html',
    devonCorpUrl,
    parseDevonCorp,
    indexRefresh
  );
  const victoryRoad = parseVictoryRoad(victoryRoadHtml);
  const devonCorp = parseDevonCorp(devonCorpHtml);
  const unique = deduplicate(teams);
  const sourceHash = hashSources([...csvs, victoryRoadHtml, devonCorpHtml]);
  let priorCatalog = null;
  try {
    priorCatalog = JSON.parse(await readFile(output, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const previousTeams = priorCatalog?.teams || [];
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
  const canonicalNames = new Map();
  for (const team of unique)
    for (const member of team.members) {
      const resolved = resolveBattleForm(member);
      const key = normalize(resolved.error ? member.pokemon : resolved.pokemon);
      if (!canonicalNames.has(key)) canonicalNames.set(key, member.pokemon);
    }
  const priorByKey = new Map();
  for (const team of previousTeams)
    if (team.pasteUrl && !priorByKey.has(`${team.pasteUrl}|${team.regulation}`))
      priorByKey.set(`${team.pasteUrl}|${team.regulation}`, team);
  const emitted = new Set(unique.map((team) => team.id));
  const reasons = new Map();
  const noteReason = (reason) =>
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  const payloads = new Map();
  async function loadVictoryRoadPayload(candidate) {
    const id = candidate.pasteUrl.split('/').at(-1);
    let text;
    try {
      text = await fetchCached(
        `vr-${id}.json`,
        vrPasteApi(id),
        validateProviderJson,
        indexRefresh
      );
    } catch (error) {
      throw error.reason
        ? error
        : errorWithReason('paste_unavailable', error.message);
    }
    try {
      return { ...parseVrPaste(JSON.parse(text)), provider: 'victory-road' };
    } catch (error) {
      throw error.reason
        ? error
        : errorWithReason('invalid_payload', `Invalid VR payload: ${id}`);
    }
  }
  async function loadPokepastePayload(candidate) {
    const key = candidate.pasteUrl.split('/').at(-1);
    let text;
    try {
      text = await fetchCached(
        `${key}.json`,
        `${candidate.pasteUrl}/json`,
        validateProviderJson
      );
    } catch (error) {
      throw error.reason
        ? error
        : errorWithReason('paste_unavailable', error.message);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw errorWithReason('invalid_payload', `Invalid paste payload: ${key}`);
    }
    return {
      paste: data.paste,
      notes: data.notes,
      publishedAt: '',
      provider: 'pokepaste',
    };
  }
  const loadPayload = (candidate) => {
    const pending = isVrPasteUrl(candidate.pasteUrl)
      ? loadVictoryRoadPayload(candidate)
      : loadPokepastePayload(candidate);
    if (!payloads.has(candidate.pasteUrl))
      payloads.set(candidate.pasteUrl, pending);
    return payloads.get(candidate.pasteUrl);
  };
  const compatiblePrior = (candidate) => {
    const prior = priorByKey.get(
      `${candidate.pasteUrl}|${candidate.regulation}`
    );
    if (!prior) return null;
    if (
      !Array.isArray(prior.reports) ||
      !prior.reports.some((report) => report?.sourceUrl === candidate.indexUrl)
    )
      return null;
    if (candidate.expectedSpecies) {
      try {
        rosterMatches(prior.members || [], candidate.expectedSpecies);
      } catch {
        return null;
      }
    }
    return prior;
  };
  const fallbackReasons = new Set(['paste_unavailable', 'invalid_payload']);
  const publicBudget =
    count === Infinity ? Infinity : Math.max(0, count - stats.attempted);
  let publicUsed = 0;
  const publicTeams = [];
  const sourceStats = [];
  for (const [name, source] of [
    ['Victory Road', victoryRoad],
    ['DevonCorp', devonCorp],
  ]) {
    const counts = {
      discovered: source.candidates.length + source.skipped.length,
      accepted: 0,
      priorRetained: 0,
      skipped: 0,
      merged: 0,
    };
    for (const entry of source.skipped) {
      counts.skipped += 1;
      noteReason(entry.reason);
      console.warn(
        `${name}: skipped ${entry.pasteUrl || 'row'} (${entry.reason})`
      );
    }
    sourceStats.push({ name, counts });
    for (const candidate of source.candidates) {
      const prior = compatiblePrior(candidate);
      const keep = (team, field) => {
        publicTeams.push(team);
        if (emitted.has(team.id)) counts.merged += 1;
        else {
          emitted.add(team.id);
          counts[field] += 1;
        }
      };
      if (publicUsed >= publicBudget) {
        if (prior) keep(prior, 'priorRetained');
        else {
          counts.skipped += 1;
          noteReason('limited');
        }
        continue;
      }
      publicUsed += 1;
      try {
        const payload = await loadPayload(candidate);
        keep(teamFromIndex(candidate, payload, canonicalNames), 'accepted');
      } catch (error) {
        const reason = error.reason || 'paste_unavailable';
        if (prior && fallbackReasons.has(reason))
          keep({ ...prior, pasteError: error.message }, 'priorRetained');
        else {
          counts.skipped += 1;
          noteReason(reason);
          console.warn(
            `${name}: skipped ${candidate.pasteUrl} (${reason}: ${error.message})`
          );
        }
      }
    }
  }
  const catalogTeams = deduplicate([...unique, ...publicTeams]);
  await writeCatalog(output, {
    updatedAt: new Date().toISOString(),
    currentRegulation: 'M-C',
    sources: [
      { name: 'VGCPastes', url: `${sheet}/edit` },
      { name: 'Victory Road', url: victoryRoadUrl },
      { name: 'DevonCorp', url: devonCorpUrl },
    ],
    sourceHash,
    teams: catalogTeams,
  });
  const sprites = await restoreSprites(catalogTeams);
  const items = await restoreItems(catalogTeams);
  for (const { name, counts } of sourceStats)
    console.log(
      `${name}: ${counts.discovered} discovered — ${counts.accepted} accepted, ${counts.priorRetained} retained, ${counts.skipped} skipped, ${counts.merged} merged.`
    );
  if (reasons.size)
    console.log(
      `Skip reasons: ${[...reasons].map(([reason, total]) => `${reason}=${total}`).join(', ')}`
    );
  console.log(
    `Imported ${catalogTeams.length} teams; ${stats.enriched}/${stats.attempted} pastes enriched, ${stats.failed} failed. Catalog written atomically.${sprites ? ` ${sprites.wanted} sprites ready, ${sprites.failed} failed.` : ''}${items ? ` ${items.wanted} item icons ready, ${items.failed} failed.` : ''}`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
