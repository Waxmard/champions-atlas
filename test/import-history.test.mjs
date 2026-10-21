import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  catalogPath,
  devonCorpPage,
  devonItems,
  devonPokemon,
  mbItems,
  mbPokemon,
  mcItems,
  mcPokemon,
  pasteText,
  pochPage,
  pochTeamRow,
  pokePasteJson,
  readCatalog,
  rosterHtml,
  runImport,
  sheetCsv,
  sheetRow,
  sheetSources,
  victoryRoadPage,
  vrProviderPayload,
  vrRoster,
  vrRow,
  writeCache,
  writeFetchMock,
  youtubeRow,
  youtubeSnapshot,
} from './fixtures/catalog-import.mjs';

const allSpecies = [
  ...mcPokemon,
  ...mbPokemon,
  ...devonPokemon,
  ...vrRoster,
  'Brute Bonnet',
  'Iron Bundle',
  'Squawkabilly',
  'Golurk',
];
const pokemonJson = JSON.stringify({
  results: allSpecies.map((pokemon, index) => ({
    name: pokemon.toLowerCase().replaceAll(' ', '-'),
    url: `https://pokeapi.co/api/v2/pokemon/${index + 1}/`,
  })),
});

const defaultFixtureFiles = () => ({
  ...sheetSources,
  'pokemon.json': pokemonJson,
  'devoncorp-m-a.html': devonCorpPage(),
  '138b4ef886ba95e4.json': pokePasteJson(
    pasteText(devonPokemon, devonItems),
    'Format: gen9championsvgc2026regma'
  ),
  'poch-leaderboard.html': pochPage([pochTeamRow('unknown-1', mcPokemon)]),
  'victory-road.html': victoryRoadPage([
    vrRow('Alice', rosterHtml(vrRoster), 'https://www.vrpastes.com/AbC12345'),
  ]),
  'vr-AbC12345.json': JSON.stringify(vrProviderPayload()),
});

