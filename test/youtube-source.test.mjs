import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  api,
  apiKey,
  assertHeaderOnly,
  catalogPath,
  channelRecord,
  json,
  hostilePasteDescription,
  invalidSnapshotCases,
  multiPageHistory,
  mcItems,
  mcPokemon,
  pasteText,
  playlistFor,
  pokePasteJson,
  publishedAt,
  readCatalog,
  runImport,
  seedSnapshot,
  snapshotData,
  snapshotPath,
  video,
  prepareYoutubeRefreshFixture,
  youtubeQuotaFailureConfig,
  writeFetchMock,
  writeYoutubeImportFixture,
  youtubeChampionNotes as championNotes,
  youtubePasteUrl as pasteUrl,
  youtubeRow,
  youtubeSnapshot,
} from './fixtures/catalog-import.mjs';
import { youtubeChannels } from '../scripts/youtube-source.mjs';

test('discovers both complete multi-page upload histories and canonical direct paste links', async (t) => {
  const main = youtubeChannels[0].handle;
  const plus = youtubeChannels[1].handle;
  const ctx = api(t, multiPageHistory(main, plus));

  const result = await ctx.load({ apiKey });

  assert.deepEqual(
    result.channels.map(({ videosScanned, videosWithoutPaste }) => ({
      videosScanned,
      videosWithoutPaste,
    })),
    [
      { videosScanned: 2, videosWithoutPaste: 0 },
      { videosScanned: 2, videosWithoutPaste: 1 },
      ...youtubeChannels
        .slice(2)
        .map(() => ({ videosScanned: 1, videosWithoutPaste: 1 })),
    ]
  );
  assert.deepEqual(
    result.channels[0].candidates.map(({ pasteUrl, video: linked }) => [
      linked.id,
      pasteUrl,
      linked.publishedAt,
    ]),
    [
      [
        'aaaaaaaaaaa',
        'https://pokepast.es/0123456789abcdef',
        '2024-01-01T00:00:00Z',
      ],
      [
        'aaaaaaaaaaa',
        'https://www.vrpastes.com/AbC12345',
        '2024-01-01T00:00:00Z',
      ],
      ['ccccccccccc', 'https://pokepast.es/fedcba9876543210', publishedAt],
    ]
  );
  assert.equal(result.channels[1].candidates[0].video.id, 'ddddddddddd');
  assert.equal(
    result.channels[1].candidates[0].pasteUrl,
    'https://www.vrpastes.com/XyZ98765'
  );
  const playlistCalls = ctx.requests
    .filter(({ url }) => url.pathname.endsWith('/playlistItems'))
    .map(({ url }) => [
      url.searchParams.get('playlistId'),
      url.searchParams.get('pageToken'),
    ]);
  assert.deepEqual(playlistCalls, [
    [playlistFor(main), null],
    [playlistFor(main), 'main-page-2'],
    [playlistFor(plus), null],
    [playlistFor(plus), 'plus-page-2'],
    ...youtubeChannels
      .slice(2)
      .map(({ handle }) => [playlistFor(handle), null]),
  ]);
  assertHeaderOnly(ctx.requests);
  assert.equal(result.sourceText.includes(apiKey), false);
});

test('skips only explicit unavailable placeholders and rejects malformed or hostile direct URLs', async (t) => {
  const main = youtubeChannels[0].handle;
  const ctx = api(t, {
    pages: {
      [main]: {
        '': {
          items: [
            { snippet: { title: 'Deleted video' } },
            { snippet: { title: 'Private video' } },
            video(main, 'aaaaaaaaaaa', {
              description: hostilePasteDescription,
            }),
          ],
        },
      },
    },
  });

  const result = await ctx.load({ apiKey });

  assert.equal(result.channels[0].videosScanned, 1);
  assert.equal(result.channels[0].videosWithoutPaste, 0);
  assert.deepEqual(
    result.channels[0].candidates.map((candidate) => candidate.pasteUrl),
    ['https://pokepast.es/0123456789abcdef']
  );
  assertHeaderOnly(ctx.requests);
});

