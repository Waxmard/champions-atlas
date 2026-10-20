import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  mbItems,
  mbPokemon,
  pokePasteJson,
  readCatalog,
  runImport,
  sheetCsv,
  sheetRow,
  snapshotPath,
  youtubePasteUrl,
  youtubeRow,
  youtubeSnapshot,
  writeYoutubeImportFixture,
} from './fixtures/catalog-import.mjs';

const videoId = 'eeeeeeeeeee';
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const publishedAt = '2026-10-03T10:00:00Z';
const originalUrl = youtubePasteUrl('aaaaaaaaaaaaaaaa');
const donorUrl = youtubePasteUrl('cccccccccccccccc');
const title = 'Pokémon Champions VGC tournament team';
const linkedDescription = `Original team: ${originalUrl}\n\nMy version: ${donorUrl}`;
const dateRow = (pasteUrl, description = linkedDescription) =>
  youtubeRow(pasteUrl, videoId, { title, description, publishedAt });
const donorSpread = '32 HP / 32 Atk / 2 Def';
const moves = ['Protect', 'Fake Out', 'Tackle', 'Rest'];
const paste = ({ includeSpread, includeNature }) =>
  mbPokemon
    .map((pokemon, index) =>
      [
        `${pokemon} @ ${mbItems[index]}`,
        'Ability: Fixture Ability',
        'Level: 50',
        ...(includeSpread ? [`EVs: ${donorSpread}`] : []),
        ...(includeNature ? ['Adamant Nature'] : []),
        ...moves.map((move) => `- ${move}`),
      ].join('\n')
    )
    .join('\n\n');

const originalPaste = paste({ includeSpread: false, includeNature: false });
const donorPaste = paste({ includeSpread: true, includeNature: true });
const originalNotes = 'Achieved Rank: 2';
const donorNotes = 'Achieved Rank: 1';
const originalPayload = pokePasteJson(originalPaste, originalNotes);
const donorPayload = pokePasteJson(donorPaste, donorNotes);
const attributedMembers = (team) =>
  team.members.every(
    ({ spread, nature, spreadSource }) =>
      spread === donorSpread &&
      nature === 'Adamant' &&
      spreadSource?.pasteUrl === donorUrl &&
      spreadSource.videoUrls.includes(videoUrl) &&
      spreadSource.borrowedNature &&
      spreadSource.sourceSet.includes('EVs:') &&
      !spreadSource.originalSet.includes('EVs:') &&
      spreadSource.appliedSignature.length > 0
  );

test('offline importer infers, enriches linked variants, and recomputes provenance', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-youtube-enrichment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const rows = [dateRow(originalUrl), dateRow(donorUrl)];
  const cache = await writeYoutubeImportFixture(directory, rows, {
    aaaaaaaaaaaaaaaa: originalPayload,
  });
  await writeFile(
    join(cache, 'M-C.csv'),
    sheetCsv([
      sheetRow('MC1', {
        pokemon: mbPokemon,
        items: mbItems,
        paste: originalUrl,
      }),
    ])
  );
  const limitOutput = runImport(directory, { PASTE_LIMIT: '1' });
  const limitedCatalog = await readCatalog(directory);
  assert.ok(
    !limitedCatalog.teams.some(({ pasteUrl }) => pasteUrl === donorUrl),
    'a donor beyond the normal paste budget must not be fetched or emitted'
  );
  assert.doesNotMatch(
    limitOutput,
    /paste_unavailable/,
    'the absent donor cache must stay untouched when the paste budget is exhausted'
  );

  await writeFile(join(cache, 'cccccccccccccccc.json'), donorPayload);
  runImport(directory);
  let catalog = await readCatalog(directory);
  let original = catalog.teams.find(({ pasteUrl }) => pasteUrl === originalUrl);
  let donor = catalog.teams.find(({ pasteUrl }) => pasteUrl === donorUrl);

  assert.ok(original && donor, 'both paste variants should be retained');
  assert.notEqual(original.id, donor.id);
  assert.ok(original.sheetIds.includes('MC1'));
  assert.equal(original.regulation, 'M-C');
  assert.equal(original.regulationInference, undefined);
  assert.deepEqual(donor.regulationInference, {
    method: 'video-date',
    publishedAt,
    sourceUrl: videoUrl,
  });
  assert.ok(attributedMembers(original));
  assert.ok(
    donor.members.every(
      (member) =>
        member.spread === donorSpread &&
        member.nature === 'Adamant' &&
        member.spreadSource === undefined
    ),
    'the donor remains its own unmodified catalog variant'
  );
  assert.equal(original.paste, originalPaste);
  assert.equal(original.pasteNotes, originalNotes);
  assert.doesNotMatch(original.paste, /^EVs: /m);
  assert.doesNotMatch(original.paste, /^Adamant Nature$/m);
  assert.ok(
    original.reports.some(
      ({ rank, sourceUrl }) => rank === 'Rank 2' && sourceUrl === originalUrl
    )
  );
  assert.ok(
    !original.reports.some(({ rank }) => rank === 'Rank 1'),
    'donor result annotations must not move onto the original'
  );
  assert.ok(
    donor.reports.some(
      ({ rank, sourceUrl }) => rank === 'Rank 1' && sourceUrl === donorUrl
    )
  );

  await rm(snapshotPath(cache));
  runImport(directory);
  catalog = await readCatalog(directory);
  original = catalog.teams.find(({ pasteUrl }) => pasteUrl === originalUrl);
  assert.ok(
    attributedMembers(original),
    'keyless inactive imports retain attribution'
  );

  const unlinked = rows.map(({ pasteUrl }) =>
    dateRow(pasteUrl, `${originalUrl}\n\n${donorUrl}`)
  );
  await writeFile(
    snapshotPath(cache),
    JSON.stringify(youtubeSnapshot(unlinked))
  );
  runImport(directory);
  catalog = await readCatalog(directory);
  original = catalog.teams.find(({ pasteUrl }) => pasteUrl === originalUrl);
  assert.ok(original);
  assert.ok(
    original.members.every(
      ({ spread, nature, spreadSource }) =>
        spread === null && nature === null && spreadSource === undefined
    ),
    'active recomputation removes fills after the explicit relationship disappears'
  );
  await writeFile(join(cache, 'cccccccccccccccc.json'), donorPayload);
  await writeFile(snapshotPath(cache), JSON.stringify(youtubeSnapshot(rows)));
  runImport(directory);
  catalog = await readCatalog(directory);
  original = catalog.teams.find(({ pasteUrl }) => pasteUrl === originalUrl);
  assert.ok(attributedMembers(original), 'restored links reapply enrichment');

  await writeFile(
    join(cache, 'cccccccccccccccc.json'),
    pokePasteJson(donorPaste, 'Format: gen9ou\nAchieved Rank: 1')
  );
  const rejectedOutput = runImport(directory);
  catalog = await readCatalog(directory);
  original = catalog.teams.find(({ pasteUrl }) => pasteUrl === originalUrl);
  assert.match(rejectedOutput, /unsupported_format/);
  assert.ok(
    !catalog.teams.some(({ pasteUrl }) => pasteUrl === donorUrl),
    'a newly rejected donor must not be retained from prior catalog state'
  );
  assert.ok(
    original.members.every(
      ({ spread, nature, spreadSource }) =>
        spread === null && nature === null && spreadSource === undefined
    ),
    'prior borrowed values must reset when the active donor is rejected'
  );
});
