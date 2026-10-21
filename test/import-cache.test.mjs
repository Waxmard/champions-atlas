import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { fetchCached } from '../scripts/catalog-cache.mjs';
import { parseSheet, sheet } from '../scripts/import-catalog.mjs';
import { victoryRoadUrl, devonCorpUrl } from '../scripts/catalog-sources.mjs';
import { pochUrl } from '../scripts/poch-source.mjs';
import {
  resolveItemIcon,
  resolveSprite,
  syncItems,
  syncSprites,
  validatePng,
} from '../scripts/sync-assets.mjs';

const address = 'https://example.test/source.json';
const name = 'source.json';
const cached = '{ "cached": true }\n';
const fresh = '{"fresh":true}';
const codedError = (code) => Object.assign(new Error(code), { code });
const connectionError = () =>
  new TypeError('fetch failed', {
    cause: codedError('UND_ERR_CONNECT_TIMEOUT'),
  });

async function boundary(t, content = cached) {
  const cache = await mkdtemp(join(tmpdir(), 'atlas-cache-'));
  t.after(() => rm(cache, { recursive: true, force: true }));
  if (content !== null) await writeFile(join(cache, name), content);
  const requests = [];
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  const install = (fn) =>
    t.mock.method(globalThis, 'fetch', async (...args) => {
      requests.push(args);
      return fn(...args);
    });
  const load = (options = {}) =>
    fetchCached(name, address, {
      cache,
      validate: JSON.parse,
      refresh: true,
      allowStale: true,
      ...options,
    });
  return {
    cache,
    requests,
    warnings,
    install,
    load,
    bytes: () => readFile(join(cache, name), 'utf8'),
  };
}

for (const allowStale of [true, false]) {
  test(`cache boundary: forced connection timeout ${allowStale ? 'falls back' : 'stays strict'}`, async (t) => {
    const ctx = await boundary(t);
    const error = connectionError();
    ctx.install(() => {
      throw error;
    });
    if (allowStale) {
      assert.equal(await ctx.load(), cached);
      assert.deepEqual(
        ctx.warnings.filter((warning) => warning.startsWith('Using validated')),
        [
          `Using validated cached source ${name} (${address}) after refresh failure: UND_ERR_CONNECT_TIMEOUT`,
        ]
      );
    } else
      await assert.rejects(
        ctx.load({ allowStale }),
        (caught) => caught === error
      );
    assert.equal(ctx.requests.length, 3);
    assert.equal(await ctx.bytes(), cached);
  });
}

for (const status of [429, 503, 404, 200]) {
  test(`cache boundary: HTTP ${status}`, async (t) => {
    const ctx = await boundary(t);
    ctx.install(() => new Response(fresh, { status }));
    if (status === 404)
      await assert.rejects(ctx.load(), { message: `404 fetching ${address}` });
    else assert.equal(await ctx.load(), status === 200 ? fresh : cached);
    assert.equal(ctx.requests.length, status === 429 || status === 503 ? 3 : 1);
    assert.equal(
      ctx.warnings.filter((warning) => warning.startsWith('Using validated'))
        .length,
      status === 429 || status === 503 ? 1 : 0
    );
    assert.equal(await ctx.bytes(), status === 200 ? fresh : cached);
  });
}

test('cache boundary: interrupted body falls back without retrying', async (t) => {
  const ctx = await boundary(t);
  ctx.install(() => {
    const response = new Response(fresh);
    response.text = async () => {
      throw codedError('UND_ERR_SOCKET');
    };
    return response;
  });
  assert.equal(await ctx.load(), cached);
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.warnings.length, 1);
  assert.equal(await ctx.bytes(), cached);
});

for (const [label, content] of [
  ['malformed', '{'],
  ['oversized', ' '.repeat(5000001)],
]) {
  test(`cache boundary: fresh ${label} content is fatal`, async (t) => {
    const ctx = await boundary(t);
    ctx.install(() => new Response(content));
    await assert.rejects(ctx.load());
    assert.equal(ctx.requests.length, 1);
    assert.equal(ctx.warnings.length, 0);
    assert.equal(await ctx.bytes(), cached);
  });
}