test('fails conflicting duplicate video IDs', async (t) => {
  const main = youtubeChannels[0].handle;
  const ctx = api(t, {
    pages: {
      [main]: {
        '': {
          items: [video(main, 'ccccccccccc', { title: 'Original' })],
          nextPageToken: 'next',
        },
        next: { items: [video(main, 'ccccccccccc', { title: 'Changed' })] },
      },
    },
  });
  await assert.rejects(ctx.load({ apiKey }), /conflicting duplicate videos/);
});

const mainHandle = youtubeChannels[0].handle;
for (const [label, items, expected] of [
  ['zero matches', [], /exactly one channel/],
  [
    'multiple matches',
    [channelRecord(mainHandle), channelRecord(mainHandle)],
    /exactly one channel/,
  ],
  [
    'invalid channel ID',
    [channelRecord(mainHandle, 'invalid')],
    /invalid channel or uploads playlist/,
  ],
  [
    'invalid uploads playlist ID',
    [channelRecord(mainHandle, undefined, 'PLinvalid')],
    /invalid channel or uploads playlist/,
  ],
]) {
  test(`rejects handle lookup with ${label}`, async (t) => {
    const ctx = api(t, { channels: { [mainHandle]: { items } } });
    await assert.rejects(ctx.load({ apiKey }), expected);
    assert.equal(ctx.requests.length, 1);
  });
}

for (const [label, options] of [
  ['owner ID', { ownerId: `UC${'z'.repeat(22)}` }],
  ['uploads playlist ID', { playlistId: `UU${'z'.repeat(22)}` }],
  ['content-details video ID', { contentVideoId: 'bbbbbbbbbbb' }],
]) {
  test(`rejects mismatched ${label}`, async (t) => {
    const ctx = api(t, {
      pages: {
        [mainHandle]: {
          '': { items: [video(mainHandle, 'aaaaaaaaaaa', options)] },
        },
      },
    });
    await assert.rejects(
      ctx.load({ apiKey }),
      /mismatched public video record/
    );
    assert.equal(ctx.requests.length, 2);
  });
}

for (const [label, pages, expected, requestCount] of [
  [
    'repeated continuation token',
    {
      [mainHandle]: {
        '': {
          items: [video(mainHandle, 'aaaaaaaaaaa')],
          nextPageToken: 'again',
        },
        again: {
          items: [video(mainHandle, 'bbbbbbbbbbb')],
          nextPageToken: 'again',
        },
      },
    },
    /invalid continuation token/,
    2,
  ],
  [
    'empty first uploads page',
    { [mainHandle]: { '': { items: [] } } },
    /unexpectedly empty/,
    1,
  ],
]) {
  test(`fails ${label}`, async (t) => {
    const ctx = api(t, { pages });
    await assert.rejects(ctx.load({ apiKey }), expected);
    assert.equal(
      ctx.requests.filter(({ url }) => url.pathname.endsWith('/playlistItems'))
        .length,
      requestCount
    );
  });
}

for (const [label, page] of [
  ['missing item array', {}],
  ['malformed JSON', new Response('{')],
]) {
  test(`fails uploads page with ${label}`, async (t) => {
    const main = youtubeChannels[0].handle;
    const ctx = api(t, { pages: { [main]: { '': page } } });
    await assert.rejects(
      ctx.load({ apiKey }),
      /(?:no item array|malformed JSON)/
    );
  });
}

test('rejects oversized JSON responses', async (t) => {
  const ctx = api(t, {
    channels: {
      [youtubeChannels[0].handle]: new Response(' '.repeat(5000001)),
    },
  });
  await assert.rejects(ctx.load({ apiKey }), /exceeds size limit/);
  assert.equal(ctx.requests.length, 1);
});

