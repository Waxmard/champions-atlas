import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isPasteUrl, normalize } from '../src/lib/catalog.ts';
import { championRegulation } from './catalog-payloads.mjs';
import { fetchWithRetry } from './catalog-sources.mjs';

const apiBase = 'https://www.googleapis.com/youtube/v3';
const responseLimit = 5000000;
const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;
const playlistIdPattern = /^UU[A-Za-z0-9_-]{22}$/;
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export const youtubeChannels = Object.freeze([
  Object.freeze({
    handle: 'pokeaimMD',
    name: 'pokeaimMD',
    url: 'https://www.youtube.com/@pokeaimMD',
  }),
  Object.freeze({
    handle: 'pokeaimplus',
    name: 'Pokeaim+',
    url: 'https://www.youtube.com/@pokeaimplus',
  }),
]);

const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => new Error(`YouTube source: ${message}`);
const admissionError = (reason) =>
  Object.assign(fail(`Candidate rejected (${reason}).`), { reason });

function validDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  const day = value.slice(0, 10);
  return new Date(day).toISOString().slice(0, 10) === day;
}

const safeApiReasons = new Set([
  'accessNotConfigured',
  'backendError',
  'channelNotFound',
  'dailyLimitExceeded',
  'forbidden',
  'internalError',
  'ipRefererBlocked',
  'keyInvalid',
  'notFound',
  'playlistNotFound',
  'quotaExceeded',
  'rateLimitExceeded',
  'serviceUnavailable',
  'unauthorized',
  'userRateLimitExceeded',
]);

function safeApiReason(data, apiKey) {
  const reason = data?.error?.errors?.[0]?.reason;
  return safeApiReasons.has(reason) && !reason.includes(apiKey)
    ? reason
    : 'unknown';
}

async function requestJson(url, apiKey) {
  let response;
  try {
    response = await fetchWithRetry(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
      redirect: 'error',
    });
  } catch {
    throw fail('API request failed before receiving a response.');
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw fail('API response body could not be read.');
  }
  if (text.length > responseLimit)
    throw fail('API response exceeds size limit.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (!response.ok)
      throw fail(`API HTTP ${response.status} (unknown reason).`);
    throw fail('API returned malformed JSON.');
  }
  if (!response.ok)
    throw fail(`API HTTP ${response.status} (${safeApiReason(data, apiKey)}).`);
  if (!object(data)) throw fail('API response must be a JSON object.');
  return data;
}

function apiUrl(resource, params) {
  const url = new URL(`${apiBase}/${resource}`);
  url.search = new URLSearchParams(params);
  return url.toString();
}

function canonicalPasteUrl(raw) {
  const trimmed = raw.replace(/[.,!?;:)\]}]+$/g, '');
  if (trimmed.includes('\\')) return null;
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)(?:[?#].*)?$/i.exec(trimmed);
  if (!match) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const authority = match[2];
  const rawPath = match[3];
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    authority.includes('@') ||
    authority.includes(':') ||
    url.pathname !== rawPath
  )
    return null;
  let host = url.hostname;
  if (host === 'vrpastes.com') host = 'www.vrpastes.com';
  const path = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  if (
    (host === 'pokepast.es' && !/^\/[a-f0-9]{16}$/.test(path)) ||
    (host === 'www.vrpastes.com' && !/^\/[A-Za-z0-9]{8}$/.test(path)) ||
    !['pokepast.es', 'www.vrpastes.com'].includes(host)
  )
    return null;
  const canonical = `https://${host}${path}`;
  return isPasteUrl(canonical) ? canonical : null;
}

function pasteLinks(description) {
  const links = new Set();
  for (const match of description.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = canonicalPasteUrl(match[0]);
    if (url) links.add(url);
  }
  return [...links];
}

function isPlaceholder(item) {
  const title = item?.snippet?.title;
  const privacy = item?.status?.privacyStatus;
  return (
    privacy === 'private' ||
    (typeof title === 'string' &&
      /^(?:deleted|private|unavailable) video$/i.test(title.trim()))
  );
}