for (const [label, content] of [
  ['missing', null],
  ['malformed', '{'],
  ['oversized', ' '.repeat(5000001)],
  ['unreadable', null],
]) {
  test(`cache boundary: ${label} fallback cache retains refresh cause`, async (t) => {
    const ctx = await boundary(t, content);
    if (label === 'unreadable') await mkdir(join(ctx.cache, name));
    const error = connectionError();
    ctx.install(() => {
      throw error;
    });
    await assert.rejects(ctx.load(), (caught) => {
      assert.equal(caught.cause, error);
      assert.match(
        caught.message,
        /^Cached source source\.json is unusable after failed refresh: /
      );
      return true;
    });
    assert.equal(
      ctx.warnings.filter((warning) => warning.startsWith('Using validated'))
        .length,
      0
    );
  });
}

for (const [label, error] of [
  ['generic TypeError', new TypeError('fetch failed')],
  ['generic Error', new Error('connect timeout')],
  ['manual abort', new DOMException('Cancelled', 'AbortError')],
  [
    'certificate',
    new TypeError('fetch failed', { cause: codedError('CERT_HAS_EXPIRED') }),
  ],
  [
    'bad URL',
    new TypeError('Invalid URL', { cause: codedError('ERR_INVALID_URL') }),
  ],
  [
    'redirect',
    new TypeError('fetch failed', { cause: new Error('unexpected redirect') }),
  ],
]) {
  test(`cache boundary: ${label} cannot use stale cache`, async (t) => {
    const ctx = await boundary(t);
    ctx.install(() => {
      throw error;
    });
    await assert.rejects(ctx.load(), (caught) => caught === error);
    assert.equal(await ctx.bytes(), cached);
    assert.equal(
      ctx.warnings.filter((warning) => warning.startsWith('Using validated'))
        .length,
      0
    );
  });
}

for (const code of [
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
]) {
  test(`cache boundary: recognized direct ${code} permits fallback`, async (t) => {
    const ctx = await boundary(t);
    ctx.install(() => {
      throw codedError(code);
    });
    assert.equal(await ctx.load(), cached);
    assert.equal(ctx.requests.length, 3);
  });
}

test('cache boundary: TimeoutError permits fallback', async (t) => {
  const ctx = await boundary(t);
  ctx.install(() => {
    throw new DOMException('Deadline exceeded', 'TimeoutError');
  });
  assert.equal(await ctx.load(), cached);
});

for (const [label, content, refresh] of [
  ['valid', cached, false],
  ['missing', null, false],
  ['forced refresh', cached, true],
  ['malformed', '{', false],
  ['oversized', ' '.repeat(5000001), false],
  ['unreadable', null, false],
]) {
  test(`cache boundary: offline ${label} never fetches`, async (t) => {
    const ctx = await boundary(t, content);
    if (label === 'unreadable') await mkdir(join(ctx.cache, name));
    ctx.install(() => {
      throw new Error('Unexpected network');
    });
    const result = ctx.load({
      offline: true,
      refresh,
      missingMessage: 'Missing cached sheet: M-C',
    });
    if (label === 'valid') assert.equal(await result, cached);
    else if (label === 'missing' || refresh)
      await assert.rejects(result, { message: 'Missing cached sheet: M-C' });
    else await assert.rejects(result);
    assert.equal(ctx.requests.length, 0);
    assert.equal(ctx.warnings.length, 0);
  });
}

for (const [label, content] of [
  ['missing', null],
  ['malformed', '{'],
  ['oversized', ' '.repeat(5000001)],
  ['unreadable', null],
]) {
  test(`cache boundary: online ${label} ordinary cache refetches`, async (t) => {
    const ctx = await boundary(t, content);
    if (label === 'unreadable') await mkdir(join(ctx.cache, name));
    ctx.install(() => new Response(fresh));
    if (label === 'unreadable')
      await assert.rejects(
        ctx.load({ refresh: false }),
        (error) => error.code === 'EISDIR'
      );
    else assert.equal(await ctx.load({ refresh: false }), fresh);
    assert.equal(ctx.requests.length, 1);
    assert.equal(ctx.warnings.length, 0);
  });
}

test('cache boundary: ordinary valid cache returns without fetching', async (t) => {
  const ctx = await boundary(t);
  ctx.install(() => {
    throw new Error('Unexpected network');
  });
  assert.equal(await ctx.load({ refresh: false }), cached);
  assert.equal(ctx.requests.length, 0);
});

test('cache boundary: valid fresh data cannot hide a cache write failure', async (t) => {
  const ctx = await boundary(t, null);
  await mkdir(join(ctx.cache, name));
  ctx.install(() => new Response(fresh));
  await assert.rejects(ctx.load(), (error) => error.code === 'EISDIR');
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.warnings.length, 0);
});

