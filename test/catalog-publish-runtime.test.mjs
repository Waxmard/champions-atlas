import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeCatalog } from '../scripts/import-catalog.mjs';
import { buildCatalogRelease } from '../scripts/publish-catalog.mjs';
import { readBoundedJson } from '../src/lib/bounded-json.ts';
import bundledCatalog, {
  MANIFEST_MAX_BYTES,
  defaultCatalogEndpoint,
  fetchCatalogUpdate,
  mergeYoutubeCopies,
  selectStoredCatalogBundle,
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
  return { catalog };
}
test('stored catalog selection rejects invalid or older bundles', () => {
  const { catalog } = sampleFixture();
  const bundle = { schemaVersion: 1, ...catalog };
  const baseline = '2026-10-24T06:17:00.000Z';
  assert.deepEqual(selectStoredCatalogBundle(bundle, baseline), bundle);
  assert.deepEqual(
    selectStoredCatalogBundle(
      {
        ...bundle,
        tags: {
          teams: {
            [catalog.teams[0].id]: {
              archetype: 'balance',
              roles: { 1: 'support' },
            },
          },
        },
      },
      baseline
    ),
    bundle
  );
  assert.equal(
    selectStoredCatalogBundle({ ...bundle, teams: [] }, baseline),
    null
  );
  assert.equal(
    selectStoredCatalogBundle(
      { ...bundle, updatedAt: '2026-10-23T06:17:00.000Z' },
      baseline
    ),
    null
  );
});

test('buildCatalogRelease writes valid manifest and content-addressed bundle and rejects invalid inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-publish-'));
  try {
    const { catalog } = sampleFixture();
    const catalogPath = join(dir, 'catalog.json');
    const outDir = join(dir, 'out');
    await writeFile(catalogPath, JSON.stringify(catalog), 'utf8');

    const { manifest, bundle, manifestPath, bundleFilePath } =
      await buildCatalogRelease({ catalogPath, outDir });

    const writtenManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const writtenBundleText = await readFile(bundleFilePath, 'utf8');
    const writtenBundle = JSON.parse(writtenBundleText);
    const expectedHash = createHash('sha256')
      .update(writtenBundleText)
      .digest('hex');

    assert.equal(manifest.bundleHash, expectedHash);
    assert.equal(manifest.bundlePath, `/catalog/bundle-${expectedHash}.json`);
    assert.deepEqual(validateCatalogManifest(writtenManifest), manifest);
    assert.equal(manifestPath, join(outDir, 'catalog', 'manifest-v2.json'));
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
          outDir: join(dir, 'out-ineligible'),
        }),
      /Ineligible catalog team/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validateCatalogManifest and validateCatalogBundle enforce schema, uniqueness, battle forms, and byte limits', async () => {
  const { catalog } = sampleFixture();
  const bundle = {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt,
    currentRegulation: catalog.currentRegulation,
    sourceHash: catalog.sourceHash,
    sources: catalog.sources,
    teams: catalog.teams,
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
    () => readBoundedJson(oversizedManifest, MANIFEST_MAX_BYTES, 'Catalog'),
    /exceeds/
  );
});

