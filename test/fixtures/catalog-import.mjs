import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  loadYoutubeSource,
  youtubeCandidate,
  youtubeChannels,
} from '../../scripts/youtube-source.mjs';
import { teamFromIndex } from '../../scripts/import-catalog.mjs';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const importScript = fileURLToPath(
  new URL('../../scripts/import-catalog.mjs', import.meta.url)
);
const sheetHeader =
  'Team ID|1|2|3|4|5|6|B|C|v1|v2|v3|Pokemon Text for Copypasta||||||Team Description|Full Name|Date Shared|Pokepaste|Replica Code\n(Click text for image)|Replica Status|Tournament / Event|Rank|Link to Source'.split(
    '|'
  );
const list = (value) => value.split('/');
export const vrRoster = list(
  'Gengar Mega/Snorlax/Incineroar/Scrafty/Dragonite/Rillaboom'
);
export const mcPokemon = list(
  'Gholdengo/Amoonguss/Iron Hands/Farigiraf/Pelipper/Basculegion'
);
export const mcItems = list(
  'Choice Specs/Rocky Helmet/Assault Vest/Safety Goggles/Focus Sash/Mystic Water'
);
export const mbPokemon = list(
  'Kingambit/Sinistcha/Rillaboom/Incineroar/Dragonite/Snorlax'
);
export const mbItems = list(
  'Black Glasses/Sitrus Berry/Miracle Seed/Charcoal/Life Orb/Leftovers'
);
export const devonPokemon = list(
  'Charizard/Garchomp/Amoonguss/Incineroar/Rillaboom/Gholdengo'
);
export const devonItems = list(
  'Charizardite Y/Clear Amulet/Sitrus Berry/Safety Goggles/Miracle Seed/Choice Specs'
);

const csvField = (value) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function sheetRow(id, team) {
  const row = Array(sheetHeader.length).fill('');
  row[0] = id;
  team.items.forEach((item, index) => {
    row[3 + index] = item;
  });
  team.pokemon.forEach((name, index) => {
    row[12 + index] = name;
  });
  row[18] = team.name || id;
  row[19] = team.creator || 'Owner';
  row[20] = team.date || '12 Sep 2026';
  row[21] = team.paste;
  row[22] = team.code || '';
  row[23] = 'Open';
  row[24] = team.event || '';
  row[25] = team.rank || '';
  row[26] = team.source || '';
  return row;
}

export const sheetCsv = (rows) =>
  [sheetHeader, ...rows].map((row) => row.map(csvField).join(',')).join('\n');

function setBlock(name, item, ability, nature, moves, spread) {
  return [
    item ? `${name} @ ${item}` : name,
    `Ability: ${ability}`,
    'Level: 50',
    spread ? `EVs: ${spread}` : '',
    `${nature} Nature`,
    ...moves.map((move) => `- ${move}`),
  ]
    .filter(Boolean)
    .join('\n');
}

export const pasteText = (species, items) =>
  species
    .map((name, index) =>
      setBlock(
        name,
        items[index],
        'Ability',
        'Adamant',
        ['Protect', 'Fake Out'],
        '2 HP / 32 Atk'
      )
    )
    .join('\n\n');

export const pokePasteJson = (blocks, notes) =>
  JSON.stringify({
    author: 'Fixture',
    notes,
    paste: blocks,
    title: 'Fixture team',
  });

const vrSetSpecs = [
  'Gengar|Genry|Gengarite|Cursed Body|Modest|hp=30,def=13,spd=16,spe=7|Perish Song,Shadow Ball,Sludge Bomb,Protect',
  'Snorlax|Snorlax|Leftovers|Thick Fat|Relaxed|hp=21,def=31,spd=14|Yawn,Encore,Fissure,Protect',
  'Incineroar|Incineroar|Sitrus Berry|Intimidate|Relaxed|hp=32,def=25,spd=9|Flare Blitz,Parting Shot,Fake Out,Protect',
  'Scrafty|Scrafty|Focus Sash|Intimidate|Impish|hp=32,def=4,spd=4,spe=26|Close Combat,Knock Off,Fake Out,Protect',
  'Dragonite|Dragonite|Life Orb|Inner Focus|Adamant|hp=29,atk=32,spe=5|Dragon Claw,Low Kick,Extreme Speed,Protect',
  'Rillaboom|Rillaboom|Eject Button|Grassy Surge|Sassy|hp=32,def=4,spd=30|Grassy Glide,U-turn,Fake Out,Protect',
];