for (const [status, reason] of [
  [403, 'quotaExceeded'],
  [401, 'keyInvalid'],
]) {
  test(`reports safe YouTube API status and reason for HTTP ${status}`, async (t) => {
    const ctx = api(t, {
      channels: {
        [youtubeChannels[0].handle]: json(
          {
            error: {
              errors: [{ reason }],
              message: `credential echo ${apiKey}`,
            },
          },
          status
        ),
      },
    });
    await assert.rejects(
      ctx.load({ apiKey }),
      new RegExp(`API HTTP ${status} \\(${reason}\\)`)
    );
    assert.equal(ctx.warnings.join(' ').includes(apiKey), false);
    assert.equal(ctx.requests.length, 1);
  });
}

test('keeps credentials out of retry and final API diagnostics', async (t) => {
  const ctx = api(t, {
    channels: {
      [youtubeChannels[0].handle]: () =>
        json(
          {
            error: {
              errors: [{ reason: apiKey }],
              message: `credential echo ${apiKey}`,
            },
          },
          503
        ),
    },
  });
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    queueMicrotask(callback);
    return 0;
  });
  let message = '';
  await assert.rejects(ctx.load({ apiKey }), (error) => {
    message = error.message;
    return true;
  });
  assert.equal(
    ctx.requests.filter(({ url }) => url.pathname.endsWith('/channels')).length,
    3
  );
  assert.equal(ctx.warnings.length, 2);
  assert.equal(ctx.warnings.join(' ').includes(apiKey), false);
  assert.equal(message.includes(apiKey), false);
  assert.match(message, /API HTTP 503 \(unknown\)/);
});

test('rejects invalid nonempty API keys before invoking fetch', async (t) => {
  const ctx = api(t);
  await assert.rejects(
    ctx.load({
      apiKey: 'bad&secret=sentinel',
      offline: true,
      cache: Symbol('invalid cache path'),
    }),
    { message: 'YOUTUBE_API_KEY contains invalid characters.' }
  );
  assert.equal(ctx.requests.length, 0);
  assert.equal(ctx.warnings.length, 0);
});

test('returns inactive without a key and makes no API requests', async (t) => {
  const ctx = api(t);
  assert.deepEqual(await ctx.load({}), {
    active: false,
    sourceText: '',
    channels: [],
  });
  assert.equal(ctx.requests.length, 0);
  assert.deepEqual(ctx.warnings, [
    'YouTube source inactive: YOUTUBE_API_KEY is not configured.',
  ]);
});

test('reuses a valid snapshot for keyed, keyless, and offline refreshes', async (t) => {
  const ctx = api(t);
  await seedSnapshot(ctx.cache);
  const cached = await readFile(snapshotPath(ctx.cache), 'utf8');
  const keyed = await ctx.load({ apiKey });
  const keyless = await ctx.load({});
  const offline = await ctx.load({ apiKey, offline: true, refresh: true });
  assert.equal(keyed.active && keyless.active && offline.active, true);
  assert.equal(keyed.sourceText, keyless.sourceText);
  assert.equal(keyed.sourceText, offline.sourceText);
  assert.equal(ctx.requests.length, 0);
  assert.equal(ctx.warnings.length, 0);
  assert.equal(await readFile(snapshotPath(ctx.cache), 'utf8'), cached);
});

test('offline without a key returns inactive when its snapshot is missing', async (t) => {
  const ctx = api(t);
  assert.equal((await ctx.load({ offline: true })).active, false);
  assert.equal(ctx.requests.length, 0);
  assert.equal(ctx.warnings.length, 1);
});

test('offline with a key fails when its snapshot is missing', async (t) => {
  const ctx = api(t);
  await assert.rejects(
    ctx.load({ apiKey, offline: true, refresh: true }),
    /no offline snapshot/
  );
  assert.equal(ctx.requests.length, 0);
});

