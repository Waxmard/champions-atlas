import assert from 'node:assert/strict';
import test from 'node:test';
import {
  descriptionPastes,
  videoOf,
  youtubeShareOptions,
} from '../src/lib/youtube-share.ts';

const blocks = [
  `Charizard @ Charizardite Y
Ability: Solar Power
Level: 50
EVs: 4 HP / 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Heat Wave
- Solar Beam
- Weather Ball
- Protect`,
  `Venusaur @ Focus Sash
Ability: Chlorophyll
Level: 50
EVs: 4 HP / 252 SpA / 4 SpD / 252 Spe
Modest Nature
- Leaf Storm
- Sludge Bomb
- Sleep Powder
- Protect`,
  `Garchomp @ Choice Scarf
Ability: Rough Skin
Level: 50
EVs: 4 HP / 252 Atk / 4 Def / 252 Spe
Adamant Nature
- Earthquake
- Bulldoze
- Dragon Claw
- Rock Slide`,
  `Rotom-Wash @ Leftovers
Ability: Levitate
Level: 50
EVs: 252 HP / 84 Def / 124 SpA / 52 Spe
Bold Nature
- Will-O-Wisp
- Thunderbolt
- Hydro Pump
- Protect`,
  `Sneasler @ White Herb
Ability: Unburden
Level: 50
EVs: 252 Atk / 4 Def / 4 SpD / 252 Spe
Jolly Nature
- Fake Out
- Close Combat
- Rock Tomb
- Dire Claw`,
  `Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
EVs: 252 HP / 252 Atk / 8 Spe
Adamant Nature
- Fake Out
- Flare Blitz
- Parting Shot
- Darkest Lariat`,
];
const paste = blocks.join('\n\n');
const species =
  'Charizard · Venusaur · Garchomp · Rotom-Wash · Sneasler · Incineroar';
const payload = (url, title) => ({ url, title, paste });
const noLoad = () => {
  throw new Error('should not load');
};

test('videoOf decodes the JSON-escaped title and description', () => {
  assert.deepEqual(
    videoOf(
      '{"videoDetails":{"videoId":"rukTvl7e3nY","title":"Sun \\"HO\\" \\u00e9","lengthSeconds":"1","shortDescription":"A\\nB","isCrawlable":true}'
    ),
    { title: 'Sun "HO" é', description: 'A\nB' }
  );
  assert.deepEqual(videoOf('x"shortDescription":"A"'), {
    title: '',
    description: 'A',
  });
  assert.equal(videoOf('<html></html>'), null);
});

test('descriptionPastes keeps unique Poképaste links with their labels', () => {
  assert.deepEqual(
    descriptionPastes(
      [
        'Rain: https://pokepast.es/138B4EF886BA95E4',
        '- Sun team → pokepast.es/238b4ef886ba95e4 !',
        'https://evil.com/pokepast.es/338b4ef886ba95e4',
        'https://pokepast.es/138b4ef886ba95e4',
      ].join('\n')
    ),
    [
      { url: 'https://pokepast.es/138b4ef886ba95e4', label: 'Rain' },
      { url: 'https://pokepast.es/238b4ef886ba95e4', label: 'Sun team' },
    ]
  );
  assert.deepEqual(descriptionPastes('https://pokepast.es/138b4ef886ba95e4'), [
    { url: 'https://pokepast.es/138b4ef886ba95e4', label: '' },
  ]);
});

const team = (name, sourceUrl) => ({
  name,
  members: [{ pokemon: 'Incineroar' }, { pokemon: 'Rillaboom' }],
  reports: [{ sourceUrl }],
});

test('youtubeShareOptions prefers catalog teams linked to the video', async () => {
  const teams = [
    team('A', 'https://youtu.be/rukTvl7e3nY'),
    team('B', 'https://www.youtube.com/live/rukTvl7e3nY'),
    team('C', 'https://www.youtube.com/watch?v=AAAAAAAAAAA'),
  ];
  const options = await youtubeShareOptions(
    'rukTvl7e3nY',
    teams,
    noLoad,
    noLoad
  );
  assert.deepEqual(options, [
    { label: 'A', detail: 'Incineroar · Rillaboom', team: teams[0] },
    { label: 'B', detail: 'Incineroar · Rillaboom', team: teams[1] },
  ]);
});

test('youtubeShareOptions names a single description paste after the video', async () => {
  const url = 'https://pokepast.es/138b4ef886ba95e4';
  const options = (title) =>
    youtubeShareOptions(
      'rukTvl7e3nY',
      [],
      async () => ({ title, description: `Team: ${url}` }),
      async () => payload(url, 'Paste name')
    );
  assert.deepEqual(await options('My video'), [
    {
      label: 'My video',
      detail: species,
      payload: payload(url, 'My video'),
    },
  ]);
  assert.equal((await options(''))[0].label, 'Paste name');
});

test('youtubeShareOptions labels several pastes and marks failures', async () => {
  const description = [
    'Rain: https://pokepast.es/138b4ef886ba95e4',
    'https://pokepast.es/238b4ef886ba95e4',
    'Bad: https://pokepast.es/338b4ef886ba95e4',
  ].join('\n');
  const options = (failure) =>
    youtubeShareOptions(
      'rukTvl7e3nY',
      [],
      async () => ({ title: 'My video', description }),
      async (url) => {
        if (url.endsWith('338b4ef886ba95e4')) throw failure;
        return payload(url, 'Paste name');
      }
    );
  const loaded = await options(new Error('Garchomp is missing an item'));
  assert.deepEqual(
    loaded.map((option) => option.label),
    ['My video: Rain', 'My video: Paste name', 'Bad']
  );
  assert.equal(loaded[1].payload.title, 'My video: Paste name');
  assert.deepEqual(loaded[2], {
    label: 'Bad',
    detail: 'Garchomp is missing an item',
    error: true,
  });
  assert.equal(
    (await options(new TypeError('Load failed')))[2].detail,
    'Could not load this Poképaste.'
  );
});

test('youtubeShareOptions reuses the one catalog team using a description paste', async () => {
  const url = 'https://pokepast.es/138b4ef886ba95e4';
  const known = { ...team('Known', ''), reports: [], pasteUrl: url };
  assert.deepEqual(
    await youtubeShareOptions(
      'rukTvl7e3nY',
      [known],
      async () => ({ title: 'My video', description: url }),
      noLoad
    ),
    [{ label: 'Known', detail: 'Incineroar · Rillaboom', team: known }]
  );
});

test('youtubeShareOptions returns nothing for a description without pastes', async () => {
  assert.deepEqual(
    await youtubeShareOptions(
      'rukTvl7e3nY',
      [],
      async () => ({ title: 'My video', description: 'no links' }),
      noLoad
    ),
    []
  );
});
