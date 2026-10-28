import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPokepasteUrl, loadPokepaste } from '../src/lib/pokepaste.ts';
import { newCustomTeam } from '../src/lib/workbench.ts';

const url = 'https://pokepast.es/138b4ef886ba95e4';
const blocks = [
  `Charizard @ Charizardite Y
Ability: Solar Power
Level: 50
Tera Type: Fire
EVs: 4 HP / 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Heat Wave
- Solar Beam
- Weather Ball
- Protect`,
  `Venusaur @ Focus Sash
Ability: Chlorophyll
Level: 50
Tera Type: Grass
EVs: 4 HP / 252 SpA / 4 SpD / 252 Spe
Modest Nature
IVs: 0 Atk
- Leaf Storm
- Sludge Bomb
- Sleep Powder
- Protect`,
  `Garchomp @ Choice Scarf
Ability: Rough Skin
Level: 50
Tera Type: Dragon
EVs: 4 HP / 252 Atk / 4 Def / 252 Spe
Adamant Nature
- Earthquake
- Bulldoze
- Dragon Claw
- Rock Slide`,
  `Rotom-Wash @ Leftovers
Ability: Levitate
Level: 50
Tera Type: Electric
EVs: 252 HP / 84 Def / 124 SpA / 52 Spe
Bold Nature
IVs: 0 Atk
- Will-O-Wisp
- Thunderbolt
- Hydro Pump
- Protect`,
  `Sneasler @ White Herb
Ability: Unburden
Level: 50
Tera Type: Fighting
EVs: 252 Atk / 4 Def / 4 SpD / 252 Spe
Jolly Nature
- Fake Out
- Close Combat
- Rock Tomb
- Dire Claw`,
  `Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
Tera Type: Fire
EVs: 252 HP / 252 Atk / 8 Spe
Adamant Nature
- Fake Out
- Flare Blitz
- Parting Shot
- Darkest Lariat`,
];
const paste = `${blocks
  .map((block) => block.replace(/\n/g, '  \r\n'))
  .join('  \r\n\r\n')}  \r\n\r\n`;
const jsonResponse = (value) => async () => Response.json(value);
const response = (body, contentType = 'application/json') =>
  new Response(body, { headers: { 'content-type': contentType } });

test('canonical Poképaste links reject other authorities, protocols and paths', async () => {
  for (const input of [
    url,
    ' 138B4EF886BA95E4 ',
    'pokepast.es/138B4EF886BA95E4/?from=safari#team',
    'HTTP://POKEPAST.ES/138B4EF886BA95E4/?from=safari#team',
    '  HTTP://POKEPAST.ES/138B4EF886BA95E4/?source=one#team  ',
    'https://pokepast.es/138b4ef886ba95e4?other=https://example.com/#x',
  ]) {
    assert.equal(canonicalPokepasteUrl(input), url);
  }
  for (const input of [
    '',
    '/138b4ef886ba95e4',
    '#138b4ef886ba95e4',
    'Check https://pokepast.es/138b4ef886ba95e4',
    'ftp://pokepast.es/138b4ef886ba95e4',
    'file://pokepast.es/138b4ef886ba95e4',
    'javascript:alert(1)',
    'https://www.pokepast.es/138b4ef886ba95e4',
    'https://pokepast.es.evil.test/138b4ef886ba95e4',
    'https://pokepast.es./138b4ef886ba95e4',
    'https://user@pokepast.es/138b4ef886ba95e4',
    'https://user:password@pokepast.es/138b4ef886ba95e4',
    'https://@pokepast.es/138b4ef886ba95e4',
    'https://pokepast.es:443/138b4ef886ba95e4',
    'http://pokepast.es:80/138b4ef886ba95e4',
    'https://pokepast.es:8080/138b4ef886ba95e4',
    'https://pokepast.es:/138b4ef886ba95e4',
    'https://pokepast.es/138b4ef886ba95e',
    'https://pokepast.es/138b4ef886ba95e44',
    'https://pokepast.es/138b4ef886ba95eg',
    'https://pokepast.es//138b4ef886ba95e4',
    'https://pokepast.es/138b4ef886ba95e4/json',
    'https://pokepast.es/138b4ef886ba95e4//',
    'https://pokepast.es/other/../138b4ef886ba95e4',
    'https://pokepast.es\\138b4ef886ba95e4',
    'https://pokepast.es/138b4ef886ba95e4\\',
    'https://pokepast.es/%31%33%38b4ef886ba95e4',
  ]) {
    assert.throws(() => canonicalPokepasteUrl(input), {
      message: 'Enter a Poképaste link or 16-character paste ID.',
    });
  }
  let called = false;
  await assert.rejects(
    loadPokepaste('https://pokepast.es.evil.test/138b4ef886ba95e4', () => {
      called = true;
      throw new Error('unexpected fetch');
    }),
    { message: 'Enter a Poképaste link or 16-character paste ID.' }
  );
  assert.equal(called, false);
});

