import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { battleSpecies, resolveBattleForm } from '../src/lib/battle-forms.ts';
import { normalize, xStatusId } from '../src/lib/catalog.ts';
import {
  formatChampionsSpread,
  isCompleteSpread,
  parsePaste,
} from '../src/lib/paste.ts';
import { exportPaste } from '../src/lib/workbench.ts';
import { parseVrPaste } from './catalog-sources.mjs';
import {
  automaticVisionQualified,
  createVisionRun,
  revalidateAccepted,
} from './x-vision.mjs';

export const xApiBase = () =>
  process.env.X_API_BASE || 'https://api.fxtwitter.com';

export const xQueries = [
  'pokepast.es (pokemon champions) team',
  'pokepast.es #pokemonchampions',
  'vrpastes.com pokemonchampions',
  'vrpastes.com (pokemon champions)',
  '(pokemon champions) team filter:images',
  '#pokemonchampions team filter:images',
];

export const xAuthorQuery = (handle) =>
  `from:${handle} (pokepast.es OR vrpastes.com OR (pokemon champions) OR #pokemonchampions)`;
export const xSearchUrl =
  'https://x.com/search?q=pokepast.es%20pokemonchampions&f=live';
export const X_POST_RE =
  /^https:\/\/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/;

const pokepastePattern = /https:\/\/pokepast\.es\/([a-f0-9]{16})/g;
const vrPastePattern = /https?:\/\/(?:www\.)?vrpastes\.com\/([A-Za-z0-9]{8})/g;
export const xPastesIn = (text) => {
  const found = [];
  for (const [, id] of String(text).matchAll(pokepastePattern))
    found.push({ url: `https://pokepast.es/${id}`, kind: 'pokepaste' });
  for (const [, id] of String(text).matchAll(vrPastePattern))
    found.push({ url: `https://www.vrpastes.com/${id}`, kind: 'victory-road' });
  return [...new Map(found.map((paste) => [paste.url, paste])).values()];
};

const regulationOf = (pattern, value) => {
  if (typeof value !== 'string') return null;
  const pair = pattern.exec(normalize(value))?.[1];
  return pair ? `M-${pair.toUpperCase()}` : null;
};
const vgcPattern = /^vgcregulationm([abc])$/;
const showdownPattern = /^(?:gen\d+)?champions(?:vgc\d+)?regm([abc])$/;
export const xRegulation = (value) => {
  const regulation =
    regulationOf(/^(?:gen\d+)?vgcregulationm([abc])$/, value) ??
    regulationOf(showdownPattern, value);
  return ['M-A', 'M-B', 'M-C'].includes(regulation) ? regulation : null;
};
const formatsIn = (notes) =>
  typeof notes === 'string'
    ? [...notes.matchAll(/^[\t ]*Format[\t ]*:[\t ]*(.*?)[\t ]*$/gim)].map(
        (match) => match[1]
      )
    : [];

export const xFormatState = (kind, payload) => {
  try {
    const notes = payload?.notes;
    const formats =
      kind === 'victory-road'
        ? [payload?.format]
        : typeof notes === 'string'
          ? formatsIn(notes)
          : notes == null
            ? []
            : [notes];
    if (
      !formats.length ||
      formats.every(
        (format) =>
          format == null || (typeof format === 'string' && !format.trim())
      )
    )
      return 'missing';
    if (formats.some((format) => typeof format !== 'string'))
      return 'unsupported';
    const regulations = formats
      .filter((format) => format.trim())
      .map((format) =>
        kind === 'victory-road'
          ? regulationOf(vgcPattern, format)
          : xRegulation(format)
      );
    if (
      regulations.some((regulation) => !regulation) ||
      new Set(regulations).size !== 1
    )
      return 'unsupported';
    return regulations[0];
  } catch {
    return 'unsupported';
  }
};
export const xRegulationFor = (kind, payload) => {
  const state = xFormatState(kind, payload);
  return ['M-A', 'M-B', 'M-C'].includes(state) ? state : null;
};

