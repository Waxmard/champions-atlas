import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { teamFromIndex } from '../scripts/import-catalog.mjs';
import { ingestX } from '../scripts/import-x.mjs';
import {
  readXCandidates,
  xPastesIn,
  xRegulation,
  xRegulationFor,
} from '../scripts/x-source.mjs';

const pokepasteId = '56e2daaa8910ca4a';
const quietPokepasteId = '1111111111111111';
const otherGamePokepasteId = '2222222222222222';
const vrId = 'AbC12345';
const postId = '2085278291586425277';
const otherPostId = '1900000000000000001';
const thirdPostId = '1900000000000000002';
const postUrl = (handle, id = postId) => `https://x.com/${handle}/status/${id}`;

const species = [
  'Gholdengo',
  'Amoonguss',
  'Iron Hands',
  'Farigiraf',
  'Pelipper',
  'Basculegion',
];
const items = [
  'Choice Specs',
  'Rocky Helmet',
  'Assault Vest',
  'Safety Goggles',
  'Focus Sash',
  'Mystic Water',
];

const setBlock = (name, item) =>
  [
    `${name} @ ${item}`,
    'Ability: Test',
    'Level: 50',
    'EVs: 2 HP / 32 Atk',
    'Adamant Nature',
    '- Protect',
    '- Fake Out',
  ].join('\n');

const pasteText = species
  .map((name, index) => setBlock(name, items[index]))
  .join('\n\n');

const pokepastePayload = (
  notes = 'Format: gen9championsvgc2026regmb',
  title = 'Fixture team'
) => ({ author: 'Fixture', notes, paste: pasteText, title });

const vrPayload = {
  id: vrId,
  is_public: true,
  is_encrypted: false,
  format: 'VGC Regulation M-C',
  createdAt: 1789118018,
  notes: '',
  teams: species.map((name, index) => ({
    species: name,
    name,
    item: items[index],
    ability: 'Test',
    nature: 'Adamant',
    evs: { hp: 2, atk: 32 },
    moves: ['Protect', 'Fake Out'],
  })),
};

const photo = (id) => ({
  type: 'photo',
  id,
  url: `https://pbs.twimg.com/media/${id}.jpg?name=orig`,
  width: 1200,
  height: 800,
});

const statusPost = ({
  id = postId,
  handle = 'Trainer',
  name = 'Trainer Name',
  text = '',
  photos = [],
  verified = false,
} = {}) => ({
  type: 'status',
  url: postUrl(handle, id),
  id,
  text,
  created_timestamp: 1786004061,
  created_at: 'Thu Aug 06 08:14:21 +0000 2026',
  author: { screen_name: handle, name, verified },
  media: photos.length ? { photos, all: photos } : undefined,
});

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
  json: async () => body,
  headers: { get: () => 'application/json' },
});

const htmlResponse = () => ({
  ok: true,
  status: 200,
  text: async () => '<html>not json</html>',
  json: async () => {
    throw new SyntaxError('Unexpected token <');
  },
  headers: { get: () => 'text/html' },
});

const imageResponse = (bytes, type = 'image/jpeg') => ({
  ok: true,
  status: 200,
  text: async () => '',
  headers: { get: (name) => (name === 'content-type' ? type : null) },
  arrayBuffer: async () =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

const router = (entries) => {
  const calls = [];
  const fetchImpl = async (address) => {
    calls.push(address);
    for (const [pattern, body] of entries) {
      const matched =
        typeof pattern === 'string'
          ? pattern === address
          : pattern.test(address);
      if (!matched) continue;
      return typeof body === 'function' ? body(address) : body;
    }
    throw new Error(`Unexpected X fetch: ${address}`);
  };
  return { fetchImpl, calls };
};

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'x-source-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return {
    dir,
    cache: join(dir, 'cache'),
    catalogPath: join(dir, 'catalog.json'),
    outputPath: join(dir, 'team-posts.json'),
    imagesDir: join(dir, 'posts'),
  };
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const citingTeam = (id, creator, url) => ({
  id,
  creator,
  pasteUrl: `https://pokepast.es/${pokepasteId}`,
  reports: [{ event: '', rank: '', sourceUrl: url }],
});

test('search discovery stores a post with its paste and derived regulation', async (t) => {
  const space = await workspace(t);
  const text = `team https://pokepast.es/${pokepasteId}`;
  const post = statusPost({ text, photos: [photo('HPBk6YCWcAAvQHu')] });
  const { fetchImpl, calls } = router([
    [
      /\/2\/search\?q=/,
      jsonResponse({
        code: 200,
        results: [post],
        cursor: { bottom: null },
      }),
    ],
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 200, status: post }),
    ],
    [
      `https://pokepast.es/${pokepasteId}/json`,
      jsonResponse(pokepastePayload()),
    ],
    [/pbs\.twimg\.com/, () => imageResponse(Buffer.from([0x89, 0x50]))],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({ currentRegulation: 'M-C', teams: [] })
  );
  const options = {
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
  };

  await ingestX({ ...options, env: { CHECK_SHEET: '1' } });

  const index = await readJson(join(space.cache, 'x-posts.json'));
  assert.deepEqual(index.posts[postId].pastes, [
    {
      url: `https://pokepast.es/${pokepasteId}`,
      kind: 'pokepaste',
      regulation: 'M-B',
    },
  ]);
  assert.equal(index.posts[postId].handle, 'Trainer');
  const evidence = await readJson(space.outputPath);
  assert.equal(evidence.posts[postId].createdAt, '2026-08-06');
  assert.equal(evidence.posts[postId].media[0].local, `/posts/${postId}-1.jpg`);
  assert.equal(
    evidence.posts[postId].media[0].remote,
    'https://pbs.twimg.com/media/HPBk6YCWcAAvQHu.jpg?name=small'
  );
  assert.equal(
    (await readFile(join(space.imagesDir, `${postId}-1.jpg`))).length,
    2
  );
  assert.equal(calls.filter((call) => call.includes('/2/status/')).length, 1);

  const lookups = calls.length;
  await ingestX({ ...options, env: {} });
  assert.equal(calls.length, lookups);
});

