import assert from 'node:assert/strict';
import test from 'node:test';
import {
  descriptionOf,
  descriptionPastes,
  youtubeShareOptions,
} from '../src/lib/youtube-share.ts';

test('descriptionOf decodes the JSON-escaped description', () => {
  assert.equal(
    descriptionOf(
      'x,"shortDescription":"Paste: https://pokepast.es/a9a4a979872bf9ee\\nID: \\"A\\" \\u00e9","isCrawlable":true'
    ),
    'Paste: https://pokepast.es/a9a4a979872bf9ee\nID: "A" é'
  );
  assert.equal(descriptionOf('<html></html>'), null);
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
      {
        label: 'Rain',
        detail: 'pokepast.es/138b4ef886ba95e4',
        url: 'https://pokepast.es/138b4ef886ba95e4',
      },
      {
        label: 'Sun team',
        detail: 'pokepast.es/238b4ef886ba95e4',
        url: 'https://pokepast.es/238b4ef886ba95e4',
      },
    ]
  );
  assert.equal(
    descriptionPastes('https://pokepast.es/138b4ef886ba95e4')[0].label,
    'Poképaste'
  );
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
  const options = await youtubeShareOptions('rukTvl7e3nY', teams, () => {
    throw new Error('should not load');
  });
  assert.deepEqual(options, [
    { label: 'A', detail: 'Incineroar · Rillaboom', team: teams[0] },
    { label: 'B', detail: 'Incineroar · Rillaboom', team: teams[1] },
  ]);
});

test('youtubeShareOptions falls back to description links', async () => {
  assert.deepEqual(
    await youtubeShareOptions(
      'rukTvl7e3nY',
      [],
      async () => 'Team: https://pokepast.es/138b4ef886ba95e4'
    ),
    [
      {
        label: 'Team',
        detail: 'pokepast.es/138b4ef886ba95e4',
        url: 'https://pokepast.es/138b4ef886ba95e4',
      },
    ]
  );
  assert.deepEqual(
    await youtubeShareOptions('rukTvl7e3nY', [], async () => 'no links'),
    []
  );
});
