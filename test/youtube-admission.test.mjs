import assert from 'node:assert/strict';
import test from 'node:test';
import {
  regulationFromVideoDate,
  youtubeCandidate,
  youtubeIndexData,
} from '../scripts/youtube-admission.mjs';
import {
  mcPokemon,
  publishedAt,
  rejectYoutubeCandidate as rejectReason,
  youtubeChampionNotes as championNotes,
  youtubePastePayload as pastePayload,
  youtubePasteUrl as pasteUrl,
  youtubeRawPaste as rawPaste,
  youtubeRow,
  youtubeTeamFromCandidate as asTeam,
} from './fixtures/catalog-import.mjs';
import { youtubeChannels } from '../scripts/youtube-source.mjs';

const championsDouble = (url, id, options = {}) =>
  youtubeRow(url, id, {
    title: 'Pokémon Champions VGC',
    description: url,
    ...options,
  });
const singlesPayload = pastePayload('', {
  paste: rawPaste.replaceAll('- Protect\n- Fake Out', '- Tackle\n- Rest'),
});
test('maps only the bounded UTC video-date windows', () => {
  for (const [date, regulation] of [
    ['2026-04-08T00:00:00Z', 'M-A'],
    ['2026-06-17T01:59:59.999Z', 'M-A'],
    ['2026-06-17T02:00:00Z', 'M-B'],
    ['2026-09-09T01:59:59.999Z', 'M-B'],
    ['2026-09-09T02:00:00Z', 'M-C'],
    ['2026-12-01T23:59:59.999Z', 'M-C'],
    ['2026-06-17T04:00:00+02:00', 'M-B'],
  ])
    assert.equal(regulationFromVideoDate(date), regulation, date);
  for (const date of ['2026-04-07T23:59:59.999Z', '2026-12-02T00:00:00Z'])
    assert.equal(regulationFromVideoDate(date), null, date);
  for (const date of [
    undefined,
    null,
    0,
    '',
    '2026-04-08',
    'not-a-date',
    '2026-02-30T00:00:00Z',
    '2026-04-08T24:00:00Z',
    '2026-04-08T23:60:00Z',
    '2026-04-08T23:59:60Z',
    '2026-04-08T00:00:00+24:00',
    '2026-04-08T00:00:00+00:60',
    '2026-04-08T00:00:00',
  ])
    assert.equal(regulationFromVideoDate(date), null, String(date));
});

