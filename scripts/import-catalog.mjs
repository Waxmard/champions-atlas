import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { parse as parseCsvRecords } from 'csv-parse/sync';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePaste } from '../src/lib/paste.ts';
import { restoreCatalogAssets } from './sync-assets.mjs';
import { resolveBattleForm } from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';
import {
  eligibilitySourceTexts,
  rejectIneligibleTeam,
  teamEligibilityError,
} from './champions-eligibility.mjs';
import {
  devonCorpUrl,
  logSourceSummaries,
  parseDevonCorp,
  parseVictoryRoad,
  victoryRoadUrl,
} from './catalog-sources.mjs';
import {
  loadIndexPaste,
  resolvedPokemon,
  rosterMatches,
  validateIndexFormat,
  enrichPastes,
  mergeSources,
} from './catalog-payloads.mjs';
import { reportsWithLadderNotes } from './catalog-results.mjs';
import {
  enrichLinkedSpreads,
  linkedSpreadPairs,
} from './catalog-enrichment.mjs';
import { parsePoch, pochUrl } from './poch-source.mjs';
import {
  loadYoutubeSource,
  youtubeImportRows,
  youtubePrior,
  youtubeRetainedSourceText,
} from './youtube-source.mjs';
import {
  compatibleYoutubePrior,
  youtubeTeamFromPayload as readYoutubeTeam,
} from './youtube-priors.mjs';
import { fetchCached as fetchCachedSource } from './catalog-cache.mjs';
import {
  readYoutubeDecisions,
  retriableReasons,
  writeYoutubeDecisions,
} from './youtube-decisions.mjs';
export const sheet =
  'https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';