test('cold then warm: frozen history retained deeply equal, current add/update/remove with paste and member enrichment', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-history-warm-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const cache = await writeCache(directory, {
    ...defaultFixtureFiles(),
    'M-C.csv': sheetCsv([
      sheetRow('MC0', {
        pokemon: mcPokemon,
        items: mcItems,
        paste: 'https://pokepast.es/0000000000000000',
      }),
      sheetRow('MC1', {
        pokemon: mcPokemon,
        items: mcItems,
        paste: 'https://pokepast.es/aaaaaaaaaaaaaaaa',
      }),
    ]),
    '0000000000000000.json': pokePasteJson(
      pasteText(mcPokemon, mcItems),
      'Format: gen9vgcregulationmc'
    ),
  });

  runImport(directory, { PASTE_LIMIT: '5' });
  const cold = await readCatalog(directory);

  const coldHistorical = cold.teams.filter((t) => t.regulation !== 'M-C');
  assert.ok(
    coldHistorical.length >= 3,
    'baseline should include historical M-A, M-B, and Unknown teams'
  );
  assert.ok(
    ['M-A', 'M-B', 'Unknown'].every((reg) =>
      coldHistorical.some((t) => t.regulation === reg)
    )
  );
  const coldMc0 = cold.teams.find((t) => t.sheetIds?.includes('MC0'));
  const coldMc1 = cold.teams.find((t) => t.sheetIds?.includes('MC1'));
  assert.ok(coldMc0 && coldMc1);

  await rm(join(cache, 'devoncorp-m-a.html'));
  await rm(join(cache, '138b4ef886ba95e4.json'));
  await writeFile(join(cache, 'M-B.csv'), 'corrupt,csv,data');
  await writeFile(
    join(cache, 'poch-leaderboard.html'),
    pochPage([pochTeamRow('unknown-fresh', mcPokemon)])
  );
  await writeFile(
    join(cache, 'victory-road.html'),
    victoryRoadPage([
      vrRow('Alice', rosterHtml(vrRoster), 'https://www.vrpastes.com/AbC12345'),
      vrRow(
        'Historic Bob',
        rosterHtml(mbPokemon),
        'https://www.vrpastes.com/MbC12345',
        'Finalist'
      ),
    ])
  );
  await writeFile(
    join(cache, 'vr-MbC12345.json'),
    JSON.stringify(
      vrProviderPayload({ id: 'MbC12345', format: 'VGC Regulation M-B' })
    )
  );

  const updatedMc1Items = ['Life Orb', ...mcItems.slice(1)];
  const updatedMc1Paste = pasteText(mcPokemon, updatedMc1Items);
  await writeFile(
    join(cache, 'aaaaaaaaaaaaaaaa.json'),
    pokePasteJson(updatedMc1Paste, 'Format: gen9vgcregulationmc\nUpdated note')
  );
  const newMc2Items = ['Focus Sash', ...mcItems.slice(1)];
  const newMc2Paste = pasteText(mcPokemon, newMc2Items);
  await writeFile(
    join(cache, 'cccccccccccccccc.json'),
    pokePasteJson(newMc2Paste, 'Format: gen9vgcregulationmc\nNew MC2 team')
  );

  await writeFile(
    join(cache, 'M-C.csv'),
    sheetCsv([
      sheetRow('MC1', {
        pokemon: mcPokemon,
        items: updatedMc1Items,
        paste: 'https://pokepast.es/aaaaaaaaaaaaaaaa',
      }),
      sheetRow('MC2', {
        pokemon: mcPokemon,
        items: newMc2Items,
        paste: 'https://pokepast.es/cccccccccccccccc',
      }),
    ])
  );

  const output = runImport(directory, { PASTE_LIMIT: '5' });
  const warm = await readCatalog(directory);

  for (const coldTeam of coldHistorical) {
    const warmTeam = warm.teams.find((t) => t.id === coldTeam.id);
    assert.ok(warmTeam, `historical team ${coldTeam.id} should survive`);
    assert.deepEqual(
      warmTeam,
      coldTeam,
      `frozen history team ${coldTeam.id} must be deeply equal`
    );
  }

  assert.ok(
    !warm.teams.some((t) => t.name?.includes('Historic Bob')),
    'new historical candidates must not be admitted during routine import'
  );
  assert.ok(
    !warm.teams.some((t) => t.id === 'poch-x-unknown-fresh'),
    'new Unknown teams must not be admitted during routine import'
  );

  assert.ok(
    !warm.teams.some((t) => t.sheetIds?.includes('MC0')),
    'removed current team MC0 must be deleted'
  );

  const warmMc1 = warm.teams.find((t) => t.sheetIds?.includes('MC1'));
  assert.ok(warmMc1, 'updated current team MC1 must be retained');
  assert.equal(warmMc1.members[0].item, 'Life Orb');
  assert.equal(warmMc1.members[0].nature, 'Adamant');
  assert.equal(warmMc1.members[0].spread, '2 HP / 32 Atk');
  assert.deepEqual(warmMc1.members[0].moves, ['Protect', 'Fake Out']);
  assert.equal(warmMc1.paste, updatedMc1Paste);
  assert.equal(
    warmMc1.pasteNotes,
    'Format: gen9vgcregulationmc\nUpdated note',
    'MC1 paste notes must be enriched'
  );

  const warmMc2 = warm.teams.find((t) => t.sheetIds?.includes('MC2'));
  assert.ok(warmMc2, 'added current team MC2 must be present');
  assert.equal(warmMc2.members[0].item, 'Focus Sash');
  assert.equal(warmMc2.members[0].nature, 'Adamant');
  assert.equal(warmMc2.members[0].spread, '2 HP / 32 Atk');
  assert.equal(warmMc2.paste, newMc2Paste);
  assert.equal(
    warmMc2.pasteNotes,
    'Format: gen9vgcregulationmc\nNew MC2 team',
    'MC2 paste notes must be enriched'
  );

  assert.match(
    output,
    new RegExp(
      `Frozen history: ${coldHistorical.length} teams retained; refreshing M-C\\.`
    )
  );
});