test('uses calendar fallback only for contextual Champions doubles candidates', () => {
  const url = pasteUrl('aaaaaaaaaaaaaaaa');
  for (const [date, regulation] of [
    ['2026-05-01T12:00:00Z', 'M-A'],
    ['2026-07-01T12:00:00Z', 'M-B'],
    ['2026-10-01T12:00:00Z', 'M-C'],
  ]) {
    const row = championsDouble(url, 'aaaaaaaaaaa', {
      publishedAt: date,
    });
    const candidate = youtubeCandidate(row, pastePayload(''));
    assert.equal(candidate.regulation, regulation);
    assert.deepEqual(candidate.regulationInference, {
      method: 'video-date',
      publishedAt: date,
      sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    });
  }

  const swordsDance = youtubeCandidate(
    championsDouble(url, 'ggggggggggg', {
      title: 'Swords Dance Garchomp — Pokémon Champions VGC',
      publishedAt: '2026-05-01T12:00:00Z',
    }),
    pastePayload('')
  );
  assert.equal(swordsDance.regulation, 'M-A');
  const sourceTimestamp = '2026-08-01T12:30:00Z';
  const indexed = youtubeIndexData(
    championsDouble(url, 'bbbbbbbbbbb', { publishedAt: sourceTimestamp }),
    { ...pastePayload(''), publishedAt: '2020-01-01' }
  );
  assert.equal(indexed.candidate.regulation, 'M-B');
  assert.equal(
    indexed.candidate.regulationInference.publishedAt,
    sourceTimestamp
  );
  assert.equal(indexed.payload.publishedAt, '2020-01-01');
  rejectReason(
    'missing_regulation',
    championsDouble(url, 'ccccccccccc', {
      publishedAt: '2026-03-14T12:30:45Z',
    }),
    pastePayload('')
  );
  rejectReason(
    'missing_regulation',
    championsDouble(url, 'ddddddddddd', {
      publishedAt: 'not-a-date',
    }),
    pastePayload('')
  );
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'eeeeeeeeeee', {
      title: 'VGC team showcase',
      description: url,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    pastePayload('')
  );
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'fffffffffff', {
      title: 'Pokémon Champions showcase',
      description: url,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    singlesPayload
  );
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'hhhhhhhhhhh', {
      title: 'Pokémon Champions — Double-Edge Tauros team',
      description: url,
      publishedAt: '2026-05-01T12:00:00Z',
    }),
    singlesPayload
  );
  const blocks = rawPaste.split('\n\n');
  const singlesOverlapPayload = pastePayload('', {
    paste: [
      blocks[0],
      blocks[1].replace('- Protect\n- Fake Out', '- Parting Shot\n- Fake Out'),
      blocks[2].replace('- Protect\n- Fake Out', '- Pollen Puff\n- Rest'),
      ...blocks
        .slice(3)
        .map((block) =>
          block.replace('- Protect\n- Fake Out', '- Tackle\n- Rest')
        ),
    ].join('\n\n'),
  });
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'kkkkkkkkkkk', {
      title: 'Pokémon Champions showcase',
      description: url,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    singlesOverlapPayload
  );
  for (const hazardMove of [
    'Stealth Rock',
    'Sticky Web',
    'Mortal Spin',
    'Ceaseless Edge',
  ]) {
    const singleHazardPayload = pastePayload('', {
      paste: [
        blocks[0].replace(
          '- Protect\n- Fake Out',
          `- Protect\n- ${hazardMove}`
        ),
        blocks[1],
        blocks[2],
        ...blocks
          .slice(3)
          .map((block) =>
            block.replace('- Protect\n- Fake Out', '- Tackle\n- Rest')
          ),
      ].join('\n\n'),
    });
    const admittedHazard = youtubeCandidate(
      youtubeRow(url, 'lllllllllll', {
        title: 'Pokémon Champions showcase',
        description: url,
        publishedAt: '2026-07-01T12:00:00Z',
      }),
      singleHazardPayload
    );
    assert.equal(admittedHazard.regulation, 'M-B', hazardMove);
  }
  for (const secondHazard of ['Rapid Spin', 'Spikes']) {
    const twoHazardPayload = pastePayload('', {
      paste: [
        blocks[0].replace('- Protect\n- Fake Out', '- Protect\n- Stealth Rock'),
        blocks[1].replace(
          '- Protect\n- Fake Out',
          `- Protect\n- ${secondHazard}`
        ),
        ...blocks.slice(2),
      ].join('\n\n'),
    });
    rejectReason(
      'unsupported_format',
      youtubeRow(url, 'mmmmmmmmmmm', {
        title: 'Pokémon Champions showcase',
        description: url,
        publishedAt: '2026-07-01T12:00:00Z',
      }),
      twoHazardPayload
    );
  }
  const pasteEvidenced = youtubeCandidate(
    youtubeRow(url, 'fffffffffff', {
      title: 'Pokémon Champions showcase',
      description: url,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    pastePayload('')
  );
  assert.equal(pasteEvidenced.regulation, 'M-B');
  assert.deepEqual(pasteEvidenced.regulationInference, {
    method: 'video-date',
    publishedAt: '2026-07-01T12:00:00Z',
    sourceUrl: 'https://www.youtube.com/watch?v=fffffffffff',
  });
  for (const [id, pasteId, published, title, description, regulation] of [
    [
      '-Q4wXj9eas4',
      'abe1a9acd3a1dfd0',
      '2026-10-07T21:00:02Z',
      'This MEGA FALINKS + MEGA HOUNDOOM Team is too fun...',
      "It's a brand new season of Pokemon Champions\nTeam: https://pokepast.es/abe1a9acd3a1dfd0",
      'M-C',
    ],
    [
      '8sZjQzfVscE',
      '3e926c995da5a8e5',
      '2026-04-24T20:20:59Z',
      'I use the WORST Starter in Master Ball Rank…',
      'Today we try Mega Emboar on the Master Ball Rank in Pokemon Champions.\nhttps://pokepast.es/3e926c995da5a8e5',
      'M-A',
    ],
    [
      'FLFsVRPLWac',
      '2c92e63c0fd4a43c',
      '2026-09-11T17:30:33Z',
      'MEGA SALAMENCE just won a HUGE Tournament...',
      'Mega Salamence returns in Pokemon Champions and it already won a HUGE Tournament! WIth Aerilate Double-Edge and Hyper Voice + Tailwind Support\nhttps://pokepast.es/2c92e63c0fd4a43c',
      'M-C',
    ],
    [
      'WHzW0mEJucw',
      '48ba4fa43dc05417',
      '2026-10-19T20:30:19Z',
      'GOLURK Dominates Master Ball Rank!',
      'Today we are using a Life Orb Golurk Tailwind and Trick Room Team\n#PokemonChampions\nhttps://pokepast.es/48ba4fa43dc05417',
      'M-C',
    ],
  ]) {
    const admitted = youtubeCandidate(
      youtubeRow(pasteUrl(pasteId), id, {
        title,
        description,
        publishedAt: published,
      }),
      pastePayload('')
    );
    assert.equal(admitted.regulation, regulation, id);
    assert.equal(admitted.regulationInference?.publishedAt, published, id);
  }
  const doubleBattles = youtubeCandidate(
    youtubeRow(url, 'iiiiiiiiiii', {
      title: 'Pokémon Champions Double Battle team',
      description: url,
      publishedAt: '2026-05-01T12:00:00Z',
    }),
    pastePayload('')
  );
  assert.equal(doubleBattles.regulation, 'M-A');
});