function readVideo(item, channelId, playlistId) {
  if (!object(item)) throw fail('Playlist contains a malformed video record.');
  if (isPlaceholder(item)) return null;
  const snippet = item.snippet;
  const details = item.contentDetails;
  const videoId = snippet?.resourceId?.videoId;
  if (
    !object(snippet) ||
    !object(snippet.resourceId) ||
    snippet.resourceId.kind !== 'youtube#video' ||
    typeof videoId !== 'string' ||
    !videoIdPattern.test(videoId) ||
    snippet.videoOwnerChannelId !== channelId ||
    snippet.playlistId !== playlistId ||
    typeof snippet.title !== 'string' ||
    !snippet.title.trim() ||
    typeof snippet.description !== 'string' ||
    !object(details) ||
    details.videoId !== videoId ||
    !validDate(details.videoPublishedAt)
  )
    throw fail(
      'Playlist contains a malformed or mismatched public video record.'
    );
  return {
    id: videoId,
    title: snippet.title,
    description: snippet.description,
    publishedAt: details.videoPublishedAt,
  };
}

function equalVideo(left, right) {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    left.publishedAt === right.publishedAt
  );
}

const compareCandidate = (left, right) =>
  (left.video.id < right.video.id
    ? -1
    : left.video.id > right.video.id
      ? 1
      : 0) ||
  (left.pasteUrl < right.pasteUrl
    ? -1
    : left.pasteUrl > right.pasteUrl
      ? 1
      : 0);

async function scanChannel(channel, apiKey) {
  const resolved = await requestJson(
    apiUrl('channels', {
      part: 'snippet,contentDetails',
      forHandle: channel.handle,
    }),
    apiKey
  );
  if (!Array.isArray(resolved.items) || resolved.items.length !== 1)
    throw fail(
      `Handle @${channel.handle} did not resolve to exactly one channel.`
    );
  const metadata = resolved.items[0];
  const channelId = metadata?.id;
  const uploads = metadata?.contentDetails?.relatedPlaylists?.uploads;
  if (
    typeof channelId !== 'string' ||
    !channelIdPattern.test(channelId) ||
    typeof uploads !== 'string' ||
    !playlistIdPattern.test(uploads)
  )
    throw fail(
      `Handle @${channel.handle} returned an invalid channel or uploads playlist.`
    );

  const videos = new Map();
  const seenTokens = new Set();
  let pageToken;
  let firstPage = true;
  do {
    const params = {
      part: 'snippet,contentDetails',
      playlistId: uploads,
      maxResults: '50',
    };
    if (pageToken) params.pageToken = pageToken;
    const page = await requestJson(apiUrl('playlistItems', params), apiKey);
    if (!Array.isArray(page.items))
      throw fail(
        `Uploads playlist for @${channel.handle} returned no item array.`
      );
    if (firstPage && page.items.length === 0)
      throw fail(
        `Uploads playlist for @${channel.handle} is unexpectedly empty.`
      );
    for (const item of page.items) {
      const video = readVideo(item, channelId, uploads);
      if (!video) continue;
      const existing = videos.get(video.id);
      if (existing && !equalVideo(existing, video))
        throw fail(
          `Uploads playlist for @${channel.handle} has conflicting duplicate videos.`
        );
      if (!existing) videos.set(video.id, video);
    }
    firstPage = false;
    if (page.nextPageToken === undefined) {
      pageToken = undefined;
    } else {
      if (
        typeof page.nextPageToken !== 'string' ||
        !page.nextPageToken ||
        seenTokens.has(page.nextPageToken)
      )
        throw fail(
          `Uploads playlist for @${channel.handle} has an invalid continuation token.`
        );
      pageToken = page.nextPageToken;
      seenTokens.add(pageToken);
    }
  } while (pageToken);

  const candidates = [];
  let videosWithoutPaste = 0;
  for (const video of videos.values()) {
    const links = pasteLinks(video.description);
    if (!links.length) {
      videosWithoutPaste++;
      continue;
    }
    for (const pasteUrl of links)
      candidates.push({
        sourceName: channel.name,
        indexUrl: channel.url,
        pasteUrl,
        video,
      });
  }
  candidates.sort(compareCandidate);
  return {
    ...channel,
    channelId,
    videosScanned: videos.size,
    videosWithoutPaste,
    candidates,
  };
}

