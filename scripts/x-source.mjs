import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalize } from '../src/lib/catalog.ts';
import { parseVrPaste } from './catalog-sources.mjs';

export const xApiBase = () =>
  process.env.X_API_BASE || 'https://api.fxtwitter.com';

export const xQueries = [
  'pokepast.es (pokemon champions) team',
  'pokepast.es #pokemonchampions',
  'vrpastes.com pokemonchampions',
  'vrpastes.com (pokemon champions)',
];

export const xAuthorQuery = (handle) =>
  `from:${handle} (pokepast.es OR vrpastes.com)`;

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
  return pair ? `${pair[0].toUpperCase()}-${pair[1].toUpperCase()}` : null;
};

const vgcPattern = /vgcregulation([a-z]{2})$/;
const showdownPattern = /champions.*reg([a-z]{2})$/;

export const xRegulation = (value) =>
  regulationOf(vgcPattern, value) ?? regulationOf(showdownPattern, value);

const formatLine = (notes) => {
  if (typeof notes !== 'string') return null;
  for (const line of notes.split(/\r?\n/)) {
    const match = /^\s*Format\s*:\s*(.*?)\s*$/i.exec(line);
    if (match) return match[1];
  }
  return null;
};

/* Victory Road payloads are format-checked against the VGC label alone, so a
   paste carrying a Showdown format string must not claim a regulation. */
export const xRegulationFor = (kind, payload) => {
  try {
    return kind === 'victory-road'
      ? regulationOf(vgcPattern, parseVrPaste(payload).format)
      : xRegulation(formatLine(payload?.notes));
  } catch {
    return null;
  }
};

const postedAt = (status) => {
  const seconds = status?.created_timestamp;
  if (Number.isSafeInteger(seconds) && seconds > 0)
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(status?.created_at ?? '');
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

const thumbnail = (address) =>
  typeof address === 'string'
    ? address.replace(/([?&]name=)[^&]*/, '$1small')
    : '';

export const projectPost = (status) => ({
  url: status?.url ?? '',
  handle: status?.author?.screen_name ?? '',
  name: status?.author?.name ?? '',
  verified:
    status?.author?.verification?.verified ?? status?.author?.verified ?? false,
  createdAt: postedAt(status),
  text: status?.text ?? '',
  state: 'ok',
  media: (Array.isArray(status?.media?.photos) ? status.media.photos : [])
    .filter((photo) => typeof photo?.url === 'string' && photo.url)
    .slice(0, 2)
    .map((photo) => ({
      type: 'photo',
      remote: thumbnail(photo.url),
      local: null,
      alt: photo.altText ?? null,
      width: Number.isInteger(photo.width) ? photo.width : null,
      height: Number.isInteger(photo.height) ? photo.height : null,
    })),
});

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

export const readXCandidates = async (cache) => {
  let raw;
  try {
    raw = await readFile(resolve(cache, 'x-posts.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const index = JSON.parse(raw);
  const candidates = [];
  const skipped = [];
  for (const post of Object.values(index?.posts ?? {})) {
    if (!post?.url) continue;
    const pastes = (Array.isArray(post.pastes) ? post.pastes : []).filter(
      (paste) => paste?.url
    );
    if (!pastes.length) {
      skipped.push({
        sourceUrl: post.url,
        pasteUrl: '',
        reason: 'missing_paste',
      });
      continue;
    }
    const regulated = pastes.filter((paste) => paste.regulation);
    if (!regulated.length) {
      skipped.push({
        sourceUrl: post.url,
        pasteUrl: pastes[0].url,
        reason: 'unsupported_format',
      });
      continue;
    }
    const paste = regulated[0];
    const payload = await readPayload(cache, paste);
    if (!payload) {
      skipped.push({
        sourceUrl: post.url,
        pasteUrl: paste.url,
        reason: 'paste_unavailable',
      });
      continue;
    }
    const creator = post.name || post.handle || 'Unknown';
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    candidates.push({
      sourceName: 'X',
      indexUrl: post.url,
      name:
        title && !/^Untitled \d+$/.test(title) ? title : `${creator} — X post`,
      creator,
      regulation: paste.regulation,
      pasteUrl: paste.url,
      replicaCode: null,
      expectedSpecies: null,
      reports: [{ event: '', rank: '', sourceUrl: post.url }],
    });
  }
  return { candidates, skipped, raw };
};
