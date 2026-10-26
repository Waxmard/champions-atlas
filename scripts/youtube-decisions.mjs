import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eligibilitySourceTexts } from './champions-eligibility.mjs';

const fileName = 'youtube-decisions.json';
const sourceNames = [
  'import-catalog',
  'catalog-payloads',
  'youtube-admission',
  'youtube-priors',
];
const maxDecisions = 20000;
const keyPattern =
  /^[A-Za-z0-9_-]{11}\|https:\/\/(?:pokepast\.es\/[a-f0-9]{16}|www\.vrpastes\.com\/[A-Za-z0-9]{8})$/;
const digestPattern = /^[a-f0-9]{64}$/;
const reasonPattern = /^[a-z0-9_]{1,64}$/;

export const retriableReasons = new Set([
  'paste_unavailable',
  'invalid_payload',
]);

const plainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const youtubeDecisionKey = (candidate) =>
  `${candidate.video.id}|${candidate.pasteUrl}`;

export const youtubeVideoDigest = (video) =>
  createHash('sha256')
    .update(JSON.stringify([video.title, video.description, video.publishedAt]))
    .digest('hex');

async function rulesDigest() {
  const texts = [
    ...eligibilitySourceTexts,
    ...(await Promise.all(
      sourceNames.map((name) =>
        readFile(
          fileURLToPath(new URL(`./${name}.mjs`, import.meta.url)),
          'utf8'
        )
      )
    )),
  ];
  return createHash('sha256').update(texts.join('\n')).digest('hex');
}

function createLedger(rules, entries) {
  const kept = new Map();
  return {
    reuse(candidate) {
      const key = youtubeDecisionKey(candidate);
      const entry = entries.get(key);
      if (!entry || entry.video !== youtubeVideoDigest(candidate.video))
        return null;
      kept.set(key, entry);
      return entry.reason;
    },
    skip(candidate, reason) {
      const key = youtubeDecisionKey(candidate);
      kept.delete(key);
      if (retriableReasons.has(reason) || !reasonPattern.test(reason)) return;
      kept.set(key, { video: youtubeVideoDigest(candidate.video), reason });
    },
    get size() {
      return kept.size;
    },
    serialize() {
      const decisions = {};
      for (const key of [...kept.keys()].sort()) decisions[key] = kept.get(key);
      return `${JSON.stringify({ version: 1, rules, decisions })}\n`;
    },
  };
}

function parseDecisions(text, rules) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Map();
  }
  if (
    !plainObject(parsed) ||
    parsed.version !== 1 ||
    parsed.rules !== rules ||
    !plainObject(parsed.decisions)
  )
    return new Map();
  const entries = Object.entries(parsed.decisions);
  if (entries.length > maxDecisions) return new Map();
  for (const [key, entry] of entries) {
    if (
      !keyPattern.test(key) ||
      !plainObject(entry) ||
      typeof entry.video !== 'string' ||
      !digestPattern.test(entry.video) ||
      typeof entry.reason !== 'string' ||
      !reasonPattern.test(entry.reason)
    )
      return new Map();
  }
  return new Map(
    entries.map(([key, entry]) => [
      key,
      { video: entry.video, reason: entry.reason },
    ])
  );
}

export async function readYoutubeDecisions(cache) {
  const rules = await rulesDigest();
  let text;
  try {
    text = await readFile(join(cache, fileName), 'utf8');
  } catch {
    return createLedger(rules, new Map());
  }
  return createLedger(rules, parseDecisions(text, rules));
}

export async function writeYoutubeDecisions(cache, ledger) {
  const path = join(cache, fileName);
  const text = ledger.serialize();
  if ((await readFile(path, 'utf8').catch(() => null)) === text) return;
  await mkdir(cache, { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