const invalidSnapshot = Symbol('invalid YouTube snapshot');
const snapshotKeys = ['version', 'channels'];
const channelSnapshotKeys = [
  'handle',
  'name',
  'url',
  'channelId',
  'videosScanned',
  'videosWithoutPaste',
  'candidates',
];
const candidateSnapshotKeys = ['sourceName', 'indexUrl', 'pasteUrl', 'video'];
const videoSnapshotKeys = ['id', 'title', 'description', 'publishedAt'];

const exactKeys = (value, keys) =>
  object(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

function validateSnapshot(snapshot) {
  if (
    !exactKeys(snapshot, snapshotKeys) ||
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.channels) ||
    snapshot.channels.length !== youtubeChannels.length
  )
    throw fail('Cached snapshot is invalid.');

  const channels = snapshot.channels.map((entry, index) => {
    const identity = youtubeChannels[index];
    if (
      !exactKeys(entry, channelSnapshotKeys) ||
      entry.handle !== identity.handle ||
      entry.name !== identity.name ||
      entry.url !== identity.url ||
      typeof entry.channelId !== 'string' ||
      !channelIdPattern.test(entry.channelId) ||
      !Number.isSafeInteger(entry.videosScanned) ||
      entry.videosScanned < 0 ||
      !Number.isSafeInteger(entry.videosWithoutPaste) ||
      entry.videosWithoutPaste < 0 ||
      entry.videosWithoutPaste > entry.videosScanned ||
      !Array.isArray(entry.candidates)
    )
      throw fail('Cached snapshot is invalid.');

    const candidates = [];
    const seenLinks = new Set();
    const videos = new Map();
    const linksByVideo = new Map();
    let previous;
    for (const row of entry.candidates) {
      if (
        !exactKeys(row, candidateSnapshotKeys) ||
        row.sourceName !== identity.name ||
        row.indexUrl !== identity.url ||
        typeof row.pasteUrl !== 'string' ||
        !isPasteUrl(row.pasteUrl) ||
        canonicalPasteUrl(row.pasteUrl) !== row.pasteUrl ||
        !exactKeys(row.video, videoSnapshotKeys)
      )
        throw fail('Cached snapshot is invalid.');
      const video = row.video;
      if (
        typeof video.id !== 'string' ||
        !videoIdPattern.test(video.id) ||
        typeof video.title !== 'string' ||
        !video.title.trim() ||
        typeof video.description !== 'string' ||
        !validDate(video.publishedAt)
      )
        throw fail('Cached snapshot is invalid.');
      const candidate = {
        sourceName: identity.name,
        indexUrl: identity.url,
        pasteUrl: row.pasteUrl,
        video: {
          id: video.id,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
        },
      };
      const linkKey = `${video.id}|${row.pasteUrl}`;
      if (
        seenLinks.has(linkKey) ||
        (previous && compareCandidate(previous, candidate) > 0)
      )
        throw fail('Cached snapshot is invalid.');
      seenLinks.add(linkKey);
      previous = candidate;
      const prior = videos.get(video.id);
      if (prior && !equalVideo(prior, video))
        throw fail('Cached snapshot is invalid.');
      videos.set(video.id, candidate.video);
      if (!linksByVideo.has(video.id)) linksByVideo.set(video.id, new Set());
      linksByVideo.get(video.id).add(row.pasteUrl);
      candidates.push(candidate);
    }
    for (const [id, video] of videos) {
      const expected = new Set(pasteLinks(video.description));
      const actual = linksByVideo.get(id);
      if (
        expected.size !== actual.size ||
        [...expected].some((pasteUrl) => !actual.has(pasteUrl))
      )
        throw fail('Cached snapshot is invalid.');
    }
    if (entry.videosWithoutPaste + videos.size !== entry.videosScanned)
      throw fail('Cached snapshot is invalid.');
    return {
      ...identity,
      channelId: entry.channelId,
      videosScanned: entry.videosScanned,
      videosWithoutPaste: entry.videosWithoutPaste,
      candidates,
    };
  });
  if (
    new Set(channels.map(({ channelId }) => channelId)).size !== channels.length
  )
    throw fail('Cached snapshot is invalid.');
  return channels;
}

async function readSnapshot(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'EISDIR' || error.code === 'ENOTDIR')
      return invalidSnapshot;
    throw error;
  }
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    return invalidSnapshot;
  }
  try {
    return validateSnapshot(snapshot);
  } catch {
    return invalidSnapshot;
  }
}