for (const [label, options] of [
  ['online without a key', {}],
  ['offline without a key', { offline: true }],
  ['offline with a key', { apiKey, offline: true }],
]) {
  test(`fails on an invalid snapshot ${label}`, async (t) => {
    const ctx = api(t);
    await seedSnapshot(ctx.cache, { version: 2, channels: [] });
    await assert.rejects(ctx.load(options), /Cached snapshot is invalid/);
    assert.equal(ctx.requests.length, 0);
  });
}

test('a keyed online import refreshes an invalid snapshot', async (t) => {
  const ctx = api(t);
  await seedSnapshot(ctx.cache, { version: 2, channels: [] });
  const result = await ctx.load({ apiKey });
  assert.equal(result.active, true);
  assert.equal(ctx.requests.length, youtubeChannels.length * 2);
  assert.deepEqual(
    JSON.parse(await readFile(snapshotPath(ctx.cache), 'utf8')),
    {
      version: 1,
      channels: result.channels,
    }
  );
});

test('refresh crawls and atomically replaces a valid snapshot', async (t) => {
  const ctx = api(t);
  await seedSnapshot(ctx.cache);
  const before = await readFile(snapshotPath(ctx.cache), 'utf8');
  const result = await ctx.load({ apiKey, refresh: true });
  const after = await readFile(snapshotPath(ctx.cache), 'utf8');
  assert.equal(ctx.requests.length, youtubeChannels.length * 2);
  assert.notEqual(after, before);
  assert.deepEqual(JSON.parse(after), {
    version: 1,
    channels: result.channels,
  });
  assert.deepEqual(await readdir(ctx.cache), ['youtube-sources.json']);
});
test('accepts a partial cached snapshot offline/keyless and incrementally scans missing channels online', async (t) => {
  const ctx = api(t);
  const full = snapshotData();
  const partial = { version: 1, channels: full.channels.slice(0, 2) };
  await seedSnapshot(ctx.cache, partial);
  const cachedText = await readFile(snapshotPath(ctx.cache), 'utf8');

  const keyless = await ctx.load({});
  const offline = await ctx.load({ apiKey, offline: true, refresh: true });
  assert.equal(keyless.active && offline.active, true);
  assert.equal(keyless.channels.length, 2);
  assert.equal(offline.channels.length, 2);
  assert.equal(ctx.requests.length, 0);
  assert.equal(await readFile(snapshotPath(ctx.cache), 'utf8'), cachedText);

  const online = await ctx.load({ apiKey, refresh: false });
  assert.equal(online.active, true);
  assert.equal(online.channels.length, youtubeChannels.length);
  assert.deepEqual(online.channels.slice(0, 2), partial.channels);
  assert.equal(ctx.requests.length, (youtubeChannels.length - 2) * 2);
  assert.deepEqual(
    JSON.parse(await readFile(snapshotPath(ctx.cache), 'utf8')),
    {
      version: 1,
      channels: online.channels,
    }
  );
});

test('a later page failure leaves the completed snapshot untouched', async (t) => {
  const main = youtubeChannels[0].handle;
  const plus = youtubeChannels[1].handle;
  const pages = {
    [main]: {
      '': { items: [video(main, 'aaaaaaaaaaa')], nextPageToken: 'main-next' },
      'main-next': { items: [video(main, 'ccccccccccc')] },
    },
    [plus]: {
      '': { items: [video(plus, 'bbbbbbbbbbb')], nextPageToken: 'plus-next' },
      'plus-next': json({ error: { errors: [{ reason: 'forbidden' }] } }, 403),
    },
  };
  const ctx = api(t, { pages });
  await seedSnapshot(ctx.cache);
  const before = await readFile(snapshotPath(ctx.cache), 'utf8');
  await assert.rejects(
    ctx.load({ apiKey, refresh: true }),
    /API HTTP 403 \(forbidden\)/
  );
  assert.equal(await readFile(snapshotPath(ctx.cache), 'utf8'), before);
  assert.deepEqual(await readdir(ctx.cache), ['youtube-sources.json']);
});