test('fetch and budget: no historical URL or paste fetches, offline replay without M-B/Devon cache, and exact YouTube provenance with shared paste', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-history-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const frozenPasteUrl = 'https://pokepast.es/eeeeeeeeeeeeeeee';
  const frozenPastePayload = pokePasteJson(pasteText(mcPokemon, mcItems), '');

  const frozenVideoId = 'eeeeeeeeeee';
  const currentVideoId = 'ddddddddddd';
  const frozenYtRow = youtubeRow(frozenPasteUrl, frozenVideoId, {
    title: 'Pokémon Champions VGC Regulation M-B',
    description: frozenPasteUrl,
  });
  const currentYtRow = youtubeRow(frozenPasteUrl, currentVideoId, {
    title: 'Pokémon Champions VGC Regulation M-C',
    description: frozenPasteUrl,
  });

  const cache = await writeCache(directory, {
    ...defaultFixtureFiles(),
    'eeeeeeeeeeeeeeee.json': frozenPastePayload,
    'youtube-sources.json': JSON.stringify(youtubeSnapshot([frozenYtRow])),
  });

  runImport(directory, { PASTE_LIMIT: '5' });
  const baseline = await readCatalog(directory);
  assert.ok(
    baseline.teams.some((t) => t.regulation === 'M-A') &&
      baseline.teams.some((t) => t.regulation === 'M-B')
  );

  await rm(join(cache, 'M-B.csv'));
  await rm(join(cache, 'devoncorp-m-a.html'));
  await rm(join(cache, '138b4ef886ba95e4.json'));
  await rm(join(cache, 'bbbbbbbbbbbbbbbb.json'));

  const vrHistoricalUrl = 'https://www.vrpastes.com/MbC12345';
  const vrCurrentUrl = 'https://www.vrpastes.com/AbC12345';
  const vrPageHtml = (sections) =>
    '<h1>Pokémon Champions — Replica Teams</h1>' +
    sections
      .map(
        ({ regulation, rows }) =>
          `<h2>Regulation Set (${regulation})</h2>` +
          '<h3>Teams reaching finals of large tournaments</h3>' +
          '<table><thead><tr><th>Flag</th><th>Player</th><th>Best results</th>' +
          '<th>Team</th><th>Code</th><th>Paste</th><th>Rep.</th></tr></thead><tbody>' +
          rows.join('') +
          '</tbody></table>'
      )
      .join('');
  const vrHtml = vrPageHtml([
    {
      regulation: 'M-B',
      rows: [
        vrRow('Historical Player', rosterHtml(mbPokemon), vrHistoricalUrl),
      ],
    },
    {
      regulation: 'M-C',
      rows: [vrRow('Current Player', rosterHtml(vrRoster), vrCurrentUrl)],
    },
  ]);

  await writeFile(
    join(cache, 'youtube-sources.json'),
    JSON.stringify(youtubeSnapshot([frozenYtRow, currentYtRow]))
  );

  const mockConfig = {
    sheets: {
      2001945654: sheetSources['M-C.csv'],
    },
    victoryRoad: vrHtml,
    vrPastes: {
      AbC12345: vrProviderPayload({ id: 'AbC12345' }),
      MbC12345: vrProviderPayload({
        id: 'MbC12345',
        format: 'VGC Regulation M-B',
        teams: mbPokemon.map((species, index) => ({
          species,
          name: species,
          item: mbItems[index],
        })),
      }),
    },
    pastes: {
      eeeeeeeeeeeeeeee: frozenPastePayload,
    },
    poch: sheetSources['poch-leaderboard.html'],
  };

  const fetchEnv = await writeFetchMock(directory, mockConfig);

  const onlineOutput = runImport(directory, {
    ...fetchEnv,
    OFFLINE: '0',
    CHECK_SHEET: '1',
    PASTE_LIMIT: '3',
  });

  const requests = JSON.parse(await readFile(fetchEnv.MOCK_FETCH_LOG, 'utf8'));

  assert.ok(
    !requests.some((url) => url.includes('gid=1458357160')),
    'M-B sheet must not be requested'
  );
  assert.ok(
    !requests.some((url) => url.includes('devoncorp.press')),
    'DevonCorp page must not be requested'
  );
  assert.ok(
    !requests.some((url) => url.includes('bbbbbbbbbbbbbbbb')),
    'historical sheet paste must not be requested'
  );
  assert.ok(
    !requests.some((url) => url.includes('138b4ef886ba95e4')),
    'historical DevonCorp paste must not be requested'
  );
  assert.ok(
    !requests.some((url) => url.includes('MbC12345')),
    'known historical VR candidate must not spend paste budget'
  );

  assert.match(
    onlineOutput,
    /Victory Road: 2 discovered — 1 accepted, 0 retained, 1 skipped, 0 merged\./
  );
  assert.match(onlineOutput, /outside_current_regulation=2/);
  assert.doesNotMatch(onlineOutput, /limited=/);
  assert.equal(
    requests.filter((url) => url.includes('eeeeeeeeeeeeeeee')).length,
    1,
    'the shared paste must be fetched only for the current candidate'
  );

  const replayCatalog = await readCatalog(directory);
  assert.ok(
    ['M-A', 'M-B', 'M-C'].every((reg) =>
      replayCatalog.teams.some((t) => t.regulation === reg)
    ),
    'catalog must retain historical and current teams'
  );
  const currentYoutubeTeam = replayCatalog.teams.find(
    (team) =>
      team.pasteUrl === frozenPasteUrl &&
      team.regulation === 'M-C' &&
      team.reports?.some(
        (report) =>
          report.sourceUrl ===
          `https://www.youtube.com/watch?v=${currentVideoId}`
      )
  );
  assert.ok(
    currentYoutubeTeam,
    'a current candidate sharing the frozen paste URL must be processed'
  );
  assert.deepEqual(
    replayCatalog.teams
      .filter((team) => team.regulation !== 'M-C')
      .map((team) => team.id),
    baseline.teams
      .filter((team) => team.regulation !== 'M-C')
      .map((team) => team.id)
  );

  const offlineOutput = runImport(directory, { OFFLINE: '1' });
  assert.match(
    offlineOutput,
    /Frozen history: 4 teams retained; refreshing M-C\./
  );
});