test('a post that links no paste is skipped as missing_paste', async (t) => {
  const space = await workspace(t);
  const post = statusPost({ text: 'no paste in this one' });
  const { fetchImpl } = router([
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 200, status: post }),
    ],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [citingTeam('m-c-1', 'Trainer Name', postUrl('Trainer'))],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  const { candidates, skipped } = await readXCandidates(space.cache);
  assert.deepEqual(candidates, []);
  assert.deepEqual(skipped, [
    { sourceUrl: postUrl('Trainer'), pasteUrl: '', reason: 'missing_paste' },
  ]);
});

test('pastes whose format names another game or no game are unsupported_format', async (t) => {
  const space = await workspace(t);
  const other = statusPost({
    id: otherPostId,
    text: `wrong game https://pokepast.es/${otherGamePokepasteId}`,
  });
  const quiet = statusPost({
    id: thirdPostId,
    text: `no format line https://pokepast.es/${quietPokepasteId}`,
  });
  const { fetchImpl } = router([
    [
      new RegExp(`/2/status/${otherPostId}`),
      jsonResponse({ code: 200, status: other }),
    ],
    [
      new RegExp(`/2/status/${thirdPostId}`),
      jsonResponse({ code: 200, status: quiet }),
    ],
    [
      `https://pokepast.es/${otherGamePokepasteId}/json`,
      jsonResponse(pokepastePayload('Format: gen9ou')),
    ],
    [
      `https://pokepast.es/${quietPokepasteId}/json`,
      jsonResponse(pokepastePayload('')),
    ],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [
        citingTeam('m-c-1', 'Trainer Name', postUrl('Trainer', otherPostId)),
        citingTeam('m-c-2', 'Trainer Name', postUrl('Trainer', thirdPostId)),
      ],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  const index = await readJson(join(space.cache, 'x-posts.json'));
  assert.equal(index.posts[otherPostId].pastes[0].regulation, null);
  const { candidates, skipped } = await readXCandidates(space.cache);
  assert.deepEqual(candidates, []);
  assert.deepEqual(
    skipped.map((entry) => entry.reason),
    ['unsupported_format', 'unsupported_format']
  );
});

test('a vrpastes link without www is canonicalized', async (t) => {
  const space = await workspace(t);
  assert.deepEqual(xPastesIn(`see https://vrpastes.com/${vrId}`), [
    { url: `https://www.vrpastes.com/${vrId}`, kind: 'victory-road' },
  ]);
  const post = statusPost({ text: `vr team https://vrpastes.com/${vrId}` });
  const { fetchImpl, calls } = router([
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 200, status: post }),
    ],
    [/vrpaste-backend\.vercel\.app/, jsonResponse(vrPayload)],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [citingTeam('m-c-1', 'Trainer Name', postUrl('Trainer'))],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  assert.equal(
    calls.some(
      (call) =>
        call ===
        `https://vrpaste-backend.vercel.app/api/paste/${vrId}?lang=english`
    ),
    true
  );
  const index = await readJson(join(space.cache, 'x-posts.json'));
  assert.deepEqual(index.posts[postId].pastes, [
    {
      url: `https://www.vrpastes.com/${vrId}`,
      kind: 'victory-road',
      regulation: 'M-C',
    },
  ]);
  const { candidates } = await readXCandidates(space.cache);
  assert.equal(candidates[0].pasteUrl, `https://www.vrpastes.com/${vrId}`);
  assert.equal(candidates[0].regulation, 'M-C');
});

test('an unreadable or failing lookup becomes an unavailable post', async (t) => {
  const space = await workspace(t);
  const { fetchImpl } = router([
    [/\/2\/status\/1900/, htmlResponse()],
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 404, message: 'not found' }),
    ],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [
        citingTeam('m-c-1', 'Trainer Name', postUrl('Handle', otherPostId)),
        citingTeam('m-c-2', 'Trainer Name', postUrl('Trainer')),
      ],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  const evidence = await readJson(space.outputPath);
  for (const id of [otherPostId, postId]) {
    assert.equal(evidence.posts[id].state, 'unavailable');
    assert.equal(evidence.posts[id].text, '');
    assert.deepEqual(evidence.posts[id].media, []);
  }
  const { skipped } = await readXCandidates(space.cache);
  assert.equal(skipped.length, 2);
});