test('fetchCatalogUpdate skips matching hash, rejects older bundles, ignores failures, and returns newer catalog', async () => {
  const { catalog } = sampleFixture();
  const bundle = {
    schemaVersion: 1,
    updatedAt: '2026-10-25T06:17:00.000Z',
    currentRegulation: catalog.currentRegulation,
    sourceHash: 'b'.repeat(64),
    sources: catalog.sources,
    teams: catalog.teams,
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
  assert.equal(updated.bundle.updatedAt, bundle.updatedAt);
  assert.equal(updated.bundle.teams.length, 2);
});

test('writeCatalog keeps the previous timestamp when content is unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-write-'));
  try {
    const { catalog } = sampleFixture();
    const target = join(dir, 'catalog.json');
    const later = { ...catalog, updatedAt: '2026-10-25T06:17:00.000Z' };
    await writeCatalog(target, later, catalog);
    assert.equal(
      JSON.parse(await readFile(target, 'utf8')).updatedAt,
      catalog.updatedAt
    );

    await writeCatalog(
      target,
      { ...later, sourceHash: 'b'.repeat(64) },
      catalog
    );
    assert.equal(
      JSON.parse(await readFile(target, 'utf8')).updatedAt,
      later.updatedAt
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fetchCatalogUpdate discards a bundle that disagrees with its manifest', async () => {
  const { catalog } = sampleFixture();
  const bundle = { schemaVersion: 1, ...catalog };
  const bundleJson = JSON.stringify(bundle);
  const manifest = {
    schemaVersion: 1,
    updatedAt: catalog.updatedAt,
    currentRegulation: catalog.currentRegulation,
    sourceHash: catalog.sourceHash,
    bundleHash: createHash('sha256').update(bundleJson).digest('hex'),
    bundlePath: '/catalog/bundle.json',
  };
  const result = await fetchCatalogUpdate(
    { updatedAt: '2026-01-01T00:00:00.000Z', sourceHash: 'd'.repeat(64) },
    {
      endpoint: 'https://example.test/catalog/manifest.json',
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
      fetcher: async (url) => {
        if (String(url).endsWith('/manifest.json'))
          return new Response(JSON.stringify(manifest), { status: 200 });
        return new Response(
          JSON.stringify({ ...bundle, updatedAt: '2026-10-26T06:17:00.000Z' }),
          { status: 200 }
        );
      },
    }
  );
  assert.equal(result, null);
});

test('defaultCatalogEndpoint disables updates when nothing is configured', () => {
  assert.equal(defaultCatalogEndpoint(), '');
});