async function writeSnapshot(directory, channels) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'youtube-sources.json');
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      `${JSON.stringify({ version: 1, channels })}\n`,
      { flag: 'wx' }
    );
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function formatDeclarations(text) {
  return typeof text === 'string'
    ? text.split(/\r?\n/).flatMap((line) => {
        const match = /^\s*Format\s*:\s*(.*?)\s*$/i.exec(line);
        return match ? [match[1]] : [];
      })
    : [];
}

function unsupportedFormat(format) {
  const normalized = normalize(format);
  const generation = /gen(\d+)/.exec(normalized)?.[1];
  return (
    /singles?/.test(normalized) ||
    /\bou\b/i.test(format) ||
    /ou(?:\d{4})?reg/.test(normalized) ||
    /overused|nationaldex|natdex/.test(normalized) ||
    (generation !== undefined && generation !== '9') ||
    /\bsv\b/i.test(format) ||
    /^(?:sv|sm|swsh|bdsp|oras|xy|bw|dpp|rby|gsc)(?:vgc|ou|doubles?)/.test(
      normalized
    ) ||
    /scarlet|violet|sword|shield/.test(normalized) ||
    /sunandmoon|ultrasun|ultramoon|brilliantdiamond|shiningpearl|legendsarceus|legendsza/.test(
      normalized
    )
  );
}

function championsEvidence(value) {
  return (
    /\bchampions\b/i.test(value) ||
    /champions(?:\d{4})?(?:vgc|doubles?)/.test(normalize(value))
  );
}

function doublesEvidence(value) {
  const normalized = normalize(value);
  return (
    /\bvgc\b|\bdoubles?\b/i.test(value) ||
    normalized.includes('vgc') ||
    normalized.includes('double')
  );
}

export function youtubeCandidate(discoveryCandidate, payload) {
  const video = discoveryCandidate?.video;
  if (
    !object(discoveryCandidate) ||
    !object(video) ||
    !object(payload) ||
    typeof discoveryCandidate.sourceName !== 'string' ||
    typeof discoveryCandidate.indexUrl !== 'string' ||
    !isPasteUrl(discoveryCandidate.pasteUrl) ||
    typeof video.id !== 'string' ||
    !videoIdPattern.test(video.id) ||
    typeof video.title !== 'string' ||
    typeof video.description !== 'string'
  )
    throw admissionError('invalid_payload');
  if (payload.notes != null && typeof payload.notes !== 'string')
    throw admissionError('invalid_payload');
  const formats = [
    ...formatDeclarations(payload.notes),
    ...formatDeclarations(video.description),
  ];
  if (
    payload.provider === 'victory-road' &&
    payload.format != null &&
    payload.format !== ''
  ) {
    if (typeof payload.format !== 'string')
      throw admissionError('invalid_payload');
    formats.push(payload.format);
  }
  if (!formats.length) throw admissionError('missing_regulation');
  const context = [...formats, video.title, video.description];
  const regulations = formats.map((format) => {
    if (unsupportedFormat(format)) throw admissionError('unsupported_format');
    const regulation = championRegulation(format);
    if (!regulation || !['ma', 'mb', 'mc'].includes(regulation))
      throw admissionError('unsupported_format');
    return regulation.toUpperCase();
  });
  if (new Set(regulations).size !== 1) throw admissionError('format_conflict');
  const title = normalize(video.title);
  if (
    /\bsingles?\b|\bou\b/i.test(video.title) ||
    title.includes('nationaldex') ||
    !context.some(championsEvidence) ||
    !context.some(doublesEvidence)
  )
    throw admissionError('unsupported_format');
  const teamBy = video.description
    .split(/\r?\n/)
    .map((line) =>
      /^\s*Team by(?:\s*:\s*|\s+)(.*?)\s*$/i.exec(line)?.[1]?.trim()
    )
    .find(Boolean);
  const regulation = `M-${regulations[0].slice(-1)}`;
  return {
    sourceName: discoveryCandidate.sourceName,
    indexUrl: discoveryCandidate.indexUrl,
    pasteUrl: discoveryCandidate.pasteUrl,
    expectedSpecies: null,
    replicaCode: null,
    regulation,
    name:
      (typeof payload.title === 'string' ? payload.title.trim() : '') ||
      video.title,
    creator: teamBy || '',
    reports: [
      {
        event: `${discoveryCandidate.sourceName} collection`,
        rank: '',
        sourceUrl: discoveryCandidate.indexUrl,
      },
      {
        event: `${discoveryCandidate.sourceName} video`,
        rank: '',
        sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
      },
    ],
  };
}