const M_REGULATIONS = ['M-A', 'M-B', 'M-C'];
const hasPhotos = (post) => Array.isArray(post?.media) && post.media.length > 0;
export const xPasteMembers = (paste, payload) => {
  try {
    const members = parsePaste(
      paste.kind === 'victory-road'
        ? parseVrPaste(payload).paste
        : payload.paste
    );
    return members.length === 6 &&
      new Set(members.map((member) => normalize(member.pokemon))).size === 6
      ? members
      : null;
  } catch {
    return null;
  }
};
const rosterMatches = (members, expectedSpecies) => {
  if (expectedSpecies === null || expectedSpecies === undefined) return true;
  if (
    !Array.isArray(expectedSpecies) ||
    expectedSpecies.length !== 6 ||
    !expectedSpecies.every((name) => typeof name === 'string' && name.trim())
  )
    return false;
  const canonical = (name) => {
    const species = battleSpecies(name)?.name || name;
    const resolved = resolveBattleForm({
      pokemon: species,
      item: null,
      ability: null,
    });
    return normalize(resolved.error ? species : resolved.pokemon);
  };
  const rows = (names) => names.map(canonical).sort();
  const actual = rows(members.map((member) => member.pokemon));
  return actual.every((name, index) => name === rows(expectedSpecies)[index]);
};

/* One shared X paste decision for the importer and the catalog reader: the
   first usable paste wins, an explicitly unsupported paste stays on record
   even when another paste is merely unreachable, and a paste whose earlier
   validation was recorded is reused while its payload is missing. Only a post
   with photos, no usable paste, and no unsupported evidence may fall back to
   its images. */
export const selectXPaste = async (
  post,
  loadPayload,
  expectedSpecies = null
) => {
  const pastes = (Array.isArray(post?.pastes) ? post.pastes : []).filter(
    (paste) => paste?.url
  );
  let unsupported = false;
  let trusted = null;
  let reason = pastes.length ? 'paste_unavailable' : 'missing_paste';
  for (const paste of pastes) {
    const payload = await loadPayload(paste);
    if (!payload) {
      unsupported ||= paste.unsupported === true;
      if (paste.validated === true) {
        const recorded = M_REGULATIONS.includes(paste.regulation);
        const regulation = recorded ? paste.regulation : xPostRegulation(post);
        trusted ??= {
          paste,
          payload: null,
          regulation,
          inferred: !recorded && regulation !== 'Unknown',
        };
      }
      continue;
    }
    const format = xFormatState(paste.kind, payload);
    if (format === 'unsupported') {
      unsupported = true;
      reason = 'unsupported_format';
      continue;
    }
    const members = xPasteMembers(paste, payload);
    if (!members) {
      reason = 'invalid_payload';
      continue;
    }
    if (!rosterMatches(members, expectedSpecies)) {
      reason = 'roster_mismatch';
      continue;
    }
    const regulation = format === 'missing' ? xPostRegulation(post) : format;
    return {
      selected: {
        paste,
        payload,
        regulation,
        inferred: format === 'missing' && regulation !== 'Unknown',
      },
      reason: null,
      allowImages: false,
    };
  }
  if (trusted) return { selected: trusted, reason: null, allowImages: false };
  if (unsupported)
    return { selected: null, reason: 'unsupported_format', allowImages: false };
  return { selected: null, reason, allowImages: hasPhotos(post) };
};

const postInstant = (status) => {
  const seconds = status?.created_timestamp;
  if (
    Number.isSafeInteger(seconds) &&
    seconds >= 0 &&
    seconds * 1000 <= 8640000000000000
  )
    return new Date(seconds * 1000).toISOString();
  const raw = status?.created_at;
  if (
    typeof raw !== 'string' ||
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    (/^\d{4}-\d{2}-\d{2}/.test(raw) && !validDay(raw.slice(0, 10)))
  )
    return '';
  const parsed = Date.parse(status?.created_at ?? '');
  return Number.isFinite(parsed) && Math.abs(parsed) <= 8640000000000000
    ? new Date(parsed).toISOString()
    : '';
};
const thumbnail = (address) =>
  typeof address === 'string'
    ? address.replace(/([?&]name=)[^&]*/, '$1small')
    : '';