test('historical validation and malformed resilience: ineligible historical team omitted, malformed record warns without throwing', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-history-validation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  await writeCache(directory, defaultFixtureFiles());
  runImport(directory, { PASTE_LIMIT: '4' });
  const baseline = await readCatalog(directory);

  const invalidHistoricalTeam = {
    id: 'invalid-historic-1',
    name: 'Illegal Historical Team',
    regulation: 'M-B',
    pasteUrl: 'https://pokepast.es/9999999999999999',
    reports: [],
    members: ['Iron Bundle', ...mbPokemon.slice(1)].map((pokemon, i) => ({
      pokemon,
      item: mbItems[i],
      ability: 'Quark Drive',
      moves: ['Hydro Pump', 'Freeze-Dry'],
      nature: 'Timid',
      spread: '2 HP / 32 SpA',
    })),
  };

  const malformedRecord1 = {
    id: 'malformed-no-members',
    regulation: 'M-A',
    members: null,
  };
  const malformedRecord2 = {
    regulation: 'M-A',
    members: [],
  };
  const malformedRecord3 = {
    id: 'malformed-bad-slots',
    regulation: 'M-A',
    members: [null, null, null, null, null, null],
  };

  baseline.teams.push(
    invalidHistoricalTeam,
    malformedRecord1,
    malformedRecord2,
    malformedRecord3
  );

  await writeFile(catalogPath(directory), JSON.stringify(baseline));

  const output = runImport(directory, { OFFLINE: '1' });
  const catalog = await readCatalog(directory);

  assert.ok(
    !catalog.teams.some((t) => t.id === 'invalid-historic-1'),
    'ineligible historical team must be omitted'
  );
  assert.ok(
    !catalog.teams.some((t) => t.id?.startsWith('malformed')),
    'malformed historical records must be omitted'
  );
  assert.match(output, /ineligible_species/);
  assert.ok(
    ['M-A', 'M-B', 'M-C', 'Unknown'].every((reg) =>
      catalog.teams.some((t) => t.regulation === reg)
    ),
    'valid historical teams must be retained'
  );
});