test('fails on malformed cached snapshot JSON', async (t) => {
  const ctx = api(t);
  await writeFile(snapshotPath(ctx.cache), '{');
  await assert.rejects(ctx.load({}), /Cached snapshot is invalid/);
  assert.equal(ctx.requests.length, 0);
});

for (const [label, mutate] of invalidSnapshotCases) {
  test(`rejects a cached snapshot with invalid ${label}`, async (t) => {
    const ctx = api(t);
    const data = snapshotData();
    mutate(data);
    await seedSnapshot(ctx.cache, data);
    await assert.rejects(ctx.load({}), /Cached snapshot is invalid/);
    assert.equal(ctx.requests.length, 0);
  });
}

test('imports YouTube variants, shares paste budgets, and retains only compatible priors', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-youtube-import-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const duplicateUrl = pasteUrl('aaaaaaaaaaaaaaaa');
  const retainedUrl = pasteUrl('cccccccccccccccc');
  const newUrl = pasteUrl('dddddddddddddddd');
  const duplicate = youtubeRow(duplicateUrl, 'aaaaaaaaaaa');
  const retained = youtubeRow(retainedUrl, 'ccccccccccc');
  const newCandidate = youtubeRow(newUrl, 'ddddddddddd');
  const pasteJson = pokePasteJson(pasteText(mcPokemon, mcItems), championNotes);
  const cache = await writeYoutubeImportFixture(
    directory,
    [duplicate, retained],
    {
      cccccccccccccccc: pasteJson,
    }
  );
  const discoveryPath = snapshotPath(cache);
  const retainedPayloadPath = join(cache, 'cccccccccccccccc.json');
  runImport(directory);
  let catalog = await readCatalog(directory);
  const merged = catalog.teams.find(
    ({ pasteUrl: url }) => url === duplicateUrl
  );
  const channelOnly = catalog.teams.find(
    ({ pasteUrl: url }) => url === retainedUrl
  );
  assert.ok(merged.sheetIds.includes('MC1'));
  assert.ok(
    merged.reports.some(
      ({ event, sourceUrl }) =>
        event === 'pokeaimMD collection' && sourceUrl === youtubeChannels[0].url
    )
  );
  assert.ok(
    merged.reports.some(
      ({ event, sourceUrl }) =>
        event === 'pokeaimMD video' &&
        sourceUrl === 'https://www.youtube.com/watch?v=aaaaaaaaaaa'
    )
  );
  assert.equal(channelOnly.publishedAt, publishedAt.slice(0, 10));
  assert.equal(channelOnly.creator, '');
  assert.ok(
    channelOnly.reports.some(({ event }) => event === 'pokeaimMD video')
  );

  await writeFile(
    discoveryPath,
    JSON.stringify(youtubeSnapshot([duplicate, retained, newCandidate]))
  );
  await writeFile(join(cache, 'dddddddddddddddd.json'), pasteJson);
  runImport(directory, { PASTE_LIMIT: '2' });
  catalog = await readCatalog(directory);
  assert.ok(!catalog.teams.some(({ pasteUrl: url }) => url === newUrl));
  runImport(directory);
  catalog = await readCatalog(directory);
  const retainedVariant = catalog.teams.find(
    ({ pasteUrl: url }) => url === retainedUrl
  );
  const newVariant = catalog.teams.find(({ pasteUrl: url }) => url === newUrl);
  assert.ok(retainedVariant && newVariant);
  assert.notEqual(retainedVariant.id, newVariant.id);

  rmSync(retainedPayloadPath);
  runImport(directory);
  catalog = await readCatalog(directory);
  assert.ok(
    catalog.teams.find(({ pasteUrl: url }) => url === retainedUrl)?.pasteError
  );
  rmSync(discoveryPath);
  runImport(directory);
  catalog = await readCatalog(directory);
  assert.ok(catalog.teams.some(({ pasteUrl: url }) => url === retainedUrl));

  const priorBytes = await readFile(catalogPath(directory), 'utf8');
  for (const invalid of [false, true]) {
    if (invalid)
      await writeFile(
        discoveryPath,
        JSON.stringify({ version: 2, channels: [] })
      );
    let failure;
    try {
      runImport(directory, { YOUTUBE_API_KEY: apiKey, OFFLINE: '1' });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure);
    assert.match(
      failure.stderr.toString(),
      invalid ? /Cached snapshot is invalid/ : /no offline snapshot/
    );
    assert.equal(await readFile(catalogPath(directory), 'utf8'), priorBytes);
  }

  await writeFile(
    discoveryPath,
    JSON.stringify(youtubeSnapshot([duplicate, retained, newCandidate]))
  );
  await writeFile(retainedPayloadPath, pasteJson);
  await writeFile(
    join(cache, 'dddddddddddddddd.json'),
    pokePasteJson(pasteText(mcPokemon, mcItems), 'Format: gen9vgcregulationmb')
  );
  runImport(directory, { YOUTUBE_API_KEY: apiKey });
  catalog = await readCatalog(directory);
  assert.ok(!catalog.teams.some(({ pasteUrl: url }) => url === newUrl));
  assert.ok(catalog.teams.some(({ pasteUrl: url }) => url === retainedUrl));
  await writeFile(discoveryPath, JSON.stringify(youtubeSnapshot([duplicate])));
  runImport(directory, { YOUTUBE_API_KEY: apiKey });
  catalog = await readCatalog(directory);
  assert.ok(!catalog.teams.some(({ pasteUrl: url }) => url === retainedUrl));
});