const originalImage = (address) => {
  if (typeof address !== 'string') return '';
  try {
    const url = new URL(address);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'pbs.twimg.com' ||
      url.port ||
      url.username ||
      url.password
    )
      return '';
    url.searchParams.set('name', 'orig');
    return url.href;
  } catch {
    return '';
  }
};
export const projectPost = (status) => {
  const instant = postInstant(status);
  return {
    url: status?.url ?? '',
    handle: status?.author?.screen_name ?? '',
    name: status?.author?.name ?? '',
    verified:
      status?.author?.verification?.verified ??
      status?.author?.verified ??
      false,
    createdAt:
      instant.slice(0, 10) ||
      (validDay(status?.created_at) ? status.created_at : ''),
    createdAtExact: instant,
    text: status?.text ?? '',
    state: 'ok',
    media: (Array.isArray(status?.media?.photos) ? status.media.photos : [])
      .filter((photo) => typeof photo?.url === 'string' && photo.url)
      .slice(0, 4)
      .map((photo, index) => ({
        index,
        type: 'photo',
        remote: thumbnail(photo.url),
        original: originalImage(photo.url),
        local: null,
        alt: photo.altText ?? null,
        width: Number.isInteger(photo.width) ? photo.width : null,
        height: Number.isInteger(photo.height) ? photo.height : null,
      })),
  };
};
export const parseSearchPage = (json) => {
  const results = json?.results;
  if (!Array.isArray(results)) return { posts: [], cursor: null };
  return {
    posts: results.filter((entry) => entry?.type === 'status'),
    cursor: json?.cursor?.bottom ?? null,
  };
};
const payloadName = (paste) =>
  `${paste.kind === 'victory-road' ? 'vr-' : ''}${paste.url.split('/').at(-1)}.json`;
const readPayload = async (cache, paste) => {
  try {
    return JSON.parse(
      await readFile(resolve(cache, payloadName(paste)), 'utf8')
    );
  } catch {
    return null;
  }
};

const schedule = [
  [
    'M-A',
    Date.parse('2026-04-08T02:00:00Z'),
    Date.parse('2026-06-17T02:00:00Z'),
  ],
  [
    'M-B',
    Date.parse('2026-06-17T02:00:00Z'),
    Date.parse('2026-09-09T02:00:00Z'),
  ],
  [
    'M-C',
    Date.parse('2026-09-09T02:00:00Z'),
    Date.parse('2026-12-02T02:00:00Z'),
  ],
];
const validDay = (day) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') &&
  Number.isFinite(Date.parse(day)) &&
  new Date(day).toISOString().slice(0, 10) === day;
const dateRegulation = (exact, day) => {
  if (typeof exact === 'string' && exact) {
    if (
      !validDay(exact.slice(0, 10)) ||
      !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(exact)
    )
      return null;
    const instant = Date.parse(exact);
    if (!Number.isFinite(instant) || Math.abs(instant) > 8640000000000000)
      return null;
    return (
      schedule.find(
        ([, start, end]) => instant >= start && instant < end
      )?.[0] ?? null
    );
  }
  if (!validDay(day)) return null;
  const start = Date.parse(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0, 10) !== day
  )
    return null;
  return (
    schedule.find(
      ([, first, last]) => start >= first && start + 86400000 <= last
    )?.[0] ?? null
  );
};
export const xPostRegulation = (post) =>
  dateRegulation(post.createdAtExact, post.createdAt) ?? 'Unknown';