test('real Poképaste payload retains raw text and uses existing EV normalization', async () => {
  const title = "CybertronVGC's Charizard Y team";
  const payload = await loadPokepaste(
    'http://POKEPAST.ES/138B4EF886BA95E4/?from=share#team',
    jsonResponse({
      title: `  ${title}  `,
      paste,
      author: 'unverified author',
      notes: '<script>untrusted notes</script>',
      rentalCode: 'ignored',
    })
  );
  assert.deepEqual(payload, { url, title, paste });

  const team = newCustomTeam(payload.title, 'M-A', payload.paste);
  assert.deepEqual(
    team.members.map((member) => member.pokemon),
    [
      'Charizard',
      'Venusaur',
      'Garchomp',
      'Rotom-Wash',
      'Sneasler',
      'Incineroar',
    ]
  );
  assert.equal(team.members[0].spread, '1 HP / 32 SpA / 1 SpD / 32 Spe');
  assert.equal(team.members[3].spread, '32 HP / 11 Def / 16 SpA / 7 Spe');
  assert.equal(team.members[5].spread, '32 HP / 32 Atk / 1 Spe');
  assert.equal(
    team.members[0].set,
    [
      'Charizard @ Charizardite Y',
      'Ability: Solar Power',
      'EVs: 1 HP / 32 SpA / 1 SpD / 32 Spe',
      'Timid Nature',
      '- Heat Wave',
      '- Solar Beam',
      '- Weather Ball',
      '- Protect',
    ].join('\n')
  );
  assert.doesNotMatch(team.original.paste, /^(?:Level|Tera Type|IVs):/m);

  const withRawLines = paste
    .replace('Charizard @', 'Blaze (Charizard) @')
    .replace('Timid Nature  \r\n', 'Timid Nature  \r\nShiny: Yes  \r\n');
  const rawPayload = await loadPokepaste(
    url,
    jsonResponse({ paste: withRawLines })
  );
  const rawTeam = newCustomTeam(rawPayload.title, 'M-A', rawPayload.paste);
  assert.match(
    rawTeam.original.paste,
    /^Blaze \(Charizard\) @ Charizardite Y/m
  );
  assert.match(rawTeam.original.paste, /^Shiny: Yes$/m);
});

test('titles are trimmed, capped, and fall back to the canonical ID', async () => {
  for (const title of [undefined, null, 3, [], '  \t  ']) {
    const loaded = await loadPokepaste(url, jsonResponse({ title, paste }));
    assert.equal(loaded.title, 'Poképaste 138b4ef886ba95e4');
  }
  for (const [title, expected] of [
    ['  Named team  ', 'Named team'],
    ['x'.repeat(201), 'x'.repeat(200)],
    [`${'x'.repeat(199)} y`, 'x'.repeat(199)],
    [`${'x'.repeat(199)}\u{1D11E}`, 'x'.repeat(199)],
    [`${'x'.repeat(198)}\u{1D11E}`, `${'x'.repeat(198)}\u{1D11E}`],
  ]) {
    const loaded = await loadPokepaste(url, jsonResponse({ title, paste }));
    assert.equal(loaded.title, expected);
  }
});