export function youtubeIndexData(discoveryCandidate, payload) {
  const candidate = youtubeCandidate(discoveryCandidate, payload);
  return {
    candidate,
    payload: {
      ...payload,
      ...(payload.provider === 'victory-road'
        ? { format: `vgcregulation${normalize(candidate.regulation)}` }
        : {}),
      publishedAt:
        payload.publishedAt ||
        discoveryCandidate.video.publishedAt.slice(0, 10),
    },
  };
}

export function youtubeCollectionTeams(teams, channel) {
  const event = `${channel.name} collection`;
  return teams.filter(
    (team) =>
      Array.isArray(team.reports) &&
      team.reports.some(
        (report) => report?.event === event && report.sourceUrl === channel.url
      )
  );
}

export function youtubeImportRows(source, previousTeams) {
  return youtubeChannels.map((channel) => {
    const discovery = source.channels.find(
      (entry) => entry.url === channel.url
    );
    return {
      name: channel.name,
      url: channel.url,
      youtube: true,
      source: {
        candidates: discovery?.candidates || [],
        skipped: [],
        videosScanned: discovery?.videosScanned || 0,
      },
      retainedTeams: source.active
        ? []
        : youtubeCollectionTeams(previousTeams, channel),
    };
  });
}

export function youtubeRetainedSourceText(rows) {
  return JSON.stringify(
    rows
      .flatMap(({ name, retainedTeams }) =>
        retainedTeams.map(({ id, regulation, pasteUrl, reports }) => ({
          channel: name,
          id,
          regulation,
          pasteUrl,
          reports,
        }))
      )
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      )
  );
}

export function youtubePrior(candidate, teams) {
  const collectionEvent = `${candidate.sourceName} collection`;
  const videoEvent = `${candidate.sourceName} video`;
  const videoUrl = `https://www.youtube.com/watch?v=${candidate.video.id}`;
  return teams.find(
    (team) =>
      team.pasteUrl === candidate.pasteUrl &&
      Array.isArray(team.reports) &&
      team.reports.some(
        (report) =>
          report?.event === collectionEvent &&
          report.sourceUrl === candidate.indexUrl
      ) &&
      team.reports.some(
        (report) =>
          report?.event === videoEvent && report.sourceUrl === videoUrl
      )
  );
}

export async function loadYoutubeSource({
  cache = '.cache/catalog',
  refresh = false,
  offline = false,
  apiKey,
} = {}) {
  const keyPresent = apiKey !== undefined && apiKey !== null && apiKey !== '';
  if (
    keyPresent &&
    (typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(apiKey))
  )
    throw new Error('YOUTUBE_API_KEY contains invalid characters.');

  const directory = resolve(cache || '.cache/catalog');
  const snapshotPath = join(directory, 'youtube-sources.json');
  if (offline || !keyPresent || refresh !== true) {
    const snapshot = await readSnapshot(snapshotPath);
    if (snapshot === invalidSnapshot) {
      if (!keyPresent || offline) throw fail('Cached snapshot is invalid.');
    } else if (snapshot) {
      return {
        active: true,
        sourceText: JSON.stringify({ version: 1, channels: snapshot }),
        channels: snapshot,
      };
    } else if (offline && keyPresent) {
      throw fail('Enabled YouTube source has no offline snapshot.');
    } else if (!keyPresent) {
      console.warn(
        'YouTube source inactive: YOUTUBE_API_KEY is not configured.'
      );
      return { active: false, sourceText: '', channels: [] };
    }
  }

  const channels = [];
  for (const channel of youtubeChannels)
    channels.push(await scanChannel(channel, apiKey));
  const validatedChannels = validateSnapshot({ version: 1, channels });
  await writeSnapshot(directory, validatedChannels);
  return {
    active: true,
    sourceText: JSON.stringify({ version: 1, channels: validatedChannels }),
    channels: validatedChannels,
  };
}