test('keeps every supplied regulation authoritative and conflict-safe', () => {
  const url = pasteUrl('bbbbbbbbbbbbbbbb');
  const duringMc = '2026-09-10T12:00:00Z';
  const titleRegulation = youtubeCandidate(
    championsDouble(url, 'aaaaaaaaaaa', {
      title: 'Pokémon Champions VGC Regulation M-B',
      publishedAt: duringMc,
    }),
    pastePayload('')
  );
  assert.equal(titleRegulation.regulation, 'M-B');
  assert.equal(titleRegulation.regulationInference, undefined);
  const formatRegulation = youtubeCandidate(
    championsDouble(url, 'bbbbbbbbbbb', { publishedAt: duringMc }),
    pastePayload('Format: gen9championsvgc2026regmb')
  );
  assert.equal(formatRegulation.regulation, 'M-B');
  assert.equal(formatRegulation.regulationInference, undefined);
  for (const title of [
    'Pokémon Champions VGC Reg M - B',
    'Pokémon Champions VGC REGULATION SET M – B',
    'Pokémon Champions VGC Reg M B',
  ])
    assert.equal(
      youtubeCandidate(
        championsDouble(url, 'ccccccccccc', {
          title,
          publishedAt: duringMc,
        }),
        pastePayload('')
      ).regulation,
      'M-B'
    );
  rejectReason(
    'format_conflict',
    championsDouble(url, 'ddddddddddd', {
      title: 'Pokémon Champions VGC Reg M-A',
      description: `${url}\nRegulation Set M-B`,
      publishedAt: '2026-05-01T12:00:00Z',
    }),
    pastePayload('')
  );
  rejectReason(
    'format_conflict',
    championsDouble(url, 'eeeeeeeeeee', {
      title: 'Pokémon Champions VGC Regulation M-C',
      publishedAt: duringMc,
    }),
    pastePayload('Format: gen9championsvgc2026regmb')
  );
  for (const [index, token] of [
    'Reg M-D',
    'Regulation M-F',
    'Regulation Set M-Q',
  ].entries()) {
    assert.throws(
      () =>
        youtubeCandidate(
          championsDouble(url, `eeeeeeeeee${index}`, {
            title: `Pokémon Champions VGC ${token}`,
            publishedAt: '2026-07-01T12:00:00Z',
          }),
          pastePayload('')
        ),
      (error) =>
        error.reason === 'unsupported_format' && error.message.includes('M-')
    );
  }
});

