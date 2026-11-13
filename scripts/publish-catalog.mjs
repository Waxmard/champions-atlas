import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalogBundle } from '../src/lib/catalog-data.ts';
import { admittedTeams } from '../src/lib/catalog.ts';
import { teamEligibilityError } from './champions-eligibility.mjs';

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

async function writeAtomic(targetPath, contents) {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(tempPath, contents, 'utf8');
  await rename(tempPath, targetPath);
}

function latestBatch(previous, catalog) {
  if (!previous) return undefined;
  const before = new Set(previous.teams.map((team) => team.id));
  const ids = admittedTeams(catalog.teams, catalog.currentRegulation)
    .map((team) => team.id)
    .filter((id) => !before.has(id));
  return ids.length
    ? { addedAt: catalog.updatedAt, ids }
    : previous.latestBatch;
}

async function publishedBundle(origin) {
  const manifest = await fetch(`${origin}/catalog/manifest.json`);
  if (manifest.status === 404) return null;
  if (!manifest.ok)
    throw new Error(
      `Published manifest request failed: HTTP ${manifest.status}.`
    );
  const { bundlePath } = await manifest.json();
  const bundle = await fetch(`${origin}${bundlePath}`);
  if (!bundle.ok)
    throw new Error(`Published bundle request failed: HTTP ${bundle.status}.`);
  return bundle.json();
}

export async function buildCatalogRelease({
  catalogPath = 'src/lib/data/catalog.json',
  tagsPath = 'src/lib/data/team-tags.json',
  outDir = '.cache/hosting',
  previous = null,
} = {}) {
  const [catalogRaw, tagsRaw] = await Promise.all([
    readFile(catalogPath, 'utf8'),
    readFile(tagsPath, 'utf8'),
  ]);
  const catalog = JSON.parse(catalogRaw);
  const tags = JSON.parse(tagsRaw);

  if (!isPlainObject(catalog))
    throw new Error('Catalog JSON must be an object.');
  if (
    typeof catalog.updatedAt !== 'string' ||
    !catalog.updatedAt.trim() ||
    Number.isNaN(Date.parse(catalog.updatedAt))
  )
    throw new Error('Catalog updatedAt must be a valid ISO timestamp.');
  if (
    typeof catalog.currentRegulation !== 'string' ||
    !catalog.currentRegulation.trim()
  )
    throw new Error('Catalog currentRegulation is required.');
  if (
    typeof catalog.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(catalog.sourceHash)
  )
    throw new Error(
      'Catalog sourceHash must be a 64-character lowercase hex string.'
    );
  if (!Array.isArray(catalog.sources) || !catalog.sources.length)
    throw new Error('Catalog sources must be a non-empty array.');
  if (!Array.isArray(catalog.teams) || !catalog.teams.length)
    throw new Error('Catalog teams must be a non-empty array.');
  if (!isPlainObject(tags) || !isPlainObject(tags.teams))
    throw new Error('Team tags must contain a plain teams object.');

  const ids = new Set();
  for (const team of catalog.teams) {
    if (!isPlainObject(team) || typeof team.id !== 'string' || !team.id.trim())
      throw new Error('Every catalog team must have a non-empty id.');
    if (ids.has(team.id))
      throw new Error(`Duplicate catalog team id: ${team.id}`);
    ids.add(team.id);
    const eligibilityError = teamEligibilityError(team);
    if (eligibilityError)
      throw new Error(
        `Ineligible catalog team ${team.id}: ${eligibilityError}`
      );
  }

  const batch = latestBatch(previous, catalog);
  const bundle = {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt,
    currentRegulation: catalog.currentRegulation,
    sourceHash: catalog.sourceHash,
    sources: catalog.sources,
    teams: catalog.teams,
    tags: { teams: tags.teams },
    ...(batch && { latestBatch: batch }),
  };
  validateCatalogBundle(bundle);
  const bundleJson = JSON.stringify(bundle);
  const bundleHash = createHash('sha256').update(bundleJson).digest('hex');
  const bundlePath = `/catalog/bundle-${bundleHash}.json`;
  const manifest = {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt,
    currentRegulation: catalog.currentRegulation,
    sourceHash: catalog.sourceHash,
    bundleHash,
    bundlePath,
  };

  await rm(outDir, { recursive: true, force: true });
  const manifestFilePath = join(outDir, 'catalog', 'manifest.json');
  const bundleFilePath = join(outDir, 'catalog', `bundle-${bundleHash}.json`);
  const indexFilePath = join(outDir, 'index.html');

  await writeAtomic(bundleFilePath, bundleJson);
  await writeAtomic(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeAtomic(
    indexFilePath,
    '<!doctype html><meta charset="utf-8"><title>Champion\'s Atlas Data</title>\n'
  );

  return {
    manifest,
    bundle,
    manifestPath: manifestFilePath,
    bundleFilePath,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const origin = process.env.CATALOG_ORIGIN;
  if (!origin && process.env.CI)
    throw new Error(
      'CATALOG_ORIGIN is required in CI; publishing without it would drop the new-team batch.'
    );
  if (!origin)
    console.warn(
      'CATALOG_ORIGIN is not set; this release carries no new-team batch.'
    );
  const { manifest } = await buildCatalogRelease({
    previous: origin ? await publishedBundle(origin) : null,
  });
  console.log(
    `Published catalog bundle ${manifest.bundlePath} (${manifest.updatedAt}).`
  );
}