const tabs = { 'M-C': '2001945654', 'M-B': '1458357160' };
const currentRegulation = 'M-C';
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
function optionalSourceUrl(text = '') {
  const cleaned = value(text);
  if (!cleaned) return '';
  const raw = /^(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(cleaned)
    ? `https://${cleaned}`
    : cleaned;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    return '';
  const host = parsed.hostname.toLowerCase().replace(/^(?:www|m)\./, '');
  const untimed =
    !parsed.searchParams.has('t') &&
    !parsed.searchParams.has('start') &&
    !parsed.hash;
  const shortId =
    host === 'youtu.be' &&
    untimed &&
    /^\/([A-Za-z0-9_-]{11})\/?$/.exec(parsed.pathname)?.[1];
  const watchId =
    host === 'youtube.com' &&
    parsed.pathname === '/watch' &&
    untimed &&
    /^[A-Za-z0-9_-]{11}$/.test(parsed.searchParams.get('v') || '') &&
    parsed.searchParams.get('v');
  const videoId = shortId || watchId;
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : parsed.href;
}

const optionalColumn = (header, name) => header.indexOf(name);
const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split('|');
function date(text) {
  if (!text) return '';
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(text);
  const month = match ? months.indexOf(match[2]) : -1;
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
  const reportVideoColumn = optionalColumn(header, 'Report / Video');
  const otherLinksColumn = optionalColumn(header, 'Other Links');
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
      const primary = {
        event: field('Tournament / Event'),
        rank: field('Rank'),
        sourceUrl: url(field('Link to Source')),
      };
      const reports = [primary];
      const reportVideo =
        reportVideoColumn >= 0 ? optionalSourceUrl(row[reportVideoColumn]) : '';
      const otherLink =
        otherLinksColumn >= 0 ? optionalSourceUrl(row[otherLinksColumn]) : '';
      if (
        primary.event.toLowerCase() === 'video' &&
        !primary.sourceUrl &&
        reportVideo
      ) {
        primary.sourceUrl = reportVideo;
      } else if (
        reportVideo &&
        !reports.some(({ sourceUrl }) => sourceUrl === reportVideo)
      ) {
        reports.push({
          event: /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(
            reportVideo
          )
            ? 'YouTube video'
            : 'Team report',
          rank: '',
          sourceUrl: reportVideo,
        });
      }
      if (
        otherLink &&
        !reports.some(({ sourceUrl }) => sourceUrl === otherLink)
      ) {
        reports.push({
          event: field('Tournament / Event') || 'Tournament page',
          rank: '',
          sourceUrl: otherLink,
        });
      }
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
        reports,
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
      if (!team.regulationInference) delete existing.regulationInference;
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
  candidate = {
    ...candidate,
    reports: reportsWithLadderNotes(
      candidate.reports,
      payload.notes,
      candidate.pasteUrl
    ),
  };
  return {
    id: catalogId(candidate.regulation, candidate.pasteUrl, members),
    sheetIds: [],
    name: candidate.name,
    creator: candidate.creator,
    regulation: candidate.regulation,
    ...(candidate.regulationInference
      ? { regulationInference: candidate.regulationInference }
      : {}),
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
  function fetchCached(
    name,
    address,
    validate,
    refresh = false,
    { fetchOptions, missingMessage } = {}
  ) {
    return fetchCachedSource(name, address, {
      cache,
      validate,
      refresh,
      offline: process.env.OFFLINE === '1',
      allowStale: process.env.ALLOW_STALE_SOURCE_CACHE === '1',
      fetchOptions,
      missingMessage,
    });
  }
  if (process.argv.includes('--if-missing') && !checkSheet) {
    try {
      const catalog = JSON.parse(await readFile(output, 'utf8'));
      const catalogTeams = catalog.teams || [];
      if (catalogTeams.every((team) => !teamEligibilityError(team))) {
        await restoreCatalogAssets(catalogTeams, {
          fetchCached,
          refresh: process.env.REFRESH === '1',
        });
        return;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  let priorCatalog = null;
  try {
    priorCatalog = JSON.parse(await readFile(output, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const previousTeams = Array.isArray(priorCatalog?.teams)
    ? priorCatalog.teams
    : [];
  const fullHistory = process.env.REFRESH === '1' || previousTeams.length === 0;
  const activePreviousTeams = fullHistory
    ? previousTeams
    : previousTeams.filter((team) => team?.regulation === currentRegulation);
  const reasons = new Map();
  const noteReason = (reason) =>
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  const frozenTeams = fullHistory
    ? []
    : previousTeams
        .filter((team) => team?.regulation !== currentRegulation)
        .filter(
          (team) => !rejectIneligibleTeam('Frozen history', team, noteReason)
        );
  const frozenIds = new Set(
    frozenTeams.map((team) => team?.id).filter((id) => typeof id === 'string')
  );
  const indexRefresh = process.env.REFRESH === '1' || checkSheet;
  const youtubeRefresh =
    process.env.REFRESH === '1' || process.env.YOUTUBE_REFRESH === '1';
  const youtubeSource = await loadYoutubeSource({
    cache,
    refresh: youtubeRefresh,
    offline: process.env.OFFLINE === '1',
    apiKey: process.env.YOUTUBE_API_KEY,
  });
  const youtubeRows = youtubeImportRows(youtubeSource, activePreviousTeams);
  const teams = [];
  const csvs = [];
  const payloads = new Map();
  const loadPayload = (candidate) => {
    if (payloads.has(candidate.pasteUrl))
      return payloads.get(candidate.pasteUrl);
    const pending = loadIndexPaste(candidate, fetchCached);
    payloads.set(candidate.pasteUrl, pending);
    return pending;
  };
  for (const [regulation, gid] of Object.entries(tabs)) {
    if (!fullHistory && regulation !== currentRegulation) continue;
    // Google CSV exports redirect to a Google-hosted download endpoint.
    const address = `${sheet}/export?format=csv&gid=${gid}`;
    let csv = null;
    if (!indexRefresh) {
      try {
        csv = await readFile(resolve(cache, `${regulation}.csv`), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (csv === null) {
      csv = await fetchCached(
        `${regulation}.csv`,
        address,
        (text) => parseSheet(text, regulation),
        true,
        {
          fetchOptions: { redirect: 'follow' },
          missingMessage: `Missing cached sheet: ${regulation}`,
        }
      );
    }
    csvs.push(csv);
    teams.push(...parseSheet(csv, regulation));
  }
  const victoryRoadHtml = await fetchCached(
    'victory-road.html',
    victoryRoadUrl,
    parseVictoryRoad,
    indexRefresh
  );
  const devonCorpHtml = fullHistory
    ? await fetchCached(
        'devoncorp-m-a.html',
        devonCorpUrl,
        parseDevonCorp,
        indexRefresh
      )
    : '';
  const pochHtml = await fetchCached(
    'poch-leaderboard.html',
    pochUrl,
    parsePoch,
    indexRefresh
  );
  const devonCorp = fullHistory
    ? parseDevonCorp(devonCorpHtml)
    : { candidates: [], skipped: [] };
  const victoryRoad = parseVictoryRoad(victoryRoadHtml);

  let unique = deduplicate(teams).filter(
    (team) =>
      !rejectIneligibleTeam(`${team.regulation} sheet`, team, noteReason)
  );
  const youtubeHash = youtubeSource.active
    ? youtubeSource.sourceText
    : youtubeRetainedSourceText(youtubeRows);
  const sourceHash = hashSources([
    ...csvs,
    victoryRoadHtml,
    devonCorpHtml,
    pochHtml,
    youtubeHash,
    currentRegulation,
    JSON.stringify(frozenTeams),
    ...eligibilitySourceTexts,
  ]);
  const stats = await enrichPastes(unique, {
    limit: count,
    previousTeams: activePreviousTeams,
    loadPaste: (team) => loadPayload(team),
  });
  unique = unique.filter(
    (team) =>
      !rejectIneligibleTeam(`${team.regulation} sheet`, team, noteReason)
  );
  const canonicalNames = new Map();
  for (const team of unique)
    for (const member of team.members) {
      const resolved = resolveBattleForm(member);
      const key = normalize(resolved.error ? member.pokemon : resolved.pokemon);
      if (!canonicalNames.has(key)) canonicalNames.set(key, member.pokemon);
    }
  const priorByKey = new Map();
  for (const team of activePreviousTeams)
    if (team.pasteUrl && !priorByKey.has(`${team.pasteUrl}|${team.regulation}`))
      priorByKey.set(`${team.pasteUrl}|${team.regulation}`, team);
  const emitted = new Set(unique.map((team) => team.id));
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
  const youtubeTeamFromPayload = (candidate, payload) => {
    return readYoutubeTeam(candidate, payload, canonicalNames, teamFromIndex);
  };
  const publicBudget =
    count === Infinity ? Infinity : Math.max(0, count - stats.attempted);
  let publicUsed = 0;
  const publicTeams = [];
  const admittedYoutubeCandidates = [];
  const sourceStats = [];
  const decisions = await readYoutubeDecisions(cache);
  let reused = 0;
  for (const { name, source, youtube = false, retainedTeams = [] } of [
    { name: 'Victory Road', source: victoryRoad },
    { name: 'DevonCorp', source: devonCorp },
    ...youtubeRows,
  ]) {
    const skipReasons = youtube ? {} : null;
    const counts = {
      discovered: source.candidates.length + (source.skipped?.length || 0),
      scanned:
        youtube && youtubeSource.active ? source.videosScanned : undefined,
      accepted: 0,
      priorRetained: 0,
      skipped: 0,
      merged: 0,
    };
    const addReason = (reason) => {
      noteReason(reason);
      if (skipReasons) skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    };
    const rowReasons = new Map();
    for (const entry of source.skipped || []) {
      counts.skipped += 1;
      addReason(entry.reason);
      if (entry.pasteUrl)
        console.warn(`${name}: skipped ${entry.pasteUrl} (${entry.reason})`);
      else
        rowReasons.set(entry.reason, (rowReasons.get(entry.reason) || 0) + 1);
    }
    for (const [reason, total] of rowReasons)
      console.warn(`${name}: skipped ${total} rows (${reason})`);
    sourceStats.push({ name, counts, skipReasons });
    const keep = (team, field, discoveryCandidate = null) => {
      if (!fullHistory && team?.regulation !== currentRegulation) {
        counts.skipped += 1;
        addReason('outside_current_regulation');
        return;
      }
      if (!fullHistory && frozenIds.has(team?.id)) {
        counts.skipped += 1;
        addReason('frozen_history_conflict');
        console.warn(
          `${name}: skipped ID ${team.id} (frozen history conflict)`
        );
        return;
      }
      if (rejectIneligibleTeam(name, team, addReason)) {
        counts.skipped += 1;
        return;
      }
      publicTeams.push(team);
      if (youtube && discoveryCandidate)
        admittedYoutubeCandidates.push(discoveryCandidate);
      if (emitted.has(team.id)) counts.merged += 1;
      else {
        emitted.add(team.id);
        counts[field] += 1;
      }
    };
    const handleFailure = (candidate, prior, error) => {
      const reason = error.reason || 'paste_unavailable';
      if (prior && retriableReasons.has(reason))
        return keep(
          { ...prior, pasteError: error.message },
          'priorRetained',
          youtube ? candidate : null
        );
      counts.skipped += 1;
      addReason(reason);
      if (youtube) decisions.skip(candidate, reason);
      console.warn(
        `${name}: skipped ${candidate.pasteUrl} (${reason}: ${error.message})`
      );
    };
    for (const team of retainedTeams) keep(team, 'priorRetained');
    for (const candidate of source.candidates) {
      if (
        (youtube && youtubePrior(candidate, frozenTeams)) ||
        (!fullHistory &&
          candidate.regulation &&
          candidate.regulation !== currentRegulation)
      ) {
        counts.skipped += 1;
        addReason('outside_current_regulation');
        continue;
      }
      const memo = youtube ? decisions.reuse(candidate) : null;
      if (memo) {
        reused += 1;
        counts.skipped += 1;
        addReason(memo);
        continue;
      }
      const prior = youtube
        ? compatibleYoutubePrior(
            candidate,
            activePreviousTeams,
            youtubeTeamFromPayload
          )
        : compatiblePrior(candidate);
      if (publicUsed >= publicBudget) {
        if (prior && youtube && payloads.has(candidate.pasteUrl)) {
          try {
            keep(
              youtubeTeamFromPayload(
                candidate,
                await payloads.get(candidate.pasteUrl)
              ),
              'accepted',
              candidate
            );
          } catch (error) {
            handleFailure(candidate, prior, error);
          }
        } else if (prior)
          keep(prior, 'priorRetained', youtube ? candidate : null);
        else {
          counts.skipped += 1;
          addReason('limited');
        }
        continue;
      }
      publicUsed += 1;
      try {
        const payload = await loadPayload(candidate);
        keep(
          youtube
            ? youtubeTeamFromPayload(candidate, payload)
            : teamFromIndex(candidate, payload, canonicalNames),
          'accepted',
          youtube ? candidate : null
        );
      } catch (error) {
        handleFailure(candidate, prior, error);
      }
    }
  }
  await writeYoutubeDecisions(cache, decisions);
  const parsedPoch = parsePoch(pochHtml, canonicalNames);
  const pochInScope = fullHistory
    ? parsedPoch.teams
    : parsedPoch.teams.filter((team) => team.regulation === currentRegulation);
  for (const team of parsedPoch.teams)
    if (!fullHistory && team.regulation !== currentRegulation)
      noteReason('outside_current_regulation');
  const pochTeams = pochInScope.filter((team) => {
    if (!fullHistory && frozenIds.has(team.id)) {
      noteReason('frozen_history_conflict');
      console.warn(`Poch.ms: skipped ID ${team.id} (frozen history conflict)`);
      return false;
    }
    return !rejectIneligibleTeam('Poch.ms', team, noteReason);
  });
  const pochCounts = {
    discovered: parsedPoch.teams.length + parsedPoch.skipped.length,
    accepted: pochTeams.length,
    priorRetained: 0,
    skipped:
      parsedPoch.skipped.length + parsedPoch.teams.length - pochTeams.length,
    merged: 0,
  };
  for (const entry of parsedPoch.skipped)
    noteReason(entry.reason || 'invalid_record');
  sourceStats.push({ name: 'Poch.ms', counts: pochCounts });
  const linked = enrichLinkedSpreads(
    deduplicate([...unique, ...publicTeams, ...pochTeams]),
    linkedSpreadPairs(admittedYoutubeCandidates),
    { active: youtubeSource.active, previousTeams: activePreviousTeams }
  );
  const catalogTeams = fullHistory
    ? linked.teams
    : [...linked.teams, ...frozenTeams];
  if (linked.spread_conflict)
    reasons.set('spread_conflict', linked.spread_conflict);
  const sources = mergeSources(
    fullHistory ? [] : priorCatalog?.sources,
    frozenTeams,
    [
      { name: 'VGCPastes', url: `${sheet}/edit` },
      { name: 'Victory Road', url: victoryRoadUrl },
      { name: 'DevonCorp', url: devonCorpUrl },
      { name: 'Poch.ms', url: pochUrl },
      ...youtubeRows
        .filter(
          ({ retainedTeams }) => youtubeSource.active || retainedTeams.length
        )
        .map(({ name, url }) => ({ name, url })),
    ]
  );
  await writeCatalog(output, {
    updatedAt: new Date().toISOString(),
    currentRegulation,
    sources,
    sourceHash,
    teams: catalogTeams,
  });
  const { sprites, items } = await restoreCatalogAssets(catalogTeams, {
    fetchCached,
    refresh: process.env.REFRESH === '1',
  });
  if (reused) console.log(`YouTube decisions reused from cache: ${reused}.`);
  logSourceSummaries(sourceStats, youtubeSource.active);
  if (reasons.size)
    console.log(
      `Skip reasons: ${[...reasons].map(([reason, total]) => `${reason}=${total}`).join(', ')}`
    );
  if (!fullHistory)
    console.log(
      `Frozen history: ${frozenTeams.length} teams retained; refreshing ${currentRegulation}.`
    );
  console.log(`Linked creator spreads: ${linked.enriched} members enriched.`);
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
