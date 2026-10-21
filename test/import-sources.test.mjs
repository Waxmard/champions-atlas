import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  catalogPath,
  devonCorpPage,
  devonItems,
  devonPokemon,
  mcItems,
  mcPokemon,
  mbPokemon,
  pasteText,
  pochPage,
  pochTeamRow,
  pokePasteJson,
  readCatalog,
  reasonChecker,
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
} from './fixtures/catalog-import.mjs';
import {
  deduplicate,
  parseSheet,
  teamFromIndex,
} from '../scripts/import-catalog.mjs';
import {
  devonCorpUrl,
  parseVrPaste,
  victoryRoadUrl,
} from '../scripts/catalog-sources.mjs';
import { normalize } from '../src/lib/catalog.ts';

test('imports public index teams alongside the sheets and accounts for every row', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-'));
  try {
    await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': victoryRoadPage([
        vrRow('Alice', rosterHtml(vrRoster), 'https://vrpastes.com/AbC12345/'),
        vrRow(
          'Bob',
          rosterHtml(['Pikachu', ...vrRoster.slice(1)]),
          'https://vrpastes.com/AbC12345/'
        ),
        vrRow(
          'Carol',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/AbC12345'
        ),
        vrRow(
          'Dave',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZyX98765'
        ),
        vrRow(
          'Erin',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/QwE12345'
        ),
        vrRow(
          'Frank',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZzZ99999'
        ),
      ]),
      'devoncorp-m-a.html': devonCorpPage(
        `<h3>Missing paste team</h3><div class="sqs-html-content">` +
          `<p>Replica Code: ABC</p></div>`
      ),
      'vr-AbC12345.json': JSON.stringify(vrProviderPayload()),
      'vr-ZyX98765.json': JSON.stringify(
        vrProviderPayload({ id: 'ZyX98765', hasPassword: true })
      ),
      'vr-QwE12345.json': JSON.stringify(
        vrProviderPayload({ id: 'QwE12345', format: 'VGC Regulation M-B' })
      ),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
    });

    const output = runImport(directory);
    const catalog = await readCatalog(directory);

    assert.deepEqual(
      catalog.sources.map(({ name }) => name),
      ['VGCPastes', 'Victory Road', 'DevonCorp', 'Poch.ms']
    );
    assert.equal(catalog.teams.length, 4);
    const alice = catalog.teams.find(({ creator }) => creator === 'Alice');
    assert.ok(alice, 'the accepted Victory Road row is missing');
    assert.equal(alice.name, 'Alice — Spring Cup');
    assert.equal(alice.regulation, 'M-C');
    assert.equal(alice.pasteUrl, 'https://www.vrpastes.com/AbC12345');
    assert.equal(alice.replicaCode, 'ABC123');
    assert.match(alice.publishedAt, /^2026-\d{2}-\d{2}$/);
    assert.deepEqual(alice.sheetIds, []);
    assert.equal(alice.members[0].pokemon, 'Gengar-Mega');
    assert.equal(alice.members[0].item, 'Gengarite');
    assert.equal(alice.members[0].ability, 'Cursed Body');
    assert.equal(alice.members[0].nature, 'Modest');
    assert.equal(alice.members[0].spread, '30 HP / 13 Def / 16 SpD / 7 Spe');
    assert.match(alice.members[0].set, /Genry \(Gengar\)/);
    assert.ok(
      alice.reports.some(
        ({ event, rank }) => event === 'Spring Cup' && rank === 'Champion'
      )
    );
    assert.ok(
      alice.reports.some(
        ({ event, sourceUrl }) =>
          event === 'Victory Road collection' && sourceUrl === victoryRoadUrl
      )
    );

    const cybertron = catalog.teams.find(
      ({ creator }) => creator === 'CybertronVGC'
    );
    assert.ok(cybertron, 'the DevonCorp team is missing');
    assert.equal(cybertron.regulation, 'M-A');
    assert.equal(cybertron.pasteUrl, 'https://pokepast.es/138b4ef886ba95e4');
    assert.equal(cybertron.publishedAt, '');
    assert.equal(cybertron.replicaCode, 'NFVS4SYCW2');
    assert.ok(
      cybertron.reports.some(
        ({ event, sourceUrl }) =>
          event === 'DevonCorp collection' && sourceUrl === devonCorpUrl
      )
    );
    assert.ok(
      cybertron.reports.some(
        ({ sourceUrl }) => sourceUrl === 'https://youtu.be/Du3AZ5dpIv4?t=67'
      )
    );
    assert.ok(
      cybertron.reports.every(({ rank }) => rank === ''),
      'DevonCorp prose must not become a result'
    );

    for (const rejected of [
      'Bob',
      'Carol',
      'Dave',
      'Erin',
      'Frank',
      'Legacy Player',
    ])
      assert.ok(
        !catalog.teams.some(({ creator }) => creator === rejected),
        `${rejected} should not reach the catalog`
      );

    assert.match(
      output,
      /Victory Road: 6 discovered — 1 accepted, 0 retained, 4 skipped, 1 merged\./
    );
    assert.match(
      output,
      /DevonCorp: 2 discovered — 1 accepted, 0 retained, 1 skipped, 0 merged\./
    );
    for (const reason of [
      'roster_mismatch=1',
      'protected_paste=1',
      'format_conflict=1',
      'paste_unavailable=1',
      'missing_paste=1',
    ])
      assert.match(output, new RegExp(reason), `${reason} was not reported`);
    assert.match(output, /Imported 4 teams/);

    const ids = catalog.teams.map(({ id }) => id).sort();
    const again = await readCatalog(directory);
    assert.deepEqual(again.teams.map(({ id }) => id).sort(), ids);
    const second = runImport(directory);
    const third = await readCatalog(directory);
    assert.deepEqual(third.teams.map(({ id }) => id).sort(), ids);
    assert.equal(third.sourceHash, again.sourceHash);
    assert.equal(runImport(directory), second);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('transient payload loss retains prior public metadata without adopting a changed creator', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-retain-'));
  try {
    const cache = await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': victoryRoadPage([
        vrRow(
          'Erin',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZzZ99999'
        ),
      ]),
      'devoncorp-m-a.html': devonCorpPage(),
      'vr-ZzZ99999.json': JSON.stringify(vrProviderPayload({ id: 'ZzZ99999' })),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
    });
    runImport(directory);
    const before = await readCatalog(directory);
    const original = before.teams.find(({ creator }) => creator === 'Erin');
    assert.ok(original, 'the first run should accept the row');

    await rm(join(cache, 'vr-ZzZ99999.json'));
    await writeFile(
      join(cache, 'victory-road.html'),
      victoryRoadPage([
        vrRow(
          'Impostor',
          rosterHtml(vrRoster),
          'https://www.vrpastes.com/ZzZ99999'
        ),
      ])
    );
    const output = runImport(directory);
    const after = await readCatalog(directory);
    const retained = after.teams.find(({ id }) => id === original.id);
    assert.ok(retained, 'the compatible prior team should be retained');
    assert.equal(retained.creator, 'Erin');
    assert.equal(retained.name, original.name);
    assert.equal(retained.pasteUrl, original.pasteUrl);
    assert.ok(retained.pasteError, 'a retained team must expose its error');
    assert.deepEqual(retained.members, original.members);
    assert.ok(
      !after.teams.some(({ creator }) => creator === 'Impostor'),
      'an unverified current creator must not be attached'
    );
    assert.match(
      output,
      /Victory Road: 1 discovered — 0 accepted, 1 retained, 0 skipped, 0 merged\./
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('format, protection, and roster conflicts never return from prior state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-conflict-'));
  try {
    const ids = ['AbC12345', 'DeF67890', 'GhI13579'];
    const page = (thirdRoster) =>
      victoryRoadPage([
        vrRow(
          'First',
          rosterHtml(vrRoster),
          `https://www.vrpastes.com/${ids[0]}`
        ),
        vrRow(
          'Second',
          rosterHtml(vrRoster),
          `https://www.vrpastes.com/${ids[1]}`
        ),
        vrRow('Third', thirdRoster, `https://www.vrpastes.com/${ids[2]}`),
      ]);
    const cache = await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': page(rosterHtml(vrRoster)),
      'devoncorp-m-a.html': devonCorpPage(),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
      ...Object.fromEntries(
        ids.map((id) => [
          `vr-${id}.json`,
          JSON.stringify(vrProviderPayload({ id })),
        ])
      ),
    });
    runImport(directory);
    assert.equal((await readCatalog(directory)).teams.length, 6);

    await writeFile(
      join(cache, `vr-${ids[0]}.json`),
      JSON.stringify(vrProviderPayload({ id: ids[0], hasPassword: true }))
    );
    await writeFile(
      join(cache, `vr-${ids[1]}.json`),
      JSON.stringify(
        vrProviderPayload({ id: ids[1], format: 'VGC Regulation M-B' })
      )
    );
    await writeFile(
      join(cache, 'victory-road.html'),
      page(rosterHtml(['Pikachu', ...vrRoster.slice(1)]))
    );
    const output = runImport(directory);
    const after = await readCatalog(directory);
    assert.deepEqual(
      after.teams.map(({ creator }) => creator).sort(),
      ['CybertronVGC', 'Owner', 'Owner'],
      'only the sheet teams and the unaffected collection may remain'
    );
    for (const reason of [
      'protected_paste=1',
      'format_conflict=1',
      'roster_mismatch=1',
    ])
      assert.match(output, new RegExp(reason));
    assert.match(
      output,
      /Victory Road: 3 discovered — 0 accepted, 0 retained, 3 skipped, 0 merged\./
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PASTE_LIMIT spends sheet attempts first and reports limited candidates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-public-limit-'));
  try {
    const ids = ['AbC12345', 'DeF67890', 'GhI13579', 'JkL24680'];
    const page = (rows) =>
      victoryRoadPage(
        rows.map((id, index) =>
          vrRow(
            `Player ${index}`,
            rosterHtml(vrRoster),
            `https://www.vrpastes.com/${id}`
          )
        )
      );
    await writeCache(directory, {
      ...sheetSources,
      'victory-road.html': page(ids.slice(0, 3)),
      'devoncorp-m-a.html': devonCorpPage(),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
      ...Object.fromEntries(
        ids.map((id) => [
          `vr-${id}.json`,
          JSON.stringify(vrProviderPayload({ id })),
        ])
      ),
    });
    runImport(directory);
    const full = await readCatalog(directory);
    const accepted = ids
      .slice(0, 3)
      .map((id) => full.teams.find(({ pasteUrl }) => pasteUrl.endsWith(id)).id);

    const partial = runImport(directory, { PASTE_LIMIT: '3' });
    const partialCatalog = await readCatalog(directory);
    assert.deepEqual(
      partialCatalog.teams.map(({ id }) => id).sort(),
      full.teams.map(({ id }) => id).sort()
    );
    assert.match(
      partial,
      /Victory Road: 3 discovered — 1 accepted, 2 retained, 0 skipped, 0 merged\./
    );
    for (const id of accepted.slice(1))
      assert.equal(
        partialCatalog.teams.find((team) => team.id === id).pasteError ?? null,
        null,
        'limit-only reuse must keep prior metadata unchanged'
      );

    const zero = runImport(directory, { PASTE_LIMIT: '2' });
    assert.match(
      zero,
      /Victory Road: 3 discovered — 0 accepted, 3 retained, 0 skipped, 0 merged\./
    );

    await writeFile(
      join(directory, '.cache/catalog/victory-road.html'),
      page(ids)
    );
    const limited = runImport(directory, { PASTE_LIMIT: '2' });
    const limitedCatalog = await readCatalog(directory);
    assert.equal(limitedCatalog.teams.length, full.teams.length);
    assert.ok(
      !limitedCatalog.teams.some(({ pasteUrl }) => pasteUrl.endsWith(ids[3])),
      'a new candidate beyond the budget must be omitted, never emitted'
    );
    assert.match(limited, /limited=1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('public teams built from a real sheet record keep the sheet identity and merge reports', () => {
  const pasteUrl = 'https://pokepast.es/138b4ef886ba95e4';
  const blocks = pasteText(devonPokemon, devonItems);
  const csv = sheetCsv([
    sheetRow('MA1', {
      pokemon: ['Charizard-Mega-Y', ...devonPokemon.slice(1)],
      items: devonItems,
      paste: pasteUrl,
      source: 'https://events.example/ma',
    }),
  ]);
  const [sheetTeam] = parseSheet(csv, 'M-A');
  const identity = sheetTeam.members
    .map(({ pokemon, item }) => [pokemon, item])
    .sort();
  assert.equal(
    sheetTeam.id,
    `m-a-${createHash('sha256')
      .update(JSON.stringify(['M-A', pasteUrl, identity]))
      .digest('hex')
      .slice(0, 16)}`
  );

  const canonicalNames = new Map(
    sheetTeam.members.map(({ pokemon }) => [normalize(pokemon), pokemon])
  );
  const candidate = {
    sourceName: 'DevonCorp',
    indexUrl: devonCorpUrl,
    name: 'Fixture team',
    creator: 'Builder',
    regulation: 'M-A',
    pasteUrl,
    replicaCode: null,
    expectedSpecies: null,
    reports: [
      { event: 'DevonCorp collection', rank: '', sourceUrl: devonCorpUrl },
    ],
  };
  const payload = {
    paste: blocks,
    notes: 'Format: gen9championsvgc2026regma',
    publishedAt: '',
    provider: 'pokepaste',
  };
  const publicTeam = teamFromIndex(candidate, payload, canonicalNames);
  assert.equal(publicTeam.id, sheetTeam.id);
  assert.equal(publicTeam.paste, blocks);

  const merged = deduplicate([sheetTeam, publicTeam]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sheetIds, ['MA1']);
  assert.equal(merged[0].creator, 'Owner');
  assert.equal(merged[0].paste, null);
  assert.equal(merged[0].reports.length, 2);

  const other = teamFromIndex(
    { ...candidate, pasteUrl: 'https://pokepast.es/0123456789abcdef' },
    payload,
    canonicalNames
  );
  assert.notEqual(other.id, sheetTeam.id);
  const changed = teamFromIndex(
    candidate,
    { ...payload, paste: blocks.replace('Choice Specs', 'Choice Band') },
    canonicalNames
  );
  assert.notEqual(changed.id, sheetTeam.id);
  assert.equal(deduplicate([sheetTeam, publicTeam, other, changed]).length, 3);
});

test('index payloads are admitted only for the candidate Champions regulation', () => {
  const blocks = pasteText(devonPokemon, devonItems);
  const candidate = {
    sourceName: 'DevonCorp',
    indexUrl: devonCorpUrl,
    name: 'Fixture team',
    creator: 'Builder',
    regulation: 'M-A',
    pasteUrl: 'https://pokepast.es/138b4ef886ba95e4',
    replicaCode: null,
    expectedSpecies: null,
    reports: [
      { event: 'DevonCorp collection', rank: '', sourceUrl: devonCorpUrl },
    ],
  };
  const payload = {
    paste: blocks,
    notes: null,
    publishedAt: '',
    provider: 'pokepaste',
  };
  const names = new Map();
  const format = (notes) =>
    teamFromIndex(candidate, { ...payload, notes }, names);

  assert.ok(format(null), 'missing metadata stays unknown');
  assert.ok(format('Format: gen9championsvgc2026regma'));
  assert.ok(format('Format: gen9vgcregulationma'));
  for (const notes of [
    'Format: gen9ou',
    'Format: gen9championsou',
    'Format: gen9vgcregulationmb',
    'Format: gen9vgc2023series2',
  ])
    assert.throws(
      () => format(notes),
      reasonChecker('format_conflict'),
      `${notes} must not be admitted as M-A`
    );

  const vrCandidate = {
    ...candidate,
    sourceName: 'Victory Road',
    indexUrl: victoryRoadUrl,
    regulation: 'M-C',
    pasteUrl: 'https://www.vrpastes.com/AbC12345',
    expectedSpecies: vrRoster,
    reports: [
      { event: 'Victory Road collection', rank: '', sourceUrl: victoryRoadUrl },
    ],
  };
  const parsed = parseVrPaste(vrProviderPayload());
  const vrPayload = { ...parsed, provider: 'victory-road' };
  const team = teamFromIndex(vrCandidate, vrPayload, names);
  assert.equal(team.members[0].pokemon, 'Gengar-Mega');
  assert.equal(team.members[0].spread, '30 HP / 13 Def / 16 SpD / 7 Spe');
  assert.ok(
    teamFromIndex(vrCandidate, { ...vrPayload, format: null }, names),
    'unknown provider format stays unknown'
  );
  assert.throws(
    () =>
      teamFromIndex(
        vrCandidate,
        { ...vrPayload, format: 'VGC Regulation M-B' },
        names
      ),
    reasonChecker('format_conflict')
  );
  assert.throws(
    () =>
      teamFromIndex(
        { ...vrCandidate, expectedSpecies: ['Pikachu', ...vrRoster.slice(1)] },
        vrPayload,
        names
      ),
    reasonChecker('roster_mismatch')
  );
});
test('cached import rejects ineligible sheet, public, and Poch teams before assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-eligibility-import-'));
  try {
    const illegalPokemon = ['Brute Bonnet', ...mcPokemon.slice(1)];
    const illegalItems = ['Booster Energy', ...mcItems.slice(1)];
    const badSheetUrl = 'https://pokepast.es/cccccccccccccccc';
    const pokemonIds = {
      Gengar: 94,
      Snorlax: 143,
      Dragonite: 149,
      Pelipper: 279,
      Incineroar: 727,
      Basculegion: 902,
      Kingambit: 983,
      Sinistcha: 1013,
      Farigiraf: 981,
      Charizard: 6,
      Garchomp: 445,
      Ampharos: 181,
      Scrafty: 560,
      Rillaboom: 812,
      'Brute Bonnet': 986,
    };
    const indexed = [
      ...new Set([
        ...mcPokemon,
        ...mbPokemon,
        ...devonPokemon,
        ...vrRoster,
        ...illegalPokemon,
      ]),
    ]
      .filter((pokemon) => pokemonIds[pokemon])
      .map((pokemon) => ({
        name: pokemon.toLowerCase().replaceAll(' ', '-'),
        url: `https://pokeapi.co/api/v2/pokemon/${pokemonIds[pokemon]}/`,
      }));
    const publicPayload = vrProviderPayload({
      id: 'QwE12345',
      teams: illegalPokemon.map((species, index) => ({
        species,
        name: species,
        item: illegalItems[index],
      })),
    });
    const cache = await writeCache(directory, {
      ...sheetSources,
      'M-C.csv': sheetCsv([
        sheetRow('MC2', {
          pokemon: illegalPokemon,
          items: illegalItems,
          paste: badSheetUrl,
        }),
        sheetRow('MC1', {
          pokemon: mcPokemon,
          items: mcItems,
          paste: 'https://pokepast.es/aaaaaaaaaaaaaaaa',
        }),
      ]),
      'victory-road.html': victoryRoadPage([
        vrRow(
          'Off-roster Player',
          rosterHtml(illegalPokemon),
          'https://www.vrpastes.com/QwE12345'
        ),
      ]),
      'vr-QwE12345.json': JSON.stringify(publicPayload),
      'devoncorp-m-a.html': devonCorpPage(),
      '138b4ef886ba95e4.json': pokePasteJson(
        pasteText(devonPokemon, devonItems),
        'Format: gen9championsvgc2026regma'
      ),
      'poch-leaderboard.html': pochPage([
        pochTeamRow('unknown-valid', mcPokemon),
        pochTeamRow('unknown-ineligible', [
          'Vivillon-Pokeball',
          ...mcPokemon.slice(1),
        ]),
      ]),
      [`${badSheetUrl.split('/').at(-1)}.json`]: pokePasteJson(
        pasteText(illegalPokemon, illegalItems),
        'Format: gen9vgcregulationmc'
      ),
      'pokemon.json': JSON.stringify({ results: indexed }),
    });
    const fetchEnv = await writeFetchMock(directory, {});
    const outputPath = catalogPath(directory);
    await mkdir(join(directory, 'src/lib/data'), { recursive: true });
    await writeFile(
      outputPath,
      JSON.stringify({
        teams: [
          {
            id: 'sentinel',
            regulation: 'M-C',
            members: illegalPokemon.map((pokemon) => ({ pokemon })),
          },
        ],
      })
    );

    const output = runImport(directory, { ...fetchEnv, PASTE_LIMIT: '4' }, [
      '--if-missing',
    ]);
    let catalog = await readCatalog(directory);
    assert.ok(
      ['M-A', 'M-B', 'M-C', 'Unknown'].every((regulation) =>
        catalog.teams.some((team) => team.regulation === regulation)
      ),
      'legal historical and whole-roster Unknown teams should survive'
    );
    assert.ok(!catalog.teams.some(({ id }) => id === 'sentinel'));
    assert.ok(
      !catalog.teams.some((team) =>
        team.members.some(({ pokemon }) => pokemon === 'Brute Bonnet')
      )
    );
    assert.ok(!catalog.teams.some(({ sheetIds }) => sheetIds.includes('MC2')));
    assert.ok(catalog.teams.some(({ id }) => id === 'poch-x-unknown-valid'));
    assert.match(output, /2\/2 pastes enriched/);
    assert.match(
      output,
      /Victory Road: 1 discovered — 0 accepted, 0 retained, 1 skipped, 0 merged\./
    );
    assert.match(
      output,
      /Poch\.ms: 2 discovered — 1 accepted, 0 retained, 1 skipped, 0 merged\./
    );
    assert.match(output, /ineligible_species=3/);
    let assetRequests = JSON.parse(
      await readFile(fetchEnv.MOCK_FETCH_LOG, 'utf8')
    ).map((address) => new URL(address));
    assert.ok(
      assetRequests.every(
        ({ hostname }) => hostname === 'raw.githubusercontent.com'
      )
    );
    assert.ok(
      !assetRequests.some(({ pathname }) => pathname.endsWith('/986.png'))
    );
    assert.ok(
      !assetRequests.some(({ pathname }) =>
        pathname.endsWith('/666-poke-ball.png')
      )
    );
    assert.ok(
      !assetRequests.some(({ pathname }) =>
        pathname.endsWith('/ibooster_energy.png')
      )
    );

    const mcTeam = catalog.teams.find(({ sheetIds }) =>
      sheetIds.includes('MC1')
    );
    assert.ok(mcTeam);
    mcTeam.paste = pasteText(illegalPokemon, illegalItems);
    mcTeam.pasteNotes = 'Format: gen9vgcregulationmc';
    await writeFile(outputPath, JSON.stringify(catalog));
    const afterPrior = runImport(directory, {
      ...fetchEnv,
      PASTE_LIMIT: '4',
    });
    catalog = await readCatalog(directory);
    assert.ok(
      catalog.teams.some(({ sheetIds }) => sheetIds.includes('MC1')),
      'mismatched prior paste must not replace the eligible sheet roster'
    );
    assert.ok(
      !catalog.teams.some((team) =>
        team.members.some(({ pokemon }) => pokemon === 'Brute Bonnet')
      )
    );
    assert.match(afterPrior, /ineligible_species=3/);
    assetRequests = JSON.parse(
      await readFile(fetchEnv.MOCK_FETCH_LOG, 'utf8')
    ).map((address) => new URL(address));
    assert.ok(
      !assetRequests.some(({ pathname }) => pathname.endsWith('/986.png'))
    );
    assert.ok(
      !assetRequests.some(({ pathname }) =>
        pathname.endsWith('/ibooster_energy.png')
      )
    );

    const mbTeam = catalog.teams.find(({ regulation }) => regulation === 'M-B');
    assert.ok(mbTeam);
    mbTeam.members[0].pokemon = 'Brute Bonnet';
    await writeFile(outputPath, JSON.stringify(catalog));
    const previous = await readFile(outputPath, 'utf8');
    await rm(join(cache, 'M-C.csv'));
    assert.throws(
      () => runImport(directory, fetchEnv, ['--if-missing']),
      /Missing cached sheet/
    );
    assert.equal(await readFile(outputPath, 'utf8'), previous);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
