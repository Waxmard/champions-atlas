import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../src/lib/catalog.ts';
import { parsePaste } from '../src/lib/paste.ts';
import {
  fetchWithRetry,
  isTransient,
  parseVrPaste,
} from './catalog-sources.mjs';
import {
  X_POST_RE,
  parseSearchPage,
  projectPost,
  xApiBase,
  xAuthorQuery,
  xPastesIn,
  xQueries,
  xRegulationFor,
} from './x-source.mjs';

const output = resolve('src/lib/data/team-posts.json');
const searchCount = 40;

const limit = (env, name, fallback) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const providerApi = (paste) =>
  paste.kind === 'victory-road'
    ? `https://vrpaste-backend.vercel.app/api/paste/${paste.url.split('/').at(-1)}?lang=english`
    : `${paste.url}/json`;

const payloadName = (paste) =>
  `${paste.kind === 'victory-road' ? 'vr-' : ''}${paste.url.split('/').at(-1)}.json`;

const matchesCreator = (creator, post) =>
  normalize(creator) !== '' &&
  (normalize(creator) === normalize(post.name ?? '') ||
    normalize(creator) === normalize(post.handle ?? ''));

/* Post text is user content: cutting it between surrogate halves leaves a lone
   high surrogate that JSON.stringify keeps as an unpaired \uD83D escape, which
   the bundler's JSON parser rejects. */
const clip = (text) => {
  const cut = (text ?? '').slice(0, 200);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
};