test('refreshes a shared paste once and leaves catalog and snapshot unchanged on failed crawl', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-youtube-refresh-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const {
    main,
    plus,
    sharedUrl,
    mainVideo,
    plusVideo,
    config,
    cache,
    mockEnv,
  } = await prepareYoutubeRefreshFixture(directory);
  runImport(directory);
  const priorTeam = (await readCatalog(directory)).teams.find(
    ({ pasteUrl: url }) => url === sharedUrl
  );
  assert.ok(priorTeam.reports.some(({ event }) => event === 'pokeaimMD video'));
  const output = runImport(directory, {
    ...mockEnv,
    CHECK_SHEET: '1',
    PASTE_LIMIT: '1',
    OFFLINE: '0',
    YOUTUBE_API_KEY: apiKey,
  });
  const catalog = await readCatalog(directory);
  const sheetTeam = catalog.teams.find(
    ({ pasteUrl: url }) => url === sharedUrl
  );
  assert.equal(sheetTeam.id, priorTeam.id);
  assert.equal(sheetTeam.pasteNotes, 'Format: gen9vgcregulationmb');
  assert.ok(sheetTeam.sheetIds.includes('MC1'));
  assert.ok(
    !sheetTeam.reports.some(({ event }) => event.startsWith('pokeaimMD '))
  );
  assert.match(output, /format_conflict=1/);
  const requests = JSON.parse(await readFile(mockEnv.MOCK_FETCH_LOG, 'utf8'));
  assert.equal(
    requests.filter((address) => address === `${sharedUrl}/json`).length,
    1
  );

  const beforeCatalog = await readFile(catalogPath(directory), 'utf8');
  const discoveryPath = snapshotPath(cache);
  const beforeSnapshot = await readFile(discoveryPath, 'utf8');
  const failedConfig = youtubeQuotaFailureConfig(
    config,
    main,
    plus,
    mainVideo,
    plusVideo
  );
  const failureEnv = await writeFetchMock(directory, failedConfig);
  let failure;
  try {
    runImport(directory, {
      ...failureEnv,
      OFFLINE: '0',
      REFRESH: '1',
      YOUTUBE_API_KEY: apiKey,
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure);
  assert.match(failure.stderr.toString(), /quotaExceeded/);
  assert.equal(await readFile(catalogPath(directory), 'utf8'), beforeCatalog);
  assert.equal(await readFile(discoveryPath, 'utf8'), beforeSnapshot);
});