const vrTeams = vrSetSpecs.map((spec) => {
  const [species, name, item, ability, nature, evs, moves] = spec.split('|');
  return {
    species,
    name,
    item,
    ability,
    nature,
    evs: Object.fromEntries(
      evs.split(',').map((pair) => {
        const [stat, value] = pair.split('=');
        return [stat, Number(value)];
      })
    ),
    moves: moves.split(','),
    ...(species === 'Gengar' ? { shiny: true } : {}),
  };
});

export const vrProviderPayload = (overrides = {}) => ({
  id: 'AbC12345',
  is_public: true,
  is_encrypted: false,
  format: 'VGC Regulation M-C',
  createdAt: 1789118018,
  teams: vrTeams,
  ...overrides,
});

export const rosterHtml = (names) =>
  names
    .map((name) => `<img title="${name}" alt="${name}" width="64px"/>`)
    .join('');

export const vrRow = (player, roster, paste, rank = 'Champion') =>
  `<tr><td></td><td><b>${player}</b></td>` +
  `<td><b>Spring Cup<br>${rank}</b></td><td><div>${roster}</div></td>` +
  `<td>AB C 123</td><td><a href="${paste}"><img title="Export"/></a></td><td></td></tr>`;

const vrTable = (rows, start = 0) =>
  `<table><thead><tr><th>Flag</th><th>Player</th><th>Best results</th><th>Team</th>` +
  `<th>Code</th><th>Paste</th><th>Rep.</th></tr></thead><tbody>${rows.slice(start).join('')}` +
  `</tbody></table>`;

export const victoryRoadPage = (rows) =>
  `<h1>Pokémon Champions — Replica Teams</h1>` +
  `<h2>Regulation Set (M-C)</h2><h3>Teams reaching finals of large tournaments</h3>` +
  vrTable(rows) +
  `<h2>Past formats</h2>` +
  vrTable([
    vrRow(
      'Legacy Player',
      rosterHtml(vrRoster),
      'https://pokepast.es/0123456789abcdef'
    ),
  ]);
export const youtubeVictoryRoadUrl = 'https://www.vrpastes.com/AbC12345';
export const youtubeVictoryRoadHtml = victoryRoadPage([
  vrRow('Fixture Player', rosterHtml(vrRoster), youtubeVictoryRoadUrl),
]);
export const youtubeVictoryRoadPayload = vrProviderPayload();

export const devonCorpPage = (extra = '') =>
  `<h1>38 Teams to Try for Pokémon Champions Regulation M-A</h1>` +
  `<a href="https://pokepast.es/ffffffffffffffff">unrelated</a>` +
  `<article><div class="blog-item-content e-content">` +
  `<h3>CYBERTRON TEAM</h3><div class="sqs-html-content">` +
  `<p>Teambuilder: <a href="https://x.com/CybertronVGC">https://x.com/CybertronVGC</a></p>` +
  `<p>Replica Code: NFVS4SYCW2</p>` +
  `<p>Pokepaste: <a href="https://pokepast.es/138b4ef886ba95e4">paste</a></p>` +
  `<p><a href="https://youtu.be/Du3AZ5dpIv4?t=67">Link to YouTube Explanation</a></p>` +
  `</div>${extra}</div></article>`;

export const reasonCheck = (reason) => (error) => error.reason === reason;
export const reasonChecker = reasonCheck;