test('media is capped at two photos and only mirrored when small and an image', async (t) => {
  const space = await workspace(t);
  const threePhotos = statusPost({
    text: `team https://pokepast.es/${pokepasteId}`,
    photos: [photo('aaa'), photo('bbb'), photo('ccc')],
  });
  const heavy = statusPost({
    id: otherPostId,
    text: `heavy https://pokepast.es/${pokepasteId}`,
    photos: [{ ...photo('ddd'), altText: 'Team sheet' }],
  });
  const notImage = statusPost({
    id: thirdPostId,
    text: `odd https://pokepast.es/${pokepasteId}`,
    photos: [photo('eee')],
  });
  const { fetchImpl } = router([
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 200, status: threePhotos }),
    ],
    [
      new RegExp(`/2/status/${otherPostId}`),
      jsonResponse({ code: 200, status: heavy }),
    ],
    [
      new RegExp(`/2/status/${thirdPostId}`),
      jsonResponse({ code: 200, status: notImage }),
    ],
    [
      `https://pokepast.es/${pokepasteId}/json`,
      jsonResponse(pokepastePayload()),
    ],
    [/media\/aaa/, () => imageResponse(Buffer.from([0x89, 0x50]))],
    [/media\/ddd/, () => imageResponse(Buffer.alloc(500 * 1024))],
    [/media\/eee/, () => imageResponse(Buffer.alloc(8), 'text/html')],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [
        citingTeam('m-c-1', 'Trainer Name', postUrl('Trainer')),
        citingTeam('m-c-2', 'Trainer Name', postUrl('Trainer', otherPostId)),
        citingTeam('m-c-3', 'Trainer Name', postUrl('Trainer', thirdPostId)),
      ],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  const evidence = await readJson(space.outputPath);
  assert.equal(evidence.posts[postId].media.length, 2);
  assert.deepEqual(
    evidence.posts[postId].media.map((entry) => entry.remote),
    [
      'https://pbs.twimg.com/media/aaa.jpg?name=small',
      'https://pbs.twimg.com/media/bbb.jpg?name=small',
    ]
  );
  assert.equal(evidence.posts[postId].media[0].width, 1200);
  assert.equal(evidence.posts[postId].media[0].local, `/posts/${postId}-1.jpg`);
  assert.equal(evidence.posts[otherPostId].media[0].local, null);
  assert.equal(evidence.posts[otherPostId].media[0].alt, 'Team sheet');
  assert.equal(evidence.posts[thirdPostId].media[0].local, null);
});

test('creatorMismatch compares the citing creator with the post author', async (t) => {
  const space = await workspace(t);
  const post = statusPost({ text: `team https://pokepast.es/${pokepasteId}` });
  const matchPost = statusPost({
    id: otherPostId,
    text: `team https://pokepast.es/${pokepasteId}`,
  });
  const { fetchImpl } = router([
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 200, status: post }),
    ],
    [
      new RegExp(`/2/status/${otherPostId}`),
      jsonResponse({ code: 200, status: matchPost }),
    ],
    [
      `https://pokepast.es/${pokepasteId}/json`,
      jsonResponse(pokepastePayload()),
    ],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [
        citingTeam('m-c-1', 'Someone Else', postUrl('Trainer')),
        citingTeam('m-c-2', 'trainer!', postUrl('Trainer', otherPostId)),
      ],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  const evidence = await readJson(space.outputPath);
  assert.equal(evidence.posts[postId].creatorMismatch, true);
  assert.equal(evidence.posts[otherPostId].creatorMismatch, false);
});