export async function ingestX({
  fetchImpl = fetch,
  cacheDir = '.cache/catalog',
  catalogPath = 'src/lib/data/catalog.json',
  outputPath = output,
  imagesDir = 'static/posts',
  env = process.env,
} = {}) {
  const cache = resolve(cacheDir);
  const postsFile = resolve(cache, 'x-posts.json');
  const images = resolve(imagesDir);
  const api = xApiBase();
  const indexRefresh = env.REFRESH === '1' || env.CHECK_SHEET === '1';
  const pages = limit(env, 'X_PAGE_LIMIT', 1);
  const postLimit = limit(env, 'X_POST_LIMIT', 400);
  const imageLimit = limit(env, 'X_IMAGE_LIMIT', 60);
  const authorLimit = limit(env, 'X_AUTHOR_LIMIT', 40);
  const staleAfter = indexRefresh
    ? 0
    : limit(env, 'X_REFRESH_DAYS', 30) * 86400000;
  const now = Date.now();
  await mkdir(cache, { recursive: true });

  let cached = { posts: {}, seenPastes: {}, authorCursor: 0 };
  let hasCache = false;
  try {
    const parsed = JSON.parse(await readFile(postsFile, 'utf8'));
    if (parsed && typeof parsed === 'object')
      cached = { ...cached, ...parsed, posts: parsed.posts ?? {} };
    hasCache = true;
  } catch (error) {
    if (error.code !== 'ENOENT')
      console.warn(`X: ignored unreadable post index (${error.message})`);
  }
  const stored = cached.posts;

  const citedHandles = new Set();
  const citedCreators = new Map();
  const catalogPastes = new Set();
  const cited = new Map();
  try {
    const data = JSON.parse(await readFile(resolve(catalogPath), 'utf8'));
    for (const team of data?.teams ?? []) {
      if (typeof team?.pasteUrl === 'string' && team.pasteUrl)
        catalogPastes.add(team.pasteUrl.split('/').at(-1));
      for (const report of team?.reports ?? []) {
        const match = X_POST_RE.exec(report?.sourceUrl ?? '');
        if (!match) continue;
        if (!cited.has(match[2])) cited.set(match[2], report.sourceUrl);
        citedHandles.add(match[1]);
        if (!citedCreators.has(match[2]))
          citedCreators.set(match[2], new Set());
        citedCreators.get(match[2]).add(team.creator ?? '');
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const lookupIds = new Map(cited);
  let searches = 0;
  let searchFailures = 0;
  if (indexRefresh) {
    const handles = [
      ...new Set([
        ...citedHandles,
        ...Object.values(stored)
          .map((post) => post?.handle)
          .filter(Boolean),
      ]),
    ].sort();
    const start =
      handles.length && authorLimit > 0
        ? (Number.isSafeInteger(cached.authorCursor)
            ? cached.authorCursor
            : 0) % handles.length
        : 0;
    const rotated = handles.length
      ? [...handles.slice(start), ...handles.slice(0, start)].slice(
          0,
          authorLimit
        )
      : [];
    for (const query of [...xQueries, ...rotated.map(xAuthorQuery)]) {
      searches += 1;
      try {
        const statuses = await search(query, pages, fetchImpl, api);
        for (const status of statuses)
          if (status?.id && !lookupIds.has(status.id))
            lookupIds.set(status.id, `https://x.com/i/status/${status.id}`);
      } catch (error) {
        searchFailures += 1;
        console.warn(`X: skipped search "${query}" (${error.message})`);
      }
    }
    if (handles.length && authorLimit > 0)
      cached.authorCursor = (start + rotated.length) % handles.length;
  }
  const discoveryUnavailable = searches > 0 && searchFailures === searches;

  if (discoveryUnavailable) {
    console.warn('X: discovery unavailable; keeping cached post index');
    if (!hasCache) return { ok: false, posts: 0 };
    await writeFile(postsFile, `${JSON.stringify(cached)}\n`);
    await writePostEvidence(stored, citedCreators, outputPath, now);
    return { ok: true, posts: Object.keys(stored).length };
  }

  const pending = [...lookupIds]
    .map(([id, url]) => ({ id, url, at: Date.parse(stored[id]?.fetchedAt) }))
    .filter(
      (entry) => !Number.isFinite(entry.at) || now - entry.at >= staleAfter
    )
    .map((entry) => ({
      ...entry,
      at: Number.isFinite(entry.at) ? entry.at : 0,
    }))
    .sort((left, right) => left.at - right.at)
    .slice(0, postLimit);

  let added = 0;
  let misses = 0;
  for (const { id, url } of pending) {
    const previous = stored[id];
    let text;
    try {
      const response = await fetchWithRetry(
        `${api}/2/status/${id}`,
        {},
        30000,
        fetchImpl
      );
      if (!response.ok && isTransient(response.status))
        throw new Error(`status ${response.status}`);
      text = await response.text();
      misses = 0;
    } catch (error) {
      console.warn(`X: skipped post ${id} (${error.message})`);
      misses += 1;
      if (misses >= 5) {
        console.warn('X: post lookups unavailable; keeping cached post index');
        break;
      }
      continue;
    }
    let entry = null;
    if (text !== undefined) {
      try {
        const data = JSON.parse(text);
        if (data?.code !== 200 || !data.status)
          throw new Error(`code ${data?.code ?? 'unknown'}`);
        const projected = projectPost(data.status);
        entry = { ...projected, id, url: projected.url || url };
      } catch (error) {
        console.warn(`X: skipped post ${id} (${error.message})`);
      }
    }
    stored[id] = entry ?? {
      id,
      url,
      handle: '',
      name: '',
      verified: false,
      createdAt: '',
      text: '',
      state: 'unavailable',
      media: [],
    };
    stored[id].fetchedAt = new Date(now).toISOString();
    if (!previous) added += 1;
  }

  const known = new Map();
  for (const post of Object.values(stored))
    for (const paste of xPastesIn(post?.text ?? ''))
      if (!known.has(paste.url)) known.set(paste.url, paste);

  let fetchedPastes = 0;
  for (const paste of known.values()) {
    const file = resolve(cache, payloadName(paste));
    let text = null;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (text === null) {
      try {
        const response = await fetchWithRetry(
          providerApi(paste),
          {},
          30000,
          fetchImpl
        );
        if (!response.ok) throw new Error(`status ${response.status}`);
        text = await response.text();
        await writeFile(file, text);
        fetchedPastes += 1;
      } catch (error) {
        console.warn(`X: skipped ${paste.url} (${error.message})`);
        text = null;
      }
    }
    let regulation = null;
    if (text !== null) {
      try {
        const data = JSON.parse(text);
        parsePaste(
          paste.kind === 'victory-road' ? parseVrPaste(data).paste : data.paste
        );
        regulation = xRegulationFor(paste.kind, data);
      } catch {
        regulation = null;
      }
    }
    paste.regulation = regulation;
  }

  const seenPastes = { ...cached.seenPastes };
  for (const post of Object.values(stored)) {
    post.pastes = xPastesIn(post.text ?? '').map((paste) => ({
      ...paste,
      regulation: known.get(paste.url)?.regulation ?? null,
    }));
    for (const paste of post.pastes)
      seenPastes[paste.url.split('/').at(-1)] = true;
  }

  let mirrored = 0;
  if (imageLimit > 0) await mkdir(images, { recursive: true });
  for (const post of Object.values(stored)) {
    if (mirrored >= imageLimit) break;
    const photo = post.state === 'ok' ? post.media?.[0] : null;
    if (!photo?.remote) continue;
    const file = resolve(images, `${post.id}-1.jpg`);
    const already = await stat(file).then(
      () => true,
      () => false
    );
    if (already) {
      photo.local = `/posts/${post.id}-1.jpg`;
      continue;
    }
    try {
      const response = await fetchWithRetry(photo.remote, {}, 30000, fetchImpl);
      const type = response.headers?.get?.('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 400 * 1024) continue;
      await writeFile(file, bytes);
      photo.local = `/posts/${post.id}-1.jpg`;
      mirrored += 1;
    } catch (error) {
      console.warn(`X: skipped image ${photo.remote} (${error.message})`);
    }
  }

  cached.posts = stored;
  cached.seenPastes = seenPastes;
  cached.generatedAt = new Date(now).toISOString();
  await writeFile(postsFile, `${JSON.stringify(cached)}\n`);
  await writePostEvidence(stored, citedCreators, outputPath, now);
  const fresh = [...known.keys()].filter(
    (url) => !catalogPastes.has(url.split('/').at(-1))
  ).length;
  console.log(
    `X: ${added} new posts, ${fetchedPastes} pastes fetched (${fresh} not in the catalog), ${Object.keys(stored).length} posts cached.`
  );
  return { ok: true, posts: Object.keys(stored).length, added };
}

async function search(query, pages, fetchImpl, api) {
  const found = [];
  let cursor = null;
  for (let page = 0; page < pages; page += 1) {
    const address = `${api}/2/search?q=${encodeURIComponent(query)}&count=${searchCount}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await fetchWithRetry(address, {}, 30000, fetchImpl);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const { posts, cursor: next } = parseSearchPage(await response.json());
    found.push(...posts);
    if (!next) break;
    cursor = next;
  }
  return found;
}

async function writePostEvidence(posts, citedCreators, outputPath, now) {
  const entries = Object.fromEntries(
    Object.keys(posts)
      .sort()
      .map((id) => {
        const post = posts[id];
        const creators = citedCreators.get(id);
        const creatorMismatch =
          post.state === 'ok' && creators
            ? [...creators].some((creator) => !matchesCreator(creator, post))
            : false;
        return [
          id,
          {
            url: post.url,
            handle: post.handle,
            name: post.name,
            verified: post.verified,
            createdAt: post.createdAt,
            text: clip(post.text),
            state: post.state,
            creatorMismatch,
            media: post.media ?? [],
            pastes: [...new Set(xPastesIn(post.text ?? '').map((p) => p.url))],
          },
        ];
      })
  );
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(
    resolve(outputPath),
    `${JSON.stringify({ generatedAt: new Date(now).toISOString(), posts: entries })}\n`
  );
}

async function writeStub() {
  try {
    await readFile(output, 'utf8');
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), posts: {} })}\n`
  );
  console.log(
    `Wrote an empty post stub to ${output}; run npm run import:x to fill it.`
  );
}

async function main() {
  if (process.argv.includes('--if-missing')) {
    await writeStub();
    return;
  }
  if (process.env.OFFLINE === '1') {
    await writeStub();
    return;
  }
  const result = await ingestX();
  if (!result.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