test('buildCatalogRelease batches teams missing from the previous release and carries the batch forward', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-batch-'));
  try {
    const { catalog } = sampleFixture();
    const catalogPath = join(dir, 'catalog.json');
    await writeFile(catalogPath, JSON.stringify(catalog), 'utf8');
    const build = (previous, name) =>
      buildCatalogRelease({
        catalogPath,
        outDir: join(dir, name),
        previous,
      });

    const first = await build(null, 'first');
    assert.equal('latestBatch' in first.bundle, false);

    const added = await build(
      { ...first.bundle, teams: [catalog.teams[0]] },
      'added'
    );
    assert.deepEqual(added.bundle.latestBatch, {
      addedAt: catalog.updatedAt,
      ids: [catalog.teams[1].id],
    });

    const carried = await build(
      {
        ...added.bundle,
        latestBatch: { addedAt: '2026-10-01T00:00:00.000Z', ids: ['gone'] },
      },
      'carried'
    );
    assert.deepEqual(carried.bundle.latestBatch, {
      addedAt: '2026-10-01T00:00:00.000Z',
      ids: ['gone'],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildCatalogRelease keeps singles out of the legacy release and batches them separately', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-singles-batch-'));
  try {
    const { catalog } = sampleFixture();
    const doublesBatch = {
      addedAt: '2026-10-01T00:00:00.000Z',
      ids: ['gone'],
    };
    const singles = {
      ...structuredClone(catalog.teams[1]),
      id: 'singles-team',
      format: 'singles',
    };
    const catalogPath = join(dir, 'catalog.json');
    const outDir = join(dir, 'out');
    await writeFile(
      catalogPath,
      JSON.stringify({ ...catalog, teams: [...catalog.teams, singles] }),
      'utf8'
    );
    const release = await buildCatalogRelease({
      catalogPath,
      outDir,
      previous: {
        teams: catalog.teams,
        latestBatch: doublesBatch,
      },
    });
    assert.deepEqual(release.bundle.singlesBatch, {
      addedAt: catalog.updatedAt,
      ids: ['singles-team'],
    });
    assert.deepEqual(release.bundle.latestBatch, doublesBatch);
    assert.equal('tags' in release.bundle, false);
    assert.ok(release.bundle.teams.some((team) => team.id === 'singles-team'));

    const legacyManifest = JSON.parse(
      await readFile(join(outDir, 'catalog', 'manifest.json'), 'utf8')
    );
    assert.deepEqual(
      validateCatalogManifest(legacyManifest),
      release.legacyManifest
    );
    const legacyText = await readFile(
      join(outDir, 'catalog', `bundle-${legacyManifest.bundleHash}.json`),
      'utf8'
    );
    assert.equal(
      createHash('sha256').update(legacyText).digest('hex'),
      legacyManifest.bundleHash
    );
    const legacy = JSON.parse(legacyText);
    assert.deepEqual(
      legacy.teams.map((team) => team.id),
      catalog.teams.map((team) => team.id)
    );
    assert.deepEqual(
      legacy.tags,
      { teams: {} },
      'installed app versions reject a bundle without tags'
    );
    assert.deepEqual(legacy.latestBatch, doublesBatch);
    assert.equal('singlesBatch' in legacy, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('YouTube copies fold only into the single earlier original with identical sets', () => {
  const members = (overrides = {}) =>
    [
      'Aurorus',
      'Gengar',
      'Incineroar',
      'Rillaboom',
      'Mudsdale',
      'Charizard',
    ].map((pokemon, index) => ({
      pokemon,
      item: `Item ${index}`,
      ability: 'Ability',
      moves: ['Protect', 'Fake Out'],
      nature: 'Modest',
      spread: '32 HP / 32 SpA',
      ...overrides,
    }));
  const team = (id, regulation, publishedAt, reports, overrides = {}) => ({
    id,
    sheetIds: [],
    name: id,
    creator: '',
    regulation,
    publishedAt,
    pasteUrl: `https://pokepast.es/${id}`,
    replicaCode: null,
    replicaStatus: '',
    reports,
    members: members(),
    paste: null,
    pasteNotes: null,
    ...overrides,
  });
  const result = {
    event: '2027 Global Challenge II',
    rank: '281st',
    sourceUrl: 'https://x.com/a',
  };
  const collection = {
    event: 'James Baek collection',
    rank: '',
    sourceUrl: 'https://www.youtube.com/@jameswbaekpkmn',
  };
  const video = (id) => ({
    event: 'James Baek video',
    rank: '',
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
  });
  const copyOf = (id, regulation, overrides = {}) =>
    team(id, regulation, '2026-11-14', [collection, video(id)], overrides);
  const original = team('original', 'M-C', '2026-11-02', [result]);
  const kept = [
    original,
    team('two-a', 'M-B', '2026-11-01', [result]),
    team('two-b', 'M-B', '2026-11-02', [result]),
    copyOf('two-copy', 'M-B'),
    team('later', 'M-A', '2026-11-20', [result]),
    copyOf('later-copy', 'M-A'),
    team('no-paste', 'M-D', '2026-11-02', [result], { pasteUrl: '' }),
    copyOf('no-paste-copy', 'M-D'),
    team('differs', 'M-E', '2026-11-02', [result]),
    copyOf('differs-copy', 'M-E', { members: members({ nature: 'Quiet' }) }),
    team('bare', 'M-F', '2026-11-02', [result], {
      members: members({ spread: null }),
    }),
    copyOf('bare-copy', 'M-F', { members: members({ spread: null }) }),
  ];
  const merged = mergeYoutubeCopies([
    ...kept,
    copyOf('copy', 'M-C', {
      members: members({ moves: ['Fake Out', 'Protect'] }).reverse(),
    }),
    copyOf('second-copy', 'M-C'),
  ]);

  assert.deepEqual(
    merged.map(({ id }) => id),
    kept.map(({ id }) => id)
  );
  assert.deepEqual(merged[0].reports, [
    result,
    collection,
    video('copy'),
    video('second-copy'),
  ]);
  assert.deepEqual(merged[0].mergedIds, ['copy', 'second-copy']);
  assert.deepEqual(original.reports, [result]);
  assert.deepEqual(merged.slice(1), kept.slice(1));
});
