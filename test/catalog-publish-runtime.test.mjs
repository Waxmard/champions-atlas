import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCatalogRelease } from '../scripts/publish-catalog.mjs';
import bundledCatalog, {
  BUNDLE_MAX_BYTES,
  MANIFEST_MAX_BYTES,
  fetchCatalogUpdate,
  readBoundedJson,
  tags as bundledTags,
  validateCatalogBundle,
  validateCatalogManifest,
} from '../src/lib/catalog-data.ts';

function sampleFixture() {
  const firstTeam = structuredClone(bundledCatalog.teams[0]);
  const secondTeam = structuredClone(bundledCatalog.teams[1]);
  const catalog = {
    updatedAt: '2026-10-24T06:17:00.000Z',
    currentRegulation: bundledCatalog.currentRegulation,
    sourceHash: 'a'.repeat(64),
    sources: structuredClone(bundledCatalog.sources.slice(0, 2)),
    teams: [firstTeam, secondTeam],
  };
  const tags = {
    teams: {
      [firstTeam.id]: bundledTags.teams[firstTeam.id] ?? {
        archetype: 'balance',
        roles: { 1: 'support' },
      },
    },
  };
  return { catalog, tags };
}

test('buildCatalogRelease writes valid manifest and content-addressed bundle and rejects invalid inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-publish-'));
  try {
    const { catalog, tags } = sampleFixture();
    const catalogPath = join(dir, 'catalog.json');
    const tagsPath = join(dir, 'team-tags.json');
    const outDir = join(dir, 'out');
    await writeFile(catalogPath, JSON.stringify(catalog), 'utf8');
    await writeFile(tagsPath, JSON.stringify(tags), 'utf8');

    const { manifest, bundle, manifestPath, bundleFilePath } =
      await buildCatalogRelease({ catalogPath, tagsPath, outDir });

    const writtenManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const writtenBundleText = await readFile(bundleFilePath, 'utf8');
    const writtenBundle = JSON.parse(writtenBundleText);
    const expectedHash = createHash('sha256')
      .update(writtenBundleText)
      .digest('hex');

    assert.equal(manifest.bundleHash, expectedHash);
    assert.equal(manifest.bundlePath, `/catalog/bundle-${expectedHash}.json`);
    assert.deepEqual(validateCatalogManifest(writtenManifest), manifest);
    assert.deepEqual(validateCatalogBundle(writtenBundle), bundle);

    const emptyCatalogPath = join(dir, 'empty-catalog.json');
    await writeFile(
      emptyCatalogPath,
      JSON.stringify({ ...catalog, teams: [] }),
      'utf8'
    );
    await assert.rejects(
      () =>
        buildCatalogRelease({
          catalogPath: emptyCatalogPath,
          tagsPath,
          outDir: join(dir, 'out-empty'),
        }),
      /non-empty array/
    );

    const ineligible = structuredClone(catalog);
    ineligible.teams[0].members[0].pokemon = 'Mewtwo';
    const ineligiblePath = join(dir, 'ineligible-catalog.json');
    await writeFile(ineligiblePath, JSON.stringify(ineligible), 'utf8');
    await assert.rejects(
      () =>
        buildCatalogRelease({
          catalogPath: ineligiblePath,
          tagsPath,
          outDir: join(dir, 'out-ineligible'),
        }),
      /Ineligible catalog team/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validateCatalogManifest and validateCatalogBundle enforce schema, uniqueness, battle forms, and byte limits', async () => {
  const { catalog, tags } = sampleFixture();
  const bundle = {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt,
    currentRegulation: catalog.currentRegulation,
    sourceHash: catalog.sourceHash,
    sources: catalog.sources,
    teams: catalog.teams,
    tags,
  };
  const bundleHash = createHash('sha256')
    .update(JSON.stringify(bundle))
    .digest('hex');
  const manifest = {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt,
    currentRegulation: catalog.currentRegulation,
    sourceHash: catalog.sourceHash,
    bundleHash,
    bundlePath: `/catalog/bundle-${bundleHash}.json`,
  };

  assert.equal(validateCatalogManifest(manifest).bundleHash, bundleHash);
  assert.equal(validateCatalogBundle(bundle).teams.length, 2);

  assert.throws(
    () =>
      validateCatalogManifest({
        ...manifest,
        bundlePath: '/catalog/bundle-other.json',
      }),
    /Invalid catalog manifest/
  );

  const duplicateIds = structuredClone(bundle);
  duplicateIds.teams[1].id = duplicateIds.teams[0].id;
  assert.throws(
    () => validateCatalogBundle(duplicateIds),
    /Invalid catalog bundle/
  );

  const unresolvedForm = structuredClone(bundle);
  unresolvedForm.teams[0].members[0] = {
    ...unresolvedForm.teams[0].members[0],
    pokemon: 'Ogerpon-Hearthflame',
    item: 'Leftovers',
    ability: 'Mold Breaker',
  };
  assert.throws(
    () => validateCatalogBundle(unresolvedForm),
    /Invalid catalog bundle/
  );

  const oversizedManifest = new Response(
    JSON.stringify({ pad: 'x'.repeat(MANIFEST_MAX_BYTES + 100) }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
  await assert.rejects(
    () => readBoundedJson(oversizedManifest, MANIFEST_MAX_BYTES),
    /exceeds/
  );
  assert.equal(BUNDLE_MAX_BYTES, 15 * 1024 * 1024);
});

test('fetchCatalogUpdate skips matching hash, rejects older bundles, ignores failures, and returns newer catalog', async () => {
  const { catalog, tags } = sampleFixture();
  const bundle = {
    schemaVersion: 1,
    updatedAt: '2026-10-25T06:17:00.000Z',
    currentRegulation: catalog.currentRegulation,
    sourceHash: 'b'.repeat(64),
    sources: catalog.sources,
    teams: catalog.teams,
    tags,
  };
  const bundleJson = JSON.stringify(bundle);
  const bundleHash = createHash('sha256').update(bundleJson).digest('hex');
  const manifest = {
    schemaVersion: 1,
    updatedAt: bundle.updatedAt,
    currentRegulation: bundle.currentRegulation,
    sourceHash: bundle.sourceHash,
    bundleHash,
    bundlePath: `/catalog/bundle-${bundleHash}.json`,
  };
  const endpoint = 'https://champions-atlas-test.web.app/catalog/manifest.json';
  const baselineUpdatedAt = '2026-10-23T00:00:00.000Z';

  let bundleFetched = 0;
  const sameHashResult = await fetchCatalogUpdate(
    {
      updatedAt: manifest.updatedAt,
      sourceHash: manifest.sourceHash,
      bundleHash: manifest.bundleHash,
    },
    {
      endpoint,
      baselineUpdatedAt,
      fetcher: async (url) => {
        if (String(url).endsWith('/manifest.json'))
          return new Response(JSON.stringify(manifest), { status: 200 });
        bundleFetched++;
        return new Response(bundleJson, { status: 200 });
      },
    }
  );
  assert.equal(sameHashResult, null);
  assert.equal(bundleFetched, 0);

  const olderResult = await fetchCatalogUpdate(
    {
      updatedAt: '2026-10-26T00:00:00.000Z',
      sourceHash: 'c'.repeat(64),
    },
    {
      endpoint,
      baselineUpdatedAt: '2026-10-26T00:00:00.000Z',
      fetcher: async () =>
        new Response(JSON.stringify(manifest), { status: 200 }),
    }
  );
  assert.equal(olderResult, null);

  const failedBundleResult = await fetchCatalogUpdate(
    {
      updatedAt: baselineUpdatedAt,
      sourceHash: 'c'.repeat(64),
    },
    {
      endpoint,
      baselineUpdatedAt,
      fetcher: async (url) => {
        if (String(url).endsWith('/manifest.json'))
          return new Response(JSON.stringify(manifest), { status: 200 });
        return new Response('{"broken":true}', { status: 200 });
      },
    }
  );
  assert.equal(failedBundleResult, null);

  const updated = await fetchCatalogUpdate(
    {
      updatedAt: baselineUpdatedAt,
      sourceHash: 'c'.repeat(64),
    },
    {
      endpoint,
      baselineUpdatedAt,
      fetcher: async (url) => {
        if (String(url).endsWith('/manifest.json'))
          return new Response(JSON.stringify(manifest), { status: 200 });
        return new Response(bundleJson, { status: 200 });
      },
    }
  );
  assert.ok(updated);
  assert.equal(updated.bundleHash, bundleHash);
  assert.equal(updated.catalog.updatedAt, bundle.updatedAt);
  assert.equal(updated.catalog.teams.length, 2);
  assert.deepEqual(updated.tags, tags);
});
