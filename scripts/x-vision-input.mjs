import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const maxPhotos = 4;
export const maxImageBytes = 8 * 1024 * 1024;
export const maxPostImageBytes = 32 * 1024 * 1024;
export const requestTimeoutMs = 120_000;
const maxTextChars = 1200;
const maxUrlChars = 2048;

export class VisionInputError extends Error {}

export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');

const cleanClip = (value, limit) => {
  const clipped = value.slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped;
};

export function normalizeImageUrl(value) {
  if (typeof value !== 'string' || value.length > maxUrlChars)
    throw new VisionInputError('invalid image URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new VisionInputError('invalid image URL');
  }
  const names = url.searchParams.getAll('name');
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'pbs.twimg.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    names.length !== 1 ||
    names[0] !== 'orig'
  )
    throw new VisionInputError('image must be an original pbs.twimg.com photo');
  return url.href;
}

export function imageMime(bytes) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  return null;
}

export async function readBounded(response, maxBytes) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maxBytes)
    throw new VisionInputError('response exceeds byte limit');
  if (!response.body) throw new Error('empty response body');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new VisionInputError('response exceeds byte limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function storeAtomic(path, bytes) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function fetchVisionImage(
  value,
  { fetchImpl = fetch, cacheDir = '.cache/catalog', fresh = false } = {}
) {
  const url = normalizeImageUrl(value);
  const root = resolve(cacheDir, 'x-vision', 'images');
  const path = join(root, digest(url) + '.bin');
  let bytes;
  if (!fresh) {
    try {
      bytes = await readFile(path);
      if (bytes.length > maxImageBytes)
        throw new VisionInputError('image exceeds 8 MiB');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!bytes) {
    const response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.redirected)
      throw new VisionInputError('image redirect rejected');
    if (!response.ok)
      throw new Error('image request status ' + response.status);
    bytes = await readBounded(response, maxImageBytes);
    if (!imageMime(bytes))
      throw new VisionInputError('unsupported image signature');
    await mkdir(root, { recursive: true });
    await storeAtomic(path, bytes);
  }
  const mime = imageMime(bytes);
  if (!mime) throw new VisionInputError('unsupported image signature');
  return { bytes, mime, sha256: digest(bytes), url };
}

export function normalizedPost(post) {
  if (!post || typeof post !== 'object' || Array.isArray(post))
    throw new VisionInputError('invalid post');
  const id = cleanClip(String(post.id ?? post.postId ?? post.url ?? ''), 256);
  const url =
    typeof post.url === 'string' ? cleanClip(post.url, maxUrlChars) : '';
  const text = cleanClip(
    typeof post.text === 'string' ? post.text : '',
    maxTextChars
  );
  const media = (
    Array.isArray(post.media) ? post.media.slice(0, maxPhotos) : []
  ).map((entry, position) => {
    const index =
      entry && typeof entry === 'object' && Number.isInteger(entry.index)
        ? entry.index
        : position;
    const imageUrl =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object'
          ? (entry.original ?? entry.url)
          : null;
    const sha256 =
      entry && typeof entry === 'object' ? entry.sha256 : undefined;
    if (!Number.isInteger(index) || index < 0 || index >= maxPhotos)
      throw new VisionInputError('invalid photo index');
    if (
      sha256 !== undefined &&
      (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256))
    )
      throw new VisionInputError('invalid image hash');
    return {
      index,
      url: normalizeImageUrl(imageUrl),
      ...(sha256 === undefined ? {} : { sha256 }),
    };
  });
  if (new Set(media.map((entry) => entry.index)).size !== media.length)
    throw new VisionInputError('duplicate photo index');
  media.sort((left, right) => left.index - right.index);
  return { id, url, text, media };
}

export function imageContent(image) {
  const base64 = Buffer.from(
    image.bytes.buffer,
    image.bytes.byteOffset,
    image.bytes.byteLength
  ).toString('base64');
  return {
    type: 'image_url',
    image_url: { url: `data:${image.mime};base64,${base64}` },
  };
}