test('rejects unsupported declarations before calendar fallback', () => {
  const url = pasteUrl('cccccccccccccccc');
  const row = championsDouble(url, 'aaaaaaaaaaa', {
    publishedAt: '2026-07-01T12:00:00Z',
  });
  for (const format of [
    'gen9championsouregmc',
    'gen9championssinglesregmc',
    'gen9championsnationaldexvgcregmc',
    'gen8vgcregulationmc',
    'Scarlet and Violet VGC Regulation M-C',
    'Pokémon Sword and Shield VGC Regulation M-C',
    'Sword and Shield VGC Regulation M-C',
    'SV VGC Regulation M-C',
    'gen9ou',
    'gen9championsvgc2026regmd',
    'gen9prechampionsvgc',
  ])
    rejectReason('unsupported_format', row, pastePayload(`Format: ${format}`));
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'bbbbbbbbbbb', {
      title: 'Pokémon Champions VGC',
      description: `${url}\nFormat: gen9championsouregmc`,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    pastePayload(championNotes)
  );
  rejectReason('unsupported_format', row, {
    ...pastePayload(''),
    provider: 'victory-road',
    format: 'gen8vgcregulationmc',
  });
  rejectReason('unsupported_format', row, {
    ...pastePayload(''),
    provider: 'victory-road',
    format: 'unresolved provider format',
  });
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'ccccccccccc', {
      title: 'Pokémon Champions VGC Singles',
      description: url,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    pastePayload('')
  );
  rejectReason(
    'unsupported_format',
    youtubeRow(url, 'jjjjjjjjjjj', {
      title: 'Pokémon Champions VGC — Format: gen9ou',
      description: url,
      publishedAt: '2026-07-01T12:00:00Z',
    }),
    pastePayload('')
  );
  assert.throws(
    () =>
      youtubeCandidate(
        youtubeRow(url, 'ddddddddddd', {
          title: 'Pokémon Scarlet and Violet VGC',
          description: url,
          publishedAt: '2026-07-01T12:00:00Z',
        }),
        pastePayload('')
      ),
    (error) => {
      assert.equal(error.reason, 'unsupported_format');
      assert.match(error.message, /scarlet-violet/);
      assert.doesNotMatch(error.message, /Pokémon Scarlet/);
      return true;
    }
  );
  const withDescriptionBoilerplate = youtubeCandidate(
    championsDouble(url, 'fffffffffff', {
      description: `${url}\nEarlier I played Scarlet and Violet.`,
    }),
    pastePayload(championNotes)
  );
  assert.equal(withDescriptionBoilerplate.regulation, 'M-C');
  assert.throws(
    () =>
      youtubeCandidate(
        youtubeRow(url, 'ggggggggggg', {
          title: 'Pokémon Champions VGC',
          description: `${url}\nFormat: gen9ou\nPRIVATE DESCRIPTION`,
          publishedAt: '2026-07-01T12:00:00Z',
        }),
        pastePayload('')
      ),
    (error) => {
      assert.equal(error.reason, 'unsupported_format');
      assert.match(error.message, /gen9ou/);
      assert.doesNotMatch(error.message, /PRIVATE DESCRIPTION/);
      return true;
    }
  );
});

test('keeps rejected cached pre-Champions and unrelated uploads outside fallback', () => {
  const examples = [
    {
      paste: pasteUrl('060b8837ab9194c9'),
      id: '0EMRPjv11L0',
      title: 'I tried Iron Jugulis in Pokemon Scarlet and Violet VGC',
      publishedAt: '2022-11-24T21:00:01Z',
      notes: 'Format: gen9ou',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('5f432863c66b8e9d'),
      id: '1g563GQZmNE',
      title: 'National Dex team showcase',
      publishedAt: '2022-11-15T21:00:02Z',
      notes: 'Format: gen8nationaldex',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('79855b330509fae1'),
      id: '-491zvjNzAA',
      title: "Z-CELEBRATE GLACEON'S TRIUMPHANT RETURN!",
      description: `${pasteUrl('79855b330509fae1')}\nUltra Sun/Moon OU team`,
      publishedAt: '2019-10-22T20:30:01Z',
      notes: '',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('902f0870e6b65711'),
      id: 'NgnKt46TIjs',
      title: 'Pokémon Champions VGC pre-release open sheet',
      description: `${pasteUrl('902f0870e6b65711')}\nFormat: gen9prechampionsvgc`,
      publishedAt: '2026-04-03T18:31:20Z',
      notes: 'Format: gen9prechampionsvgc',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('98cf92767702d1c4'),
      id: 'C21-fttQ4sI',
      title: 'MEGA FROSLASS Dominates Masterball Rank!',
      description: `${pasteUrl('98cf92767702d1c4')}\n#PokemonChampions`,
      publishedAt: '2026-04-12T23:00:12Z',
      notes: 'Format: gen9championsou',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('85ef4f3e985c9123'),
      id: 'R99NbuPg1FQ',
      title: "I can't believe they Unbanned URSHIFU. Let's Try it",
      description: `Pokemon Champions National Dex is here on a side server!\n${pasteUrl('85ef4f3e985c9123')}`,
      publishedAt: '2026-05-16T21:30:04Z',
      notes: 'Format: gen9natdexchampionsou',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('2faffc186ddff1db'),
      id: '_DNQZZz0meU',
      title: "Turns out it's not complex to unban Terapagos...",
      description: `This team with Mega Froslass and Terapagos managed to peak Rank 1 on the Pokemon Champions National Dex OU Server!\nServer: https://play.champsnatdex.dynv6.net/\nThe Team: ${pasteUrl('2faffc186ddff1db')}\n#PokemonChampions`,
      publishedAt: '2026-05-12T21:00:26Z',
      notes: '',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('9706f410525066da'),
      id: 'yW88PAjwwDw',
      title: 'They Unbanned GALARIAN DARMANITAN! So I had to use it...',
      description: `Pokemon Champions National Dex is here on a side server so of course I had to try it out!\nServer: https://play.champsnatdex.dynv6.net/\nTeam: ${pasteUrl('9706f410525066da')}\n#PokemonChampions`,
      publishedAt: '2026-05-10T21:30:08Z',
      notes: '',
      reason: 'unsupported_format',
    },
    {
      paste: pasteUrl('0123456789abcdef'),
      id: '7LLHJfylhCY',
      title: 'What if Pokemon Was Scary? [Pokemon Ghost Grey Nuzlocke]',
      description: `${pasteUrl('0123456789abcdef')}\n#pokemonchampions #vgc`,
      publishedAt: '2026-10-15T18:00:00Z',
      notes: '',
      reason: 'unsupported_format',
    },
  ];
  for (const [index, example] of examples.entries())
    rejectReason(
      example.reason,
      youtubeRow(example.paste, `abcde${index}fghij`, {
        title: example.title,
        description: example.description ?? example.paste,
        publishedAt: example.publishedAt,
      }),
      pastePayload(example.notes)
    );
});