test('rejects HTTP failures, redirects, non-JSON responses and network errors', async () => {
  for (const status of [302, 404, 500]) {
    await assert.rejects(
      loadPokepaste(url, async () => new Response(null, { status })),
      new RegExp(`HTTP ${status}`)
    );
  }
  for (const contentType of ['text/html', 'application/jsonp', '']) {
    await assert.rejects(
      loadPokepaste(url, async () =>
        response(JSON.stringify({ paste }), contentType)
      ),
      /non-JSON/
    );
  }
  const loaded = await loadPokepaste(url, async () =>
    response(
      JSON.stringify({ paste }),
      'application/vnd.pokepaste+json; charset=utf-8'
    )
  );
  assert.equal(loaded.paste, paste);

  const error = new TypeError('Network unavailable');
  await assert.rejects(
    loadPokepaste(url, async () => {
      throw error;
    }),
    (caught) => caught === error
  );
});

test('rejects malformed JSON, invalid UTF-8 and non-object or missing paste data', async () => {
  for (const body of ['{"paste":', new Uint8Array([0xff]), null]) {
    await assert.rejects(
      loadPokepaste(url, async () => response(body)),
      /invalid JSON/
    );
  }
  for (const value of [
    null,
    [],
    {},
    { paste: null },
    { paste: 4 },
    { paste: [] },
  ]) {
    await assert.rejects(
      loadPokepaste(url, jsonResponse(value)),
      /invalid paste/
    );
  }
});

test('caps bytes while streaming and cancels before decoding oversized responses', async () => {
  const limit = 256 * 1024;
  const overhead = Buffer.byteLength(JSON.stringify({ paste, title: '' }));
  const atLimit = JSON.stringify({
    paste,
    title: 'a'.repeat(limit - overhead),
  });
  assert.equal(Buffer.byteLength(atLimit), limit);
  const loaded = await loadPokepaste(url, async () => response(atLimit));
  assert.equal(loaded.title, 'a'.repeat(200));

  let cancelled = false;
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(atLimit));
      controller.enqueue(Uint8Array.of(0x20));
      controller.enqueue(Uint8Array.of(0xff));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    loadPokepaste(url, async () => response(oversized)),
    /exceeds 256 KiB/
  );
  assert.equal(cancelled, true);

  const multibyte = JSON.stringify({ paste, title: 'é'.repeat(131_072) });
  await assert.rejects(
    loadPokepaste(url, async () => response(multibyte)),
    /exceeds 256 KiB/
  );
});

test('accepts at most 50,000 paste characters and validates six complete unique sets', async () => {
  const atLimit = paste + ' '.repeat(50_000 - paste.length);
  assert.equal(
    (await loadPokepaste(url, jsonResponse({ paste: atLimit }))).paste,
    atLimit
  );
  await assert.rejects(
    loadPokepaste(url, jsonResponse({ paste: `${atLimit} ` })),
    /exceeds 50,000 characters/
  );

  const text = blocks.join('\n\n');
  for (const [invalid, error] of [
    ['', /Invalid paste payload/],
    [blocks.slice(0, 5).join('\n\n'), /six sets/],
    [text.replace('Venusaur @', 'Charizard @'), /duplicate Pokémon/],
    [text.replace(' @ Charizardite Y', ''), /missing an item/],
    [text.replace('Ability: Solar Power\n', ''), /missing an ability/],
    [text.replace('Timid Nature\n', ''), /missing a nature/],
    [
      text.replace('EVs: 4 HP / 252 SpA / 4 SpD / 252 Spe\n', ''),
      /missing EVs/,
    ],
    [text.replace('- Weather Ball\n', ''), /exactly four moves/],
    [text.replace('- Weather Ball', '- Heat Wave'), /duplicate moves/],
    [
      text.replace('- Weather Ball', '- Weather Ball\n- Draco Meteor'),
      /more than four moves/,
    ],
  ]) {
    await assert.rejects(
      loadPokepaste(url, jsonResponse({ paste: invalid })),
      error
    );
  }
});

test('surfaces an aborted fetch without attempting to parse a response', async () => {
  const controller = new AbortController();
  const pending = loadPokepaste(
    url,
    async (resource, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
    controller.signal
  );
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