test('creator spread isolation and Poch ID collision', async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), 'atlas-history-spread-collision-')
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const donorSpread = '32 HP / 32 Atk / 2 Def';
  const videoUrl = 'https://www.youtube.com/watch?v=eeeeeeeeeee';
  const spreadSource = {
    pasteUrl: 'https://pokepast.es/cccccccccccccccc',
    videoUrls: [videoUrl],
    borrowedNature: true,
    sourceSet: `Kingambit @ Black Glasses\nAbility: Fixture\nLevel: 50\nEVs: ${donorSpread}\nAdamant Nature\n- Protect`,
    originalSet: `Kingambit @ Black Glasses\nAbility: Fixture\nLevel: 50\n- Protect`,
    appliedSignature: 'Kingambit:Black Glasses:Fixture:Protect',
  };

  const collisionPochId = 'shared-poch-collision';
  const pochEntriesPage = (rows) =>
    `<script>self.__next_f.push([1,${JSON.stringify(
      `a:${JSON.stringify({ entries: rows, x: [] })}`
    )}])</script>`;
  const historicalPochRow = {
    id: collisionPochId,
    player: 'Historic Poch Player',
    event: 'Spring Cup 2025',
    format: 'M-B',
    rule: 'double',
    placement: 2,
    players: 128,
    team: mbPokemon.map((name) => ({ name })),
  };
  const cache = await writeCache(directory, {
    ...defaultFixtureFiles(),
    'poch-leaderboard.html': pochEntriesPage([historicalPochRow]),
  });

  runImport(directory, { PASTE_LIMIT: '5' });
  const baseline = await readCatalog(directory);

  const historicalMb = baseline.teams.find((t) => t.regulation === 'M-B');
  assert.ok(historicalMb);
  historicalMb.members[0].spread = donorSpread;
  historicalMb.members[0].nature = 'Adamant';
  historicalMb.members[0].spreadSource = spreadSource;

  const historicalPoch = baseline.teams.find(
    (t) => t.id === `poch-tournament-${collisionPochId}`
  );
  assert.ok(historicalPoch, 'historical Poch team must be in baseline');

  await writeFile(catalogPath(directory), JSON.stringify(baseline));

  const newPochHtml = pochEntriesPage([
    {
      ...historicalPochRow,
      player: 'Colliding Tournament Player',
      event: 'Spring Cup 2026',
      format: 'M-C',
      placement: 1,
      team: mcPokemon.map((name) => ({ name })),
    },
  ]);

  await writeFile(join(cache, 'poch-leaderboard.html'), newPochHtml);
  await writeFile(
    join(cache, 'youtube-sources.json'),
    JSON.stringify(youtubeSnapshot([]))
  );

  const output = runImport(directory, { OFFLINE: '1' });
  const catalog = await readCatalog(directory);

  const retainedMb = catalog.teams.find((t) => t.id === historicalMb.id);
  assert.ok(retainedMb);
  assert.deepEqual(
    retainedMb.members[0].spreadSource,
    spreadSource,
    'frozen team spreadSource must remain deeply equal despite active YouTube changes'
  );

  const retainedPoch = catalog.teams.find((t) => t.id === historicalPoch.id);
  assert.ok(retainedPoch);
  assert.deepEqual(
    retainedPoch,
    historicalPoch,
    'historical Poch team must keep original provenance'
  );
  assert.ok(
    !catalog.teams.some((t) => t.creator === 'Colliding Tournament Player'),
    'conflicting active Poch record must be rejected'
  );
  assert.match(output, /frozen_history_conflict/);
});