test('keeps source-backed set construction and explicit-format metadata intact', () => {
  const url = pasteUrl('aaaaaaaaaaaaaaaa');
  const row = youtubeRow(url, 'aaaaaaaaaaa', {
    title: 'Pokeaim Master Ball Rank — Pokémon Champions VGC',
    description: `${url}\nPresenter: Pokeaim`,
  });
  const payload = pastePayload(championNotes, { title: '  Golurk Tailroom  ' });
  const candidate = youtubeCandidate(row, payload);
  const team = asTeam(row, payload);
  assert.equal(candidate.regulation, 'M-C');
  assert.equal(candidate.regulationInference, undefined);
  assert.equal(candidate.expectedSpecies, null);
  assert.equal(candidate.replicaCode, null);
  assert.equal(candidate.creator, '');
  assert.equal(team.name, 'Golurk Tailroom');
  assert.equal(team.publishedAt, publishedAt.slice(0, 10));
  assert.equal(team.paste, rawPaste);
  assert.equal(team.members.map(({ set }) => set).join('\n\n'), rawPaste);
  assert.deepEqual(
    team.reports.map(({ event, rank, sourceUrl }) => [event, rank, sourceUrl]),
    [
      ['pokeaimMD collection', '', youtubeChannels[0].url],
      ['pokeaimMD video', '', 'https://www.youtube.com/watch?v=aaaaaaaaaaa'],
    ]
  );
  for (const line of ['Team by: Alice', 'Team by Alice'])
    assert.equal(
      youtubeCandidate(
        youtubeRow(url, 'bbbbbbbbbbb', { description: `${url}\n${line}` }),
        pastePayload(championNotes)
      ).creator,
      'Alice'
    );
  const fallbackRow = youtubeRow(url, 'ccccccccccc', {
    title: 'Video fallback',
    description: url,
  });
  for (const title of [undefined, null, 7, '   '])
    assert.equal(
      youtubeCandidate(fallbackRow, pastePayload(championNotes, { title }))
        .name,
      'Video fallback'
    );
  const vrUrl = 'https://www.vrpastes.com/AbC12345';
  const vrCandidate = youtubeCandidate(
    youtubeRow(vrUrl, 'ddddddddddd', {
      title: 'VR video fallback',
      description: `${vrUrl}\nFormat: Pokémon Champions VGC Regulation M-C`,
    }),
    { paste: rawPaste, provider: 'victory-road', format: 'VGC Regulation M-C' }
  );
  assert.equal(vrCandidate.name, 'VR video fallback');
  const sparseTeam = asTeam(
    youtubeRow(url, 'eeeeeeeeeee', {
      title: 'Champions VGC',
      description: url,
    }),
    {
      paste: ['Golurk', ...mcPokemon.slice(1)].join('\n\n'),
      notes: championNotes,
    }
  );
  assert.deepEqual(
    [
      sparseTeam.members[0].item,
      sparseTeam.members[0].ability,
      sparseTeam.members[0].moves,
      sparseTeam.members[0].nature,
      sparseTeam.members[0].spread,
    ],
    [null, null, [], null, null]
  );
});