test('readXCandidates feeds teamFromIndex and fails loudly on a corrupt index', async (t) => {
  const space = await workspace(t);
  await mkdir(space.cache, { recursive: true });
  await writeFile(
    join(space.cache, 'x-posts.json'),
    JSON.stringify({
      posts: {
        [postId]: {
          url: postUrl('Trainer'),
          handle: 'Trainer',
          name: 'Trainer Name',
          state: 'ok',
          text: `team https://pokepast.es/${pokepasteId}`,
          pastes: [
            {
              url: `https://pokepast.es/${pokepasteId}`,
              kind: 'pokepaste',
              regulation: 'M-B',
            },
          ],
        },
      },
    })
  );
  await writeFile(
    join(space.cache, `${pokepasteId}.json`),
    JSON.stringify(pokepastePayload())
  );

  const { candidates, skipped } = await readXCandidates(space.cache);
  assert.deepEqual(skipped, []);
  assert.equal(candidates[0].expectedSpecies, null);
  assert.equal(candidates[0].name, 'Fixture team');
  assert.equal(candidates[0].creator, 'Trainer Name');
  const payload = {
    paste: pasteText,
    notes: 'Format: gen9championsvgc2026regmb',
    publishedAt: '',
    provider: 'pokepaste',
  };
  const team = teamFromIndex(candidates[0], payload, new Map());
  assert.deepEqual(team.sheetIds, []);
  assert.equal(team.reports[0].sourceUrl, postUrl('Trainer'));
  assert.equal(team.regulation, 'M-B');
  assert.equal(team.pasteUrl, `https://pokepast.es/${pokepasteId}`);

  await writeFile(
    join(space.cache, `${quietPokepasteId}.json`),
    JSON.stringify(pokepastePayload('', 'Untitled 1'))
  );
  const index = await readJson(join(space.cache, 'x-posts.json'));
  index.posts[otherPostId] = {
    url: postUrl('Trainer', otherPostId),
    handle: 'Trainer',
    name: 'Trainer Name',
    state: 'ok',
    text: `team https://pokepast.es/${quietPokepasteId}`,
    pastes: [
      {
        url: `https://pokepast.es/${quietPokepasteId}`,
        kind: 'pokepaste',
        regulation: 'M-B',
      },
    ],
  };
  await writeFile(join(space.cache, 'x-posts.json'), JSON.stringify(index));
  const { candidates: withUntitled } = await readXCandidates(space.cache);
  assert.equal(withUntitled[1].name, 'Trainer Name — X post');

  const empty = join(space.dir, 'empty');
  await mkdir(empty, { recursive: true });
  assert.equal(await readXCandidates(empty), null);

  await writeFile(join(space.cache, 'x-posts.json'), 'not json');
  await assert.rejects(() => readXCandidates(space.cache), SyntaxError);
});

test('post text is clipped without splitting an emoji', async (t) => {
  const space = await workspace(t);
  const post = statusPost({
    text: `${'a'.repeat(199)}💫 tail https://pokepast.es/${pokepasteId}`,
  });
  const { fetchImpl } = router([
    [
      new RegExp(`/2/status/${postId}`),
      jsonResponse({ code: 200, status: post }),
    ],
    [
      `https://pokepast.es/${pokepasteId}/json`,
      jsonResponse(pokepastePayload()),
    ],
  ]);
  await writeFile(
    space.catalogPath,
    JSON.stringify({
      teams: [citingTeam('m-c-1', 'Trainer Name', postUrl('Trainer'))],
    })
  );

  await ingestX({
    fetchImpl,
    cacheDir: space.cache,
    catalogPath: space.catalogPath,
    outputPath: space.outputPath,
    imagesDir: space.imagesDir,
    env: {},
  });

  const evidence = await readJson(space.outputPath);
  assert.equal(evidence.posts[postId].text, 'a'.repeat(199));
  assert.deepEqual(evidence.posts[postId].pastes, [
    `https://pokepast.es/${pokepasteId}`,
  ]);
  const lone = Object.values(evidence.posts).filter((entry) =>
    /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(
      entry.text
    )
  );
  assert.deepEqual(lone, []);
});

test('xRegulation reads the labels the providers publish', () => {
  assert.equal(xRegulation('VGC Regulation M-C'), 'M-C');
  assert.equal(xRegulation('gen9championsvgc2026regmb'), 'M-B');
  assert.equal(xRegulation('gen9championsvgc2026regma'), 'M-A');
  assert.equal(xRegulation('gen9ou'), null);
  assert.equal(xRegulation(null), null);
  assert.equal(xRegulationFor('pokepaste', { notes: 'Format: gen9ou' }), null);
  assert.equal(
    xRegulationFor('pokepaste', {
      notes: 'Format: gen9championsvgc2026regmc',
    }),
    'M-C'
  );
  assert.equal(
    xRegulationFor('victory-road', {
      ...vrPayload,
      format: 'VGC Regulation M-B',
    }),
    'M-B'
  );
  assert.equal(
    xRegulationFor('victory-road', {
      ...vrPayload,
      format: 'gen9championsvgc2026regmb',
    }),
    null
  );
});
