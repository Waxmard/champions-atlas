import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  catalogPath,
  mcItems,
  mcPokemon,
  pasteText,
  pokePasteJson,
  readCatalog,
  runImport,
  writeFetchMock,
  writeYoutubeImportFixture,
  youtubeChampionNotes,
  youtubePasteUrl,
  youtubeRow,
  youtubeTeamFromCandidate,
} from './fixtures/catalog-import.mjs';

test('reuses recorded YouTube rejections instead of re-reading pastes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-youtube-decisions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pasteId = 'dddddddddddddddd';
  const row = youtubeRow(youtubePasteUrl(pasteId), 'ddddddddddd', {
    description: `${youtubePasteUrl(pasteId)}\nFormat: gen9ou`,
  });
  const cache = await writeYoutubeImportFixture(directory, [row], {
    [pasteId]: pokePasteJson(pasteText(mcPokemon, mcItems), 'Format: gen9ou'),
  });
  const first = runImport(directory);
  assert.match(first, /unsupported_format=1/);
  assert.ok(!first.includes('YouTube decisions reused'));
  const ids = (await readCatalog(directory)).teams.map(({ id }) => id).sort();
  await rm(join(cache, `${pasteId}.json`));
  const second = runImport(directory);
  assert.match(second, /YouTube decisions reused from cache: 1\./);
  assert.match(second, /unsupported_format=1/);
  assert.deepEqual(
    (await readCatalog(directory)).teams.map(({ id }) => id).sort(),
    ids
  );
});

test('YouTube budget, transient, and keyless priors reject ineligible teams', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-youtube-eligibility-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pasteId = 'dddddddddddddddd';
  const row = youtubeRow(youtubePasteUrl(pasteId), 'ddddddddddd');
  const badPokemon = ['Brute Bonnet', ...mcPokemon.slice(1)];
  const badPaste = pasteText(badPokemon, [
    'Booster Energy',
    ...mcItems.slice(1),
  ]);
  const cache = await writeYoutubeImportFixture(directory, [row], {
    [pasteId]: pokePasteJson(
      pasteText(mcPokemon, mcItems),
      youtubeChampionNotes
    ),
  });
  const fetchEnv = await writeFetchMock(directory, {});
  runImport(directory, fetchEnv);
  const accepted = (await readCatalog(directory)).teams.find(
    ({ pasteUrl }) => pasteUrl === row.pasteUrl
  );
  assert.ok(accepted, 'the initial legal YouTube candidate should import');
  const invalid = {
    ...youtubeTeamFromCandidate(row, {
      paste: badPaste,
      notes: youtubeChampionNotes,
    }),
    reports: accepted.reports,
  };
  const savePrior = async (team) => {
    const catalog = await readCatalog(directory);
    const index = catalog.teams.findIndex(
      ({ pasteUrl }) => pasteUrl === row.pasteUrl
    );
    if (index < 0) catalog.teams.push(team);
    else catalog.teams[index] = team;
    await writeFile(catalogPath(directory), JSON.stringify(catalog));
  };

  await writeFile(
    join(cache, `${pasteId}.json`),
    pokePasteJson(badPaste, youtubeChampionNotes)
  );
  const fresh = runImport(directory, fetchEnv);
  assert.ok(
    !(await readCatalog(directory)).teams.some(
      ({ pasteUrl }) => pasteUrl === row.pasteUrl
    )
  );
  assert.match(fresh, /ineligible_species=1/);
  assert.match(
    fresh,
    /pokeaimMD: .*0 accepted, 0 retained, 1 skipped, 0 merged/
  );

  await savePrior(invalid);
  const limited = runImport(directory, { ...fetchEnv, PASTE_LIMIT: '2' });
  assert.ok(
    !(await readCatalog(directory)).teams.some(
      ({ pasteUrl }) => pasteUrl === row.pasteUrl
    )
  );
  assert.match(limited, /ineligible_species=1/);

  await savePrior(invalid);
  await rm(join(cache, `${pasteId}.json`));
  const transient = runImport(directory, fetchEnv);
  assert.ok(
    !(await readCatalog(directory)).teams.some(
      ({ pasteUrl }) => pasteUrl === row.pasteUrl
    )
  );
  assert.match(transient, /ineligible_species=1/);

  const catalog = await readCatalog(directory);
  catalog.teams.push({
    ...invalid,
    id: 'youtube-keyless-ineligible',
    pasteUrl: '',
    paste: null,
  });
  await writeFile(catalogPath(directory), JSON.stringify(catalog));
  await rm(join(cache, 'youtube-sources.json'));
  const keyless = runImport(directory, fetchEnv);
  assert.ok(
    !(await readCatalog(directory)).teams.some(
      ({ id }) => id === 'youtube-keyless-ineligible'
    )
  );
  assert.match(keyless, /ineligible_species=1/);
});