const importScript = fileURLToPath(
  new URL('../scripts/import-catalog.mjs', import.meta.url)
);
const sheetHeader =
  'Team ID|1|2|3|4|5|6|B|C|v1|v2|v3|Pokemon Text for Copypasta||||||Team Description|Full Name|Date Shared|Pokepaste|Replica Code\n(Click text for image)|Replica Status|Tournament / Event|Rank|Link to Source'.split(
    '|'
  );
const species = [
  'Gengar',
  'Snorlax',
  'Dragonite',
  'Pelipper',
  'Incineroar',
  'Basculegion',
];
const speciesIds = new Map([
  ['Gengar', 94],
  ['Snorlax', 143],
  ['Dragonite', 149],
  ['Pelipper', 279],
  ['Incineroar', 727],
  ['Basculegion', 902],
]);
const assetUrls = new Set([
  ...species.map(
    (pokemon) =>
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesIds.get(pokemon)}.png`
  ),
  'https://raw.githubusercontent.com/smogon/sprites/master/src/minisprites/items/ileftovers.png',
]);
function sheetCsv(regulation, description) {
  const row = Array(sheetHeader.length).fill('');
  row[0] = regulation === 'M-C' ? 'MC1' : 'MB1';
  species.forEach((pokemon, index) => {
    row[3 + index] = 'Leftovers';
    row[12 + index] = pokemon;
  });
  row[18] = description;
  row[19] = 'Owner';
  row[20] = '12 Sep 2026';
  row[21] = `https://pokepast.es/${regulation === 'M-C' ? 'aaaaaaaaaaaaaaaa' : 'bbbbbbbbbbbbbbbb'}`;
  row[23] = 'Open';
  return [sheetHeader, row]
    .map((fields) =>
      fields
        .map((value) =>
          /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        )
        .join(',')
    )
    .join('\n');
}
const victoryHtml =
  '<h1>Pokémon Champions — Replica Teams</h1><h2>Regulation Set (M-C)</h2><h3>Teams reaching finals of large tournaments</h3>' +
  '<table><thead><tr><th>Flag</th><th>Player</th><th>Best results</th><th>Team</th><th>Code</th><th>Paste</th><th>Rep.</th></tr></thead><tbody>' +
  '<tr><td></td><td><b>Fixture Player</b></td><td><b>Spring Cup<br>Champion</b></td><td><div>' +
  species
    .map((pokemon) => `<img title="${pokemon}" alt="${pokemon}" width="64px"/>`)
    .join('') +
  '</div></td><td>AB C 123</td><td><a href="https://pokepast.es/cccccccccccccccc"><img title="Export"/></a></td><td></td></tr></tbody></table>';
const devonHtml =
  '<h1>38 Teams to Try for Pokémon Champions Regulation M-A</h1><article><div class="blog-item-content e-content"><h3>CYBERTRON TEAM</h3><div class="sqs-html-content"><p>Teambuilder: <a href="https://x.com/CybertronVGC">https://x.com/CybertronVGC</a></p><p>Replica Code: NFVS4SYCW2</p><p>Pokepaste: <a href="https://pokepast.es/138b4ef886ba95e4">paste</a></p><p><a href="https://youtu.be/Du3AZ5dpIv4?t=67">Link to YouTube Explanation</a></p></div></div></article>';
const pochHtml =
  '<script>self.__next_f.push([1,"a:{\\"entries\\":[],\\"x\\":[]}"])</script>';
const sheetAddress = (gid) => `${sheet}/export?format=csv&gid=${gid}`;
const sourceAddresses = {
  'victory-road.html': victoryRoadUrl,
  'M-C.csv': sheetAddress('2001945654'),
};

async function importerFixture(
  t,
  failedName,
  allowStale,
  cacheState = 'valid'
) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cache = join(directory, '.cache/catalog');
  const output = join(directory, 'src/lib/data/catalog.json');
  await mkdir(cache, { recursive: true });
  await mkdir(join(directory, 'src/lib/data'), { recursive: true });
  const prior = JSON.stringify({
    teams: [
      {
        id: 'sentinel',
        regulation: 'M-A',
        pasteUrl: 'https://pokepast.es/eeeeeeeeeeeeeeee',
        members: [],
      },
    ],
  });
  await writeFile(output, prior);
  const files = {
    'M-C.csv': sheetCsv('M-C', 'Cached M-C'),
    'M-B.csv': sheetCsv('M-B', 'Cached M-B'),
    'victory-road.html': victoryHtml,
    'devoncorp-m-a.html': devonHtml,
    'poch-leaderboard.html': pochHtml,
    'pokemon.json': JSON.stringify({
      results: species.map((pokemon) => ({
        name: pokemon.toLowerCase().replaceAll(' ', '-'),
        url: `https://pokeapi.co/api/v2/pokemon/${speciesIds.get(pokemon)}/`,
      })),
    }),
  };
  for (const [filename, text] of Object.entries(files)) {
    if (filename === failedName && cacheState === 'missing') continue;
    await writeFile(
      join(cache, filename),
      filename === failedName && cacheState === 'corrupt'
        ? 'not a valid source'
        : text
    );
  }
  const responses = {
    [sheetAddress('2001945654')]: sheetCsv('M-C', 'Fresh M-C'),
    [sheetAddress('1458357160')]: sheetCsv('M-B', 'Fresh M-B'),
    [victoryRoadUrl]: victoryHtml,
    [devonCorpUrl]: devonHtml,
    [pochUrl]: pochHtml,
  };
  const bootstrap = `
    import { appendFileSync } from 'node:fs';
    import { pathToFileURL } from 'node:url';
    const responses = ${JSON.stringify(responses)};
    const assets = new Set(${JSON.stringify([...assetUrls])});
    globalThis.fetch = async (address, options) => {
      appendFileSync('requests.jsonl', JSON.stringify({address: String(address), redirect: options?.redirect}) + '\\n');
      if (address === ${JSON.stringify(sourceAddresses[failedName])}) {
        throw new TypeError('fetch failed', {cause: Object.assign(new Error('connect timeout'), {code: 'UND_ERR_CONNECT_TIMEOUT'})});
      }
      if (Object.hasOwn(responses, address)) return new Response(responses[address]);
      if (assets.has(String(address))) {
        return new Response(Uint8Array.from([137,80,78,71,13,10,26,10]), {headers: {'content-type': 'image/png'}});
      }
      throw new Error('Unexpected URL: ' + address);
    };
    process.argv[1] = ${JSON.stringify(importScript)};
    await import(pathToFileURL(process.argv[1]).href);
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', bootstrap],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 20000,
      env: {
        ...process.env,
        CHECK_SHEET: '1',
        OFFLINE: '',
        REFRESH: '',
        PASTE_LIMIT: '0',
        ALLOW_STALE_SOURCE_CACHE: allowStale ? '1' : '',
      },
    }
  );
  assert.ifError(result.error);
  const requests = (await readFile(join(directory, 'requests.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(
    requests.filter(
      (request) => request.address === sourceAddresses[failedName]
    ).length,
    3
  );
  assert.doesNotMatch(result.stderr, /Unexpected URL:/);
  return {
    ...result,
    requests,
    prior,
    bytes: await readFile(output, 'utf8'),
    cache,
  };
}

for (const failedName of ['victory-road.html', 'M-C.csv']) {
  test(`import refresh: ${failedName} valid cache fallback imports real sheet teams`, async (t) => {
    const result = await importerFixture(t, failedName, true);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      new RegExp(
        `Using validated cached source ${failedName.replaceAll('.', '\\.')} .*UND_ERR_CONNECT_TIMEOUT`
      )
    );
    const catalog = JSON.parse(result.bytes);
    assert.deepEqual(
      catalog.teams.map((team) => team.name),
      [failedName === 'M-C.csv' ? 'Cached M-C' : 'Fresh M-C']
    );
    assert.equal(
      catalog.teams.some((team) => team.id === 'sentinel'),
      false
    );
    assert.match(
      result.stdout,
      /Victory Road: 1 discovered — 0 accepted, 0 retained, 1 skipped, 0 merged\./
    );
    assert.match(
      result.stdout,
      /DevonCorp: 0 discovered — 0 accepted, 0 retained, 0 skipped, 0 merged\./
    );
    assert.match(result.stdout, /limited=1/);
    assert.ok(
      result.requests.some(
        (request) =>
          request.address === sheetAddress('2001945654') &&
          request.redirect === 'follow'
      )
    );
    assert.equal(
      result.requests.some(
        (request) => request.address === sheetAddress('1458357160')
      ),
      false
    );
    assert.ok(
      result.requests.some(
        (request) =>
          request.address === victoryRoadUrl && request.redirect === 'error'
      )
    );
    assert.equal(
      await readFile(join(result.cache, failedName), 'utf8'),
      failedName === 'M-C.csv' ? sheetCsv('M-C', 'Cached M-C') : victoryHtml
    );
  });
  for (const [label, allowStale, cacheState] of [
    ['strict', false, 'valid'],
    ['missing', true, 'missing'],
    ['corrupt', true, 'corrupt'],
  ]) {
    test(`import refresh: ${failedName} ${label} cache aborts without replacing catalog`, async (t) => {
      const result = await importerFixture(
        t,
        failedName,
        allowStale,
        cacheState
      );
      assert.notEqual(result.status, 0);
      assert.equal(result.bytes, result.prior);
      assert.match(result.stderr, /UND_ERR_CONNECT_TIMEOUT/);
      assert.doesNotMatch(result.stderr, /Using validated cached source/);
      if (allowStale)
        assert.match(result.stderr, /is unusable after failed refresh/);
    });
  }
}

test('cache boundary: sheet validator and fetch options preserve raw CSV', async (t) => {
  const text = sheetCsv('M-C', 'Cached M-C');
  const ctx = await boundary(t, text);
  ctx.install(() => {
    throw connectionError();
  });
  assert.equal(
    await ctx.load({
      validate: (csv) => parseSheet(csv, 'M-C'),
      fetchOptions: { redirect: 'follow' },
    }),
    text
  );
  assert.ok(ctx.requests.every(([, options]) => options.redirect === 'follow'));
});

test('sprite resolution uses numeric PokéAPI sprites and exact aliases', () => {
  const root =
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const ids = new Map([
    ['arcanine-hisui', 10229],
    ['floette-mega', 10296],
    ['indeedee-female', 10186],
    ['lucario', 448],
    ['lucario-mega', 10059],
    ['lucario-mega-z', 10310],
    ['meowstic-female', 10025],
    ['meowstic-female-mega', 10315],
    ['meowstic-male', 678],
    ['meowstic-male-mega', 10314],
    ['morpeko-full-belly', 877],
    ['gourgeist-average', 711],
    ['lycanroc-midday', 745],
    ['pyroar-male', 668],
    ['squawkabilly-green-plumage', 931],
    ['vivillon', 666],
  ]);
  const index = {
    results: [...ids].map(([name, id]) => ({
      name,
      url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
    })),
  };
  for (const [name, target] of [
    ['Lucario', 'lucario'],
    ['Arcanine-Hisui', 'arcanine-hisui'],
    ['Indeedee-F', 'indeedee-female'],
    ['Lucario-Mega', 'lucario-mega'],
    ['Lucario-Mega-Z', 'lucario-mega-z'],
    ['Floette-Mega', 'floette-mega'],
    ['Floette-Eternal-Mega', 'floette-mega'],
    ['Meowstic-F', 'meowstic-female'],
    ['Meowstic-F-Mega', 'meowstic-female-mega'],
    ['Meowstic-Mega', 'meowstic-male-mega'],
    ['Meowstic-M-Mega', 'meowstic-male-mega'],
    ['Meowstic-M', 'meowstic-male'],
    ['Pyroar', 'pyroar-male'],
    ['Squawkabilly', 'squawkabilly-green-plumage'],
    ['Morpeko', 'morpeko-full-belly'],
    ['Gourgeist', 'gourgeist-average'],
    ['Lycanroc', 'lycanroc-midday'],
  ])
    assert.equal(resolveSprite(name, index), `${root}/${ids.get(target)}.png`);
  const pokeball = `${root}/666-poke-ball.png`;
  assert.equal(resolveSprite('Vivillon-Pokeball', index), pokeball);
  assert.notEqual(pokeball, resolveSprite('Vivillon', index));
  assert.notEqual(pokeball, resolveSprite('Vivillon-Fancy', index));
  assert.equal(resolveSprite('Floette', index), `${root}/670.png`);
  assert.equal(
    resolveSprite('Sinistcha-Masterpiece', index),
    `${root}/1013-masterpiece.png`
  );
  assert.notEqual(
    resolveSprite('Meowstic-Mega', index),
    resolveSprite('Meowstic-F-Mega', index)
  );
  assert.equal(resolveSprite('Unknownmon', index), null);
});

test('sprite sync deduplicates names, retains cached PNGs, and never falls back', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-sprites-'));
  const sprites = join(directory, 'sprites');
  const output = join(directory, 'catalog.json');
  const root =
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const requests = [];
  const warnings = [];
  const teams = [
    {
      members: [
        { pokemon: 'Meowstic-M-Mega' },
        { pokemon: 'meowstic m mega' },
        { pokemon: 'Odd-Bird' },
        { pokemon: 'odd bird' },
        { pokemon: 'Lucario' },
        { pokemon: 'Vivillon-Pokeball' },
        { pokemon: 'vivillon pokeball' },
      ],
    },
  ];
  const catalog = { teams };
  const index = {
    results: [
      {
        name: 'meowstic-male-mega',
        url: 'https://pokeapi.co/api/v2/pokemon/10314/',
      },
      { name: 'meowstic-male', url: 'https://pokeapi.co/api/v2/pokemon/678/' },
      { name: 'lucario', url: 'https://pokeapi.co/api/v2/pokemon/448/' },
    ],
  };
  try {
    await mkdir(sprites, { recursive: true });
    await writeFile(join(sprites, 'lucario.png'), png);
    await writeFile(join(sprites, 'meowsticmmega.png'), Buffer.from('invalid'));
    await writeFile(output, JSON.stringify(catalog));
    const stats = await syncSprites(teams, index, {
      directory: sprites,
      load: async (address) => {
        requests.push(address);
        if (address.endsWith('/678.png')) return png;
        if (address.endsWith('/10314.png')) return Buffer.from('invalid');
        throw new Error('offline');
      },
      warn: (message) => warnings.push(message),
    });
    assert.deepEqual(stats, {
      wanted: 5,
      downloaded: 1,
      failed: 2,
      removed: 0,
    });
    assert.deepEqual(
      requests.sort(),
      [
        `${root}/10314.png`,
        `${root}/678.png`,
        `${root}/666-poke-ball.png`,
      ].sort()
    );
    assert.equal(
      warnings.filter(
        (message) => message === 'Sprite unavailable for Odd-Bird'
      ).length,
      1
    );
    assert.equal(
      warnings.filter((message) => message.includes('meowsticmmega.png'))
        .length,
      1
    );
    assert.equal(
      warnings.filter((message) => message.includes('vivillonpokeball.png'))
        .length,
      1
    );
    assert.deepEqual(await readdir(sprites), ['lucario.png', 'meowsticm.png']);
    assert.deepEqual(await readFile(join(sprites, 'lucario.png')), png);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), catalog);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('item icons resolve source aliases, preserve local names, and fail safely', async () => {
  const root =
    'https://raw.githubusercontent.com/smogon/sprites/master/src/minisprites/items';
  for (const [name, slug] of [
    ['Leftovers', 'leftovers'],
    ['Absolite Z', 'absolite_z'],
    ['Venosaurite', 'venusaurite'],
    ['Dragonitite', 'dragoninite'],
    ['Staraptorite', 'staraptite'],
  ])
    assert.equal(resolveItemIcon(name), `${root}/i${slug}.png`);
  assert.throws(() => validatePng(Buffer.from('not png')), /Invalid PNG/);

  const directory = await mkdtemp(join(tmpdir(), 'atlas-items-'));
  const items = join(directory, 'items');
  const output = join(directory, 'catalog.json');
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const warnings = [];
  const requests = [];
  const teams = [
    {
      members: [
        { item: 'Leftovers' },
        { item: 'Absolite Z' },
        { item: 'Venosaurite' },
        { item: 'VENOSAURITE!' },
        { item: 'Dragonitite' },
        { item: 'Staraptorite' },
        { item: null },
      ],
    },
  ];
  const catalog = { teams };
  try {
    await mkdir(items, { recursive: true });
    await writeFile(join(items, 'stale.png'), png);
    await writeFile(join(items, 'absolitez.png'), Buffer.from('broken'));
    await writeFile(output, JSON.stringify(catalog));
    const stats = await syncItems(teams, {
      directory: items,
      load: async (address) => {
        requests.push(address);
        if (
          address.endsWith('/ileftovers.png') ||
          address.endsWith('/idragoninite.png') ||
          address.endsWith('/istaraptite.png')
        )
          return png;
        if (address.endsWith('/ivenusaurite.png')) throw new Error('offline');
        return Buffer.from('not png');
      },
      warn: (message) => warnings.push(message),
    });
    assert.deepEqual(stats, {
      wanted: 5,
      downloaded: 3,
      failed: 2,
      removed: 1,
    });
    assert.equal(
      requests.filter((address) => address.endsWith('/ivenusaurite.png'))
        .length,
      1
    );
    assert.equal(
      warnings.filter((message) => message.includes('venosaurite.png')).length,
      1
    );
    assert.match(warnings.join('\n'), /absolitez\.png: Invalid PNG sprite/);
    assert.deepEqual(await readdir(items), [
      'dragonitite.png',
      'leftovers.png',
      'staraptorite.png',
    ]);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), catalog);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