export async function writeCache(directory, files) {
  const cache = join(directory, '.cache/catalog');
  await mkdir(cache, { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(join(cache, name), content);
  return cache;
}

export function runImport(directory, env = {}) {
  return execFileSync(process.execPath, [importScript], {
    cwd: directory,
    env: {
      ...process.env,
      OFFLINE: '1',
      CHECK_SHEET: '',
      REFRESH: '',
      PASTE_LIMIT: '',
      YOUTUBE_API_KEY: '',
      ...env,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

export const catalogPath = (directory) =>
  join(directory, 'src/lib/data/catalog.json');

export const readCatalog = async (directory) =>
  JSON.parse(await readFile(catalogPath(directory), 'utf8'));

export const sheetSources = {
  'M-C.csv': sheetCsv([
    sheetRow('MC1', {
      pokemon: mcPokemon,
      items: mcItems,
      paste: 'https://pokepast.es/aaaaaaaaaaaaaaaa',
    }),
  ]),
  'M-B.csv': sheetCsv([
    sheetRow('MB1', {
      pokemon: mbPokemon,
      items: mbItems,
      paste: 'https://pokepast.es/bbbbbbbbbbbbbbbb',
    }),
  ]),
  'aaaaaaaaaaaaaaaa.json': pokePasteJson(
    pasteText(mcPokemon, mcItems),
    'Format: gen9vgcregulationmc'
  ),
  'bbbbbbbbbbbbbbbb.json': pokePasteJson(
    pasteText(mbPokemon, mbItems),
    'Format: gen9vgcregulationmb'
  ),
  'poch-leaderboard.html':
    '<script>self.__next_f.push([1,"a:{\\"entries\\":[],\\"x\\":[]}"])</script>',
};
export const apiKey = 'Sentinel_key-123';
export const publishedAt = '2026-03-14T12:30:45Z';
export function assertHeaderOnly(requests, expectedKey = apiKey) {
  assert.ok(requests.length > 0);
  for (const { url, options } of requests) {
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.searchParams.has('key'), false);
    assert.equal(url.searchParams.has('apiKey'), false);
    assert.equal(url.href.includes(expectedKey), false);
    assert.equal(
      new Headers(options.headers).get('x-goog-api-key'),
      expectedKey
    );
    assert.equal(options.redirect, 'error');
  }
}
export const channelInfo = Object.fromEntries(
  youtubeChannels.map((channel, index) => {
    const suffix = String.fromCharCode(97 + index).repeat(22);
    return [channel.handle, { id: `UC${suffix}`, uploads: `UU${suffix}` }];
  })
);
export const channelRecord = (
  handle,
  id = channelInfo[handle].id,
  uploads = channelInfo[handle].uploads
) => ({
  id,
  contentDetails: { relatedPlaylists: { uploads } },
});
const handleForPlaylist = Object.fromEntries(
  Object.entries(channelInfo).map(([handle, info]) => [info.uploads, handle])
);
export const playlistFor = (handle) => channelInfo[handle].uploads;
export const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const maybeResponse = (value) =>
  value instanceof Response ? value : json(value);

export function video(handle, id, options = {}) {
  const info = channelInfo[handle];
  return {
    snippet: {
      playlistId: options.playlistId || info.uploads,
      resourceId: {
        kind: 'youtube#video',
        videoId: id,
      },
      videoOwnerChannelId: options.ownerId || info.id,
      title: options.title ?? 'Video title',
      description: options.description ?? '',
      publishedAt: '2000-01-01T00:00:00Z',
    },
    contentDetails: {
      videoId: options.contentVideoId ?? id,
      videoPublishedAt: options.publishedAt ?? publishedAt,
    },
  };
}

export function api(t, { pages = {}, channels = {} } = {}) {
  const requests = [];
  const warnings = [];
  const cache = mkdtempSync(join(tmpdir(), 'atlas-youtube-'));
  t.after(() => rmSync(cache, { recursive: true, force: true }));
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  t.mock.method(globalThis, 'fetch', async (address, options) => {
    const url = new URL(address);
    requests.push({ url, options });
    if (url.pathname.endsWith('/channels')) {
      const handle = url.searchParams.get('forHandle');
      const configured = channels[handle];
      const fallback = { items: [channelRecord(handle)] };
      return typeof configured === 'function'
        ? configured(url, options)
        : maybeResponse(configured ?? fallback);
    }
    if (url.pathname.endsWith('/playlistItems')) {
      const handle = handleForPlaylist[url.searchParams.get('playlistId')];
      const token = url.searchParams.get('pageToken') || '';
      const configured = pages[handle]?.[token];
      const fallback = {
        items: [
          video(
            handle,
            handle === youtubeChannels[0].handle ? 'aaaaaaaaaaa' : 'bbbbbbbbbbb'
          ),
        ],
      };
      return typeof configured === 'function'
        ? configured(url, options)
        : maybeResponse(configured ?? fallback);
    }
    throw new Error(`Unexpected API path: ${url.pathname}`);
  });
  return {
    cache,
    load: (options = {}) => loadYoutubeSource({ cache, ...options }),
    requests,
    warnings,
  };
}

export function snapshotData() {
  const pasteUrl = 'https://pokepast.es/0123456789abcdef';
  return {
    version: 1,
    channels: youtubeChannels.map((channel, index) => ({
      ...channel,
      channelId: channelInfo[channel.handle].id,
      videosScanned: 1,
      videosWithoutPaste: index ? 1 : 0,
      candidates: index
        ? []
        : [
            {
              sourceName: channel.name,
              indexUrl: channel.url,
              pasteUrl,
              video: {
                id: 'aaaaaaaaaaa',
                title: 'Cached upload',
                description: pasteUrl,
                publishedAt,
              },
            },
          ],
    })),
  };
}

export const snapshotPath = (cache) => join(cache, 'youtube-sources.json');
export const seedSnapshot = (cache, data = snapshotData()) =>
  writeFile(snapshotPath(cache), JSON.stringify(data));
export function youtubeSnapshot(rows = []) {
  const videos = new Set(rows.map(({ video }) => video.id));
  return {
    version: 1,
    channels: youtubeChannels.map((channel, index) => {
      const candidates = index
        ? []
        : rows
            .slice()
            .sort(
              (left, right) =>
                (left.video.id < right.video.id
                  ? -1
                  : left.video.id > right.video.id
                    ? 1
                    : 0) ||
                (left.pasteUrl < right.pasteUrl
                  ? -1
                  : left.pasteUrl > right.pasteUrl
                    ? 1
                    : 0)
            )
            .map(({ pasteUrl, video }) => ({
              sourceName: channel.name,
              indexUrl: channel.url,
              pasteUrl,
              video,
            }));
      return {
        ...channel,
        channelId: channelInfo[channel.handle].id,
        videosScanned: index ? 1 : videos.size || 1,
        videosWithoutPaste: index || !videos.size ? 1 : 0,
        candidates,
      };
    }),
  };
}
export const youtubeRow = (pasteUrl, id, options = {}) => ({
  sourceName: youtubeChannels[0].name,
  indexUrl: youtubeChannels[0].url,
  pasteUrl,
  video: {
    id,
    title: options.title ?? 'Pokémon Champions VGC Regulation M-C',
    description:
      options.description ?? `${pasteUrl}\nFormat: gen9championsvgc2026regmc`,
    publishedAt: options.publishedAt ?? publishedAt,
  },
});
export const youtubePasteUrl = (id) => `https://pokepast.es/${id}`;
export const youtubeRawPaste = pasteText(
  ['Golurk', ...mcPokemon.slice(1)],
  mcItems
).replaceAll('\nLevel: 50', '');
export const youtubeChampionNotes = 'Format: gen9championsvgc2026regmc';
export const youtubePastePayload = (notes, extra = {}) => ({
  paste: youtubeRawPaste,
  notes,
  provider: 'pokepaste',
  ...extra,
});
export const youtubeTeamFromCandidate = (row, payload) =>
  teamFromIndex(
    youtubeCandidate(row, payload),
    {
      ...payload,
      publishedAt: payload.publishedAt || row.video.publishedAt.slice(0, 10),
    },
    new Map()
  );
export const rejectYoutubeCandidate = (reason, row, payload) =>
  assert.throws(
    () => youtubeCandidate(row, payload),
    (error) => error.reason === reason
  );
export const writeYoutubeImportFixture = (directory, rows, payloads = {}) =>
  writeCache(directory, {
    ...sheetSources,
    'victory-road.html': youtubeVictoryRoadHtml,
    'vr-AbC12345.json': JSON.stringify(youtubeVictoryRoadPayload),
    'devoncorp-m-a.html': devonCorpPage(),
    'youtube-sources.json': JSON.stringify(youtubeSnapshot(rows)),
    ...Object.fromEntries(
      Object.entries(payloads).map(([id, payload]) => [`${id}.json`, payload])
    ),
  });

export async function writeFetchMock(directory, config) {
  const configPath = join(directory, 'fetch-mock.json');
  const modulePath = join(directory, 'fetch-mock.mjs');
  const logPath = join(directory, 'fetch-mock-log.json');
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(
    modulePath,
    `import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(${JSON.stringify(configPath)}, 'utf8'));
const requests = [];
const reply = (value) => {
  const status = value?.__status ?? 200;
  const body = Object.hasOwn(value ?? {}, '__body') ? value.__body : value;
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};
globalThis.fetch = async (address) => {
  const url = new URL(address);
  requests.push(url.href);
  let value;
  if (url.pathname.endsWith('/channels')) {
    const channel = config.channels[url.searchParams.get('forHandle')];
    value = { items: [{ id: channel.id, contentDetails: { relatedPlaylists: { uploads: channel.uploads } } }] };
  } else if (url.pathname.endsWith('/playlistItems')) {
    const handle = Object.keys(config.channels).find((key) => config.channels[key].uploads === url.searchParams.get('playlistId'));
    const token = url.searchParams.get('pageToken') || '';
    value = config.pages?.[handle]?.[token] ?? { items: config.videos[handle] };
  } else if (url.hostname === 'docs.google.com') {
    value = config.sheets[url.searchParams.get('gid')];
  } else if (url.hostname === 'victoryroad.pro') {
    value = config.victoryRoad;
  } else if (url.hostname === 'vrpaste-backend.vercel.app') {
    const id = url.pathname.split('/').at(-1);
    value = config.vrPastes[id];
  } else if (url.hostname === 'devoncorp.press') {
    value = config.devonCorp;
  } else if (url.hostname === 'poch.ms') {
    value = config.poch;
  } else if (url.hostname === 'pokepast.es') {
    const id = url.pathname.split('/').at(-2);
    value = config.pastes[id];
  } else {
    value = { __status: 404, __body: { error: 'not found' } };
  }
  return reply(value);
};
process.on('exit', () => writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(requests)));
`
  );
  return {
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${modulePath}`]
      .filter(Boolean)
      .join(' '),
    MOCK_FETCH_LOG: logPath,
  };
}

export async function prepareYoutubeRefreshFixture(directory) {
  const championNotes = 'Format: gen9championsvgc2026regmc';
  const main = youtubeChannels[0].handle;
  const plus = youtubeChannels[1].handle;
  const sharedUrl = 'https://pokepast.es/aaaaaaaaaaaaaaaa';
  const mainVideo = video(main, 'aaaaaaaaaaa', {
    title: 'Pokémon Champions VGC Regulation M-C',
    description: `${sharedUrl}\nFormat: gen9championsvgc2026regmc`,
  });
  const priorRow = youtubeRow(sharedUrl, mainVideo.contentDetails.videoId, {
    title: mainVideo.snippet.title,
    description: mainVideo.snippet.description,
    publishedAt: mainVideo.contentDetails.videoPublishedAt,
  });
  const plusVideo = video(plus, 'bbbbbbbbbbb', {
    description: 'No paste link',
  });
  const config = {
    channels: channelInfo,
    videos: { [main]: [mainVideo], [plus]: [plusVideo] },
    sheets: {
      2001945654: sheetSources['M-C.csv'],
      1458357160: sheetSources['M-B.csv'],
    },
    victoryRoad: youtubeVictoryRoadHtml,
    vrPastes: { AbC12345: youtubeVictoryRoadPayload },
    devonCorp: devonCorpPage(),
    poch: sheetSources['poch-leaderboard.html'],
    pastes: {
      aaaaaaaaaaaaaaaa: pokePasteJson(
        pasteText(mcPokemon, mcItems),
        'Format: gen9vgcregulationmb'
      ),
      '0123456789abcdef': pokePasteJson(
        pasteText(mcPokemon, mcItems),
        championNotes
      ),
      '138b4ef886ba95e4': pokePasteJson(
        pasteText(mcPokemon, mcItems),
        championNotes
      ),
    },
  };
  const cache = await writeCache(directory, {
    ...sheetSources,
    'youtube-sources.json': JSON.stringify(youtubeSnapshot([priorRow])),
    'victory-road.html': youtubeVictoryRoadHtml,
    'devoncorp-m-a.html': config.devonCorp,
    'vr-AbC12345.json': JSON.stringify(youtubeVictoryRoadPayload),
    'aaaaaaaaaaaaaaaa.json': pokePasteJson(
      pasteText(mcPokemon, mcItems),
      championNotes
    ),
  });
  const mockEnv = await writeFetchMock(directory, config);
  return {
    main,
    plus,
    sharedUrl,
    mainVideo,
    plusVideo,
    config,
    cache,
    mockEnv,
  };
}

export const youtubeQuotaFailureConfig = (
  config,
  main,
  plus,
  mainVideo,
  plusVideo
) => ({
  ...config,
  pages: {
    [main]: {
      '': { items: [mainVideo], nextPageToken: 'main-next' },
      'main-next': { items: [] },
    },
    [plus]: {
      '': { items: [plusVideo], nextPageToken: 'plus-next' },
      'plus-next': {
        __status: 403,
        __body: { error: { errors: [{ reason: 'quotaExceeded' }] } },
      },
    },
  },
});

export function multiPageHistory(main, plus) {
  const repeated = video(main, 'aaaaaaaaaaa', {
    title: 'A title without Champions',
    description:
      'https://pokepast.es/0123456789abcdef/?from=video, (http://vrpastes.com/AbC12345/?from=video). https://pokepast.es/0123456789abcdef',
    publishedAt: '2024-01-01T00:00:00Z',
  });
  return {
    pages: {
      [main]: {
        '': { items: [repeated], nextPageToken: 'main-page-2' },
        'main-page-2': {
          items: [
            repeated,
            video(main, 'ccccccccccc', {
              title: 'Another unrelated title',
              description:
                'A late upload links https://pokepast.es/fedcba9876543210.',
            }),
          ],
        },
      },
      [plus]: {
        '': {
          items: [video(plus, 'bbbbbbbbbbb', { title: 'Unrelated upload' })],
          nextPageToken: 'plus-page-2',
        },
        'plus-page-2': {
          items: [
            video(plus, 'ddddddddddd', {
              title: 'No title-based filter',
              description: 'https://www.vrpastes.com/XyZ98765',
            }),
          ],
        },
      },
    },
  };
}

export const hostilePasteDescription = [
  'https://pokepast.es/0123456789abcdef.evil',
  'https://pokepast.es/0123456789abcdef/evil',
  'https://pokepast.es.evil/0123456789abcdef',
  'https://pokepast.es/../0123456789abcdef',
  'https://evil@pokepast.es/0123456789abcdef',
  'https://pokepast.es:443/0123456789abcdef',
  'ftp://pokepast.es/0123456789abcdef',
  'https://pokepast.es/0123456789abcdef',
].join(' ');

export const invalidSnapshotCases = [
  ['allowlist order', (data) => data.channels.reverse()],
  [
    'channel identity',
    (data) => (data.channels[0].url = 'https://example.test'),
  ],
  ['channel ID type', (data) => (data.channels[0].channelId = 123)],
  ['counters', (data) => (data.channels[0].videosScanned = 2)],
  [
    'video metadata',
    (data) => (data.channels[0].candidates[0].video.publishedAt = 'unknown'),
  ],
  [
    'supported link',
    (data) =>
      (data.channels[0].candidates[0].pasteUrl = 'https://example.test/team'),
  ],
  [
    'description link agreement',
    (data) =>
      (data.channels[0].candidates[0].video.description = 'No linked paste'),
  ],
];