test('full rebuild (REFRESH=1), bootstrap roots, atomic failure, and if-missing shortcut', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-history-rebuild-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  await writeCache(directory, defaultFixtureFiles());
  runImport(directory, { PASTE_LIMIT: '5' });
  const baseline = await readCatalog(directory);
  assert.ok(baseline.teams.length > 0);

  const freshMbPaste = 'https://pokepast.es/ffffffffffffffff';
  const freshMbPayload = pokePasteJson(
    pasteText(mbPokemon, mbItems),
    'Format: gen9vgcregulationmb'
  );
  const freshMbCsv = sheetCsv([
    sheetRow('MB2', {
      pokemon: mbPokemon,
      items: mbItems,
      paste: freshMbPaste,
    }),
  ]);

  const mockConfig = {
    sheets: {
      2001945654: sheetSources['M-C.csv'],
      1458357160: freshMbCsv,
    },
    victoryRoad: victoryRoadPage([
      vrRow('Alice', rosterHtml(vrRoster), 'https://www.vrpastes.com/AbC12345'),
    ]),
    vrPastes: {
      AbC12345: vrProviderPayload(),
    },
    devonCorp: devonCorpPage(),
    poch: pochPage([pochTeamRow('unknown-1', mcPokemon)]),
    pastes: {
      aaaaaaaaaaaaaaaa: sheetSources['aaaaaaaaaaaaaaaa.json'],
      bbbbbbbbbbbbbbbb: sheetSources['bbbbbbbbbbbbbbbb.json'],
      '138b4ef886ba95e4': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
      ffffffffffffffff: freshMbPayload,
    },
  };

  const fetchEnv = await writeFetchMock(directory, mockConfig);

  runImport(directory, {
    ...fetchEnv,
    OFFLINE: '0',
    REFRESH: '1',
    PASTE_LIMIT: '5',
  });
  const rebuilt = await readCatalog(directory);
  assert.ok(
    rebuilt.teams.some((t) => t.sheetIds?.includes('MB2')),
    'REFRESH=1 rebuild must admit new historical teams from fresh sources'
  );

  const outPath = catalogPath(directory);

  for (const [condition, writer] of [
    ['missing', async () => rm(outPath, { force: true })],
    ['corrupt', async () => writeFile(outPath, '{ incomplete json')],
    [
      'non-array',
      async () => writeFile(outPath, JSON.stringify({ teams: 'invalid' })),
    ],
    ['empty', async () => writeFile(outPath, JSON.stringify({ teams: [] }))],
  ]) {
    await writer();
    runImport(directory, { OFFLINE: '1', PASTE_LIMIT: '5' });
    const bootstrapCatalog = await readCatalog(directory);
    assert.ok(
      ['M-A', 'M-B', 'M-C', 'Unknown'].every((reg) =>
        bootstrapCatalog.teams.some((t) => t.regulation === reg)
      ),
      `normal import with ${condition} root must bootstrap full history`
    );
  }

  const validBytes = await readFile(outPath, 'utf8');
  const failingMock = await writeFetchMock(directory, {
    ...mockConfig,
    sheets: {
      2001945654: { __status: 503, __body: 'Service Unavailable' },
    },
  });

  assert.throws(
    () =>
      runImport(directory, {
        ...failingMock,
        OFFLINE: '0',
        CHECK_SHEET: '1',
        ALLOW_STALE_SOURCE_CACHE: '',
      }),
    /503/
  );
  assert.equal(
    await readFile(outPath, 'utf8'),
    validBytes,
    'failed import must leave catalog bytes atomically untouched'
  );

  const ifMissingOutput = runImport(directory, { OFFLINE: '1' }, [
    '--if-missing',
  ]);
  assert.equal(
    await readFile(outPath, 'utf8'),
    validBytes,
    'valid if-missing shortcut must leave catalog bytes unchanged'
  );
  assert.doesNotMatch(ifMissingOutput, /Frozen history/);
});