export const readVisionRecords = async (cache) => {
  const directory = resolve(cache, 'x-vision', 'records');
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  for (const name of names.filter((name) => name.endsWith('.json')).sort()) {
    try {
      records.push(await readFile(join(directory, name), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return records;
};

/* Screenshot sets keep only what the extraction established: a held item is
   the dictionary name, an explicit no-item slot stays null, and ability,
   nature, and points stay unknown unless both passes read them. */
const screenshotMember = (member) => {
  const resolved = resolveBattleForm({
    pokemon: member.pokemon,
    item: member.item,
    ability: member.ability,
  });
  const points = member.allocation?.points ?? null;
  return {
    pokemon: resolved.error ? member.pokemon : resolved.pokemon,
    item: member.itemState === 'none' ? null : member.item,
    ability: member.ability ?? null,
    nature: member.nature ?? null,
    moves: [...member.moves4],
    spread: isCompleteSpread(points) ? formatChampionsSpread(points) : null,
  };
};

export const screenshotTeam = (record, post) => {
  const postId =
    typeof post?.id === 'string' && post.id
      ? post.id
      : xStatusId(post?.url ?? '');
  const result =
    record?.status === 'accepted' && postId
      ? revalidateAccepted(record, post)
      : null;
  if (!result) return null;
  const creator = post.name || post.handle || 'Unknown';
  const regulation = xPostRegulation(post);
  const members = result.members.map(screenshotMember);
  return {
    id: `x-image-${postId}`,
    sheetIds: [],
    name: `${creator} — X post`,
    creator,
    regulation,
    regulationBasis: regulation === 'Unknown' ? undefined : 'post-date',
    publishedAt: post.createdAt || '',
    pasteUrl: '',
    replicaCode: null,
    replicaStatus: '',
    setSource: 'screenshot',
    reports: [{ event: '', rank: '', sourceUrl: post.url }],
    members,
    paste: exportPaste(members),
    pasteNotes: null,
  };
};

/* Cached outcomes load keylessly: a cache hit returns before the missing-key
   branch, and a miss withholds without fetching anything. */
export const xScreenshotTeams = async (posts, cacheDir) => {
  const run = createVisionRun({ cacheDir });
  const teams = [];
  for (const post of posts) {
    const team = screenshotTeam(await run.evaluate(post), post);
    if (team) teams.push(team);
  }
  return teams;
};

export const readXCandidates = async (
  cache,
  { vision = automaticVisionQualified, loadPaste } = {}
) => {
  let raw;
  try {
    raw = await readFile(resolve(cache, 'x-posts.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const index = JSON.parse(raw);
  const load = loadPaste ?? ((paste) => readPayload(cache, paste));
  const candidates = [];
  const skipped = [];
  const imagePosts = [];
  for (const post of Object.values(index?.posts ?? {})) {
    if (!post?.url) continue;
    const decision = await selectXPaste(post, load);
    if (!decision.selected) {
      skipped.push({
        sourceUrl: post.url,
        pasteUrl: (post.pastes ?? [])[0]?.url ?? '',
        reason: decision.reason,
      });
      if (decision.allowImages) imagePosts.push(post);
      continue;
    }
    const { paste, payload, regulation, inferred } = decision.selected;
    const creator = post.name || post.handle || 'Unknown';
    const title =
      typeof payload?.title === 'string' ? payload.title.trim() : '';
    candidates.push({
      sourceName: 'X',
      indexUrl: post.url,
      name:
        title && !/^Untitled \d+$/.test(title) ? title : `${creator} — X post`,
      creator,
      regulation,
      regulationBasis: inferred ? 'post-date' : undefined,
      publishedAt: post.createdAt || '',
      pasteUrl: paste.url,
      replicaCode: null,
      expectedSpecies: null,
      reports: [{ event: '', rank: '', sourceUrl: post.url }],
    });
  }
  return {
    candidates,
    skipped,
    raw,
    visionRaw: await readVisionRecords(cache),
    vision: vision ? await xScreenshotTeams(imagePosts, cache) : [],
  };
};
