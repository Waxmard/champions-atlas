import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePoch, pochUrl } from '../scripts/poch-source.mjs';
import { reportsWithLadderNotes } from '../scripts/catalog-results.mjs';
import {
  bestEvidence,
  compareTeams,
  evidence,
  evidenceGrade,
  isCustomRulesTeam,
} from '../src/lib/catalog.ts';
import { buildBenchmarkIndex } from '../src/lib/benchmark-index.ts';
import {
  catalogSuggestions,
  catalogSpreadSuggestions,
  ownSpreadSuggestions,
  pokemonSuggestions,
  readSavedTeams,
  saveTeam,
  storageKey,
  swapSuggestions,
} from '../src/lib/workbench.ts';

const roster = [
  'Raichu',
  'Espathra',
  'Archaludon',
  'Politoed',
  'Charizard',
  'Venusaur',
];
const member = (pokemon) => ({
  pokemon,
  item: null,
  ability: null,
  moves: [],
  nature: null,
  spread: null,
});
const report = (event, rank, entrants) => ({
  event,
  rank,
  sourceUrl: '',
  ...(entrants === undefined ? {} : { entrants }),
});
const ladderTeam = (
  id,
  rank,
  regulation = 'M-C',
  publishedAt = '2026-01-01'
) => ({
  id,
  regulation,
  publishedAt,
  reports: [{ event: 'Champions ranked battles', rank, sourceUrl: '' }],
});
const tournamentTeam = (
  id,
  report_,
  regulation = 'M-C',
  publishedAt = '2026-01-01'
) => ({ id, regulation, publishedAt, reports: [report_] });
const tournament = {
  id: '6ab431f2e905c1db68748c9c-1',
  player: 'player',
  event: 'Mudkip’s Marsh Pit #6',
  date: '2026-10-05T00:00:00.000Z',
  format: 'M-C',
  rule: 'double',
  players: 40,
  placement: 1,
  country: 'US',
  team: roster.map((name) => ({ en: name, name })),
};
const social = {
  id: '2106083996589555887',
  handle: 'player',
  displayName: 'Player',
  date: '2026-10-05T00:00:00.000Z',
  postUrl: 'https://x.com/player/status/2106083996589555887',
  rule: 'double',
  rank: 4,
  tier: null,
  tierRank: null,
  rating: null,
  event: null,
  place: 0,
  wins: 0,
  losses: 0,
  teamName: null,
  code: null,
  mons: roster.map((name) => ({ name })),
};
const flightPage = (entries) => {
  const body = JSON.stringify([
    '$',
    'section',
    null,
    {
      children: {
        props: {
          entries,
          x: [social],
          ladderSeasons: [{ season: 3, teams: [social] }],
        },
      },
    },
  ]);
  const chunk =
    ':HL["ignored.css","style"]\n0:I["ignored-module"]\nfa3:' + body + '\n';
  return (
    '<html><body><script>self.__next_f.push([0,null])</script><script>self.__next_f.push([1,' +
    JSON.stringify(chunk) +
    '])</script></body></html>'
  );
};
const tournamentResult = (row) => parsePoch(flightPage([row]));
class MemoryStorage {
  value = null;
  getItem(key) {
    return key === storageKey ? this.value : null;
  }
  setItem(key, value) {
    if (key === storageKey) this.value = value;
  }
}
const saved = (report_) => ({
  id: 'saved',
  name: 'Saved',
  origin: 'catalog',
  changeSlot: null,
  sources: [],
  original: {
    id: 'catalog',
    name: 'Published',
    regulation: 'M-C',
    pasteUrl: '',
    members: roster.map(member),
    paste: null,
    reports: report_ ? [report_] : [],
    sheetIds: [],
    creator: '',
    publishedAt: '',
    replicaCode: null,
    replicaStatus: '',
    pasteNotes: null,
  },
  members: roster.map(member),
});

test('Poch tournament entrants are validated and custom identity stays narrow', () => {
  const valid = tournamentResult(tournament);
  const team = valid.teams.find(
    (candidate) => candidate.id === 'poch-tournament-' + tournament.id
  );
  assert.equal(team.reports[0].entrants, 40);
  assert.equal(isCustomRulesTeam(team), true);
  assert.equal(
    isCustomRulesTeam({
      id: 'poch-tournament-6ab431f2e905c1db68748c9c-60',
      reports: [],
    }),
    true
  );
  assert.equal(
    isCustomRulesTeam({
      reports: [{ event: "Mudkip's Marsh Pit #6", rank: '', sourceUrl: '' }],
    }),
    true
  );
  assert.equal(
    isCustomRulesTeam({
      reports: [{ event: 'Mudkip’s Marsh Pit #60', rank: '', sourceUrl: '' }],
    }),
    false
  );
  assert.equal(
    isCustomRulesTeam({
      reports: [{ event: 'Mudkip’s Marsh Pit #5', rank: '', sourceUrl: '' }],
    }),
    false
  );
  assert.equal(
    isCustomRulesTeam({
      reports: [{ event: 'Marsh Pit #6 Open', rank: '', sourceUrl: '' }],
    }),
    false
  );

  for (const players of [undefined, null, 0]) {
    const row = { ...tournament, players };
    if (players === undefined) delete row.players;
    const parsed = tournamentResult(row);
    const published = parsed.teams.find(
      (candidate) => candidate.id === 'poch-tournament-' + row.id
    );
    assert.ok(published);
    assert.equal(Object.hasOwn(published.reports[0], 'entrants'), false);
  }
  for (const players of ['0', -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '40']) {
    const result = tournamentResult({ ...tournament, players });
    assert.equal(
      result.skipped.find((row) => row.source === 'entries').reason,
      'invalid_position'
    );
  }
  const tooManyPlaced = tournamentResult({ ...tournament, placement: 41 });
  assert.equal(
    tooManyPlaced.skipped.find((row) => row.source === 'entries').reason,
    'invalid_position'
  );
  assert.equal(team.reports[0].sourceUrl, pochUrl);
});

test('saved report entrant metadata remains optional, retained, and protected from corruption', () => {
  const storage = new MemoryStorage();
  const withEntrants = saved({
    event: 'Event',
    rank: '1st',
    sourceUrl: pochUrl,
    entrants: 40,
  });
  saveTeam(storage, withEntrants);
  assert.equal(readSavedTeams(storage)[0].original.reports[0].entrants, 40);
  const edited = structuredClone(withEntrants);
  edited.name = 'Edited';
  edited.original.reports = [
    { event: 'Changed', rank: '2nd', sourceUrl: pochUrl },
  ];
  saveTeam(storage, edited);
  assert.equal(readSavedTeams(storage)[0].original.reports[0].entrants, 40);

  const legacy = saved({ event: 'Legacy', rank: '1st', sourceUrl: pochUrl });
  storage.value = JSON.stringify([legacy]);
  assert.equal(
    Object.hasOwn(readSavedTeams(storage)[0].original.reports[0], 'entrants'),
    false
  );
  for (const entrants of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const corrupt = structuredClone(legacy);
    corrupt.original.reports[0].entrants = entrants;
    storage.value = JSON.stringify([corrupt]);
    const unchanged = storage.value;
    assert.throws(
      () => readSavedTeams(storage),
      /Existing data has been left untouched/
    );
    assert.throws(
      () =>
        saveTeam(
          storage,
          saved({ event: 'Bad', rank: '1st', sourceUrl: pochUrl, entrants })
        ),
      /Existing data has been left untouched/
    );
    assert.equal(storage.value, unchanged);
  }
});

test('Master Ball ladder annotations retain source and reject prose', () => {
  const url = 'https://pokepast.es/0000000000000000';
  const notes = [
    'Achieved Master Ball 1',
    'Reached Master Ball Rank 2',
    'Achieved Master Ball Rank 3',
    'Reached Master Ball 4',
    'Reached Master Ball',
    'Reached Master Ball Rank 5',
    'Reached Rank 3',
    'My Master Ball Rank 1 team',
    'Rank 99',
  ].join('\n');
  const reports = reportsWithLadderNotes([], notes, url);
  assert.deepEqual(
    reports.map(({ rank }) => rank),
    [
      'Master Ball Rank 1',
      'Master Ball Rank 2',
      'Master Ball Rank 3',
      'Master Ball Rank 4',
      'Master Ball',
    ]
  );
  assert.ok(
    reports.every(
      (entry) =>
        entry.event === 'Champions ranked battles' && entry.sourceUrl === url
    )
  );
  const originals = structuredClone(reports);
  assert.equal(
    reportsWithLadderNotes(reports, notes, url).length,
    reports.length
  );
  assert.deepEqual(reports, originals);
});

test('achievement bands are observable through grades and platform', () => {
  const grade = (event, rank, entrants, regulation = 'M-C', current = 'M-C') =>
    evidenceGrade(
      evidence(report(event, rank, entrants), regulation, current).level
    );
  assert.equal(grade('Worlds 2026', '9th'), 'strong');
  assert.equal(grade('Worlds 2026', 'Top cut'), 'strong');
  assert.equal(grade('Worlds 2026', '33rd'), 'reported');
  assert.equal(grade('Baltimore Regional 2027', '8th'), 'strong');
  assert.equal(grade('Baltimore Regional 2027', '9th'), 'reported');
  assert.equal(grade('Baltimore Regional Challenge', 'Champion'), 'reported');
  assert.equal(grade('Frankfurt Regional Championships', 'Top cut'), 'strong');
  assert.equal(grade('Event', '8th', 32), 'strong');
  assert.equal(grade('Event', '9th', 32), 'reported');
  assert.equal(grade('Event', '8th', 8), 'reported');
  assert.equal(grade('Event', 'Champion'), 'reported');
  assert.equal(grade('Champions ranked battles', 'Master Ball 1'), 'strong');
  assert.equal(
    grade('Champions ranked battles', 'Masterball Rank 1'),
    'strong'
  );
  assert.equal(grade('Champions ranked battles', 'Master Ball 2'), 'strong');
  assert.equal(
    grade('Champions ranked battles', 'Master Ball Rank 3'),
    'qualified'
  );
  assert.equal(grade('Champions ranked battles', 'Master Ball 4'), 'qualified');
  assert.equal(grade('Champions ranked battles', 'Master Ball'), 'qualified');
  assert.equal(
    grade('Champions ranked battles', 'Master Ball', undefined, 'M-B'),
    'reported'
  );
  assert.equal(grade('Champions ranked battles', 'Rank 3'), 'reported');
  assert.equal(grade('Champions ranked battles', 'Rank1'), 'reported');
  assert.equal(
    grade('Champions ranked battles', 'Master Ball Rank1'),
    'reported'
  );
  assert.equal(grade('Ladder', 'Champion Tier'), 'strong');
  assert.equal(grade('Ladder', 'Champion'), 'strong');
  assert.equal(grade('Showdown Ladder', 'Reported #1'), 'strong');
  assert.equal(grade('Showdown Ladder (Bo3)', 'Peak #1'), 'strong');
  assert.equal(grade('Champions ranked battles', 'Reported #0'), 'reported');
  assert.equal(
    grade('Champions ranked battles', 'Reported #9007199254740993'),
    'reported'
  );
  assert.equal(grade('', '1st'), 'none');
  assert.equal(grade('Event', ''), 'none');

  assert.equal(
    evidence(report('Champions ranked battles', 'Master Ball 1'), 'M-C', 'M-C')
      .platform,
    'Champions ladder'
  );
  assert.equal(
    evidence(report('Showdown Ladder', 'Reported #1'), 'M-C', 'M-C').platform,
    'Showdown'
  );
  const top = evidence(report('Worlds 2026', 'Top 16'), 'M-C', 'M-C');
  assert.equal(top.platform, 'Tournament');
  assert.equal(top.label, 'Top 16');
  assert.equal(evidence(report(), 'M-C', 'M-C').platform, 'Unknown');
});

test('major, community, and ladder merit boundaries order lexicographically', () => {
  assert.ok(
    compareTeams(
      tournamentTeam('worlds', report('Worlds 2026', '9th')),
      tournamentTeam('regional', report('Baltimore Regional 2027', '8th')),
      'M-C'
    ) < 0
  );
  assert.ok(
    compareTeams(
      tournamentTeam('numbered', report('Worlds 2026', '9th', 100)),
      tournamentTeam('topcut', report('Worlds 2026', 'Top cut', 200)),
      'M-C'
    ) < 0
  );
  assert.ok(
    compareTeams(
      tournamentTeam('deeper', report('Worlds 2026', '9th', 100)),
      tournamentTeam('shallower', report('Worlds 2026', '9th', 50)),
      'M-C'
    ) < 0
  );
  const mb2 = ladderTeam('mb2', 'Master Ball 2');
  const champions101 = ladderTeam('c101', 'Reported #101');
  const showdown1 = {
    id: 's1',
    regulation: 'M-C',
    publishedAt: '2026-01-01',
    reports: [{ event: 'Showdown Ladder', rank: 'Reported #1', sourceUrl: '' }],
  };
  assert.ok(compareTeams(mb2, champions101, 'M-C') < 0);
  assert.ok(compareTeams(champions101, showdown1, 'M-C') < 0);
  assert.ok(
    compareTeams(
      tournamentTeam('c100', {
        event: 'Ladder',
        rank: 'Reported #100',
        sourceUrl: '',
      }),
      ladderTeam('c101b', 'Reported #101'),
      'M-C'
    ) < 0
  );
  assert.ok(
    compareTeams(
      tournamentTeam('ratio', report('Event', '4th', 32)),
      tournamentTeam('worse-ratio', report('Event', '8th', 32)),
      'M-C'
    ) < 0
  );
  assert.ok(
    compareTeams(
      tournamentTeam('big-field', report('Event', '8th', 64)),
      tournamentTeam('small-field', report('Event', '8th', 32)),
      'M-C'
    ) < 0
  );
  const d3 = ladderTeam('d3', 'Master Ball 3');
  const d4 = ladderTeam('d4', 'Master Ball 4');
  const unspecified = ladderTeam('unspecified', 'Master Ball');
  assert.ok(compareTeams(d3, d4, 'M-C') < 0);
  assert.ok(compareTeams(d4, unspecified, 'M-C') < 0);
  assert.ok(
    compareTeams(
      ladderTeam('unknown', 'Champion Tier', 'Unknown'),
      ladderTeam('known', 'Master Ball 3'),
      'M-C'
    ) > 0
  );
  assert.equal(
    evidenceGrade(
      evidence(report('World Rankings Open', 'Champion'), 'M-C', 'M-C').level
    ),
    'reported'
  );
  assert.equal(
    evidenceGrade(
      evidence(report('Regional Open Qualifier', 'Champion'), 'M-C', 'M-C')
        .level
    ),
    'reported'
  );
  assert.equal(
    evidence(report('Sunday Showdown #1', '1st'), 'M-C', 'M-C').platform,
    'Tournament'
  );
  assert.equal(
    evidence(report('Intimidators Ladder Tour', 'Champion'), 'M-C', 'M-C')
      .platform,
    'Tournament'
  );
  assert.ok(
    compareTeams(
      tournamentTeam(
        'old-worlds',
        report('Worlds 2026', '9th'),
        'M-C',
        '2020-01-01'
      ),
      tournamentTeam(
        'new-ordinary',
        report('Event', 'Champion'),
        'M-C',
        '2026-12-31'
      ),
      'M-C'
    ) < 0
  );
  assert.ok(
    compareTeams(ladderTeam('tier', 'Champion Tier'), showdown1, 'M-C') < 0
  );
});

test('bestEvidence follows merit order, keeps the first of equal merit, and carries the selected entrant count', () => {
  const teamWith = (reports, id = 't') => ({
    id,
    regulation: 'M-C',
    publishedAt: '2026-01-01',
    reports,
  });
  const ladder = report('Champions ranked battles', 'Reported #1');
  const ordinary = report('Event', 'Champion');
  const forward = bestEvidence(teamWith([ordinary, ladder]), 'M-C');
  const reverse = bestEvidence(teamWith([ladder, ordinary]), 'M-C');
  assert.equal(forward.event, 'Champions ranked battles');
  assert.equal(reverse.event, 'Champions ranked battles');
  assert.equal(forward.platform, 'Champions ladder');
  assert.equal(forward.entrants, undefined);

  const equal = bestEvidence(
    teamWith([
      report('Champions ranked battles', 'Master Ball 3'),
      report('Ladder', 'Master Ball 3'),
    ]),
    'M-C'
  );
  assert.equal(equal.event, 'Champions ranked battles');
  const equalReversed = bestEvidence(
    teamWith([
      report('Ladder', 'Master Ball 3'),
      report('Champions ranked battles', 'Master Ball 3'),
    ]),
    'M-C'
  );
  assert.equal(equalReversed.event, 'Ladder');

  const weakerWithEntrants = bestEvidence(
    teamWith([report('Worlds 2026', '9th', 40), ladder]),
    'M-C'
  );
  assert.equal(weakerWithEntrants.event, 'Champions ranked battles');
  assert.equal(weakerWithEntrants.entrants, undefined);

  const selectedMajor = bestEvidence(
    teamWith([
      report('Worlds 2026', '9th', 40),
      report('Champions ranked battles', 'Master Ball 3'),
    ]),
    'M-C'
  );
  assert.equal(selectedMajor.event, 'Worlds 2026');
  assert.equal(selectedMajor.entrants, 40);
  assert.equal(evidenceGrade(bestEvidence(teamWith([]), 'M-C').level), 'none');
});

test('compareTeams reclassifies a cached team when the current regulation changes', () => {
  const unspecified = {
    id: 'u',
    regulation: 'M-C',
    publishedAt: '2026-01-01',
    reports: [
      { event: 'Champions ranked battles', rank: 'Master Ball', sourceUrl: '' },
    ],
  };
  const lower = ladderTeam('a', 'Rank 3');
  assert.ok(compareTeams(unspecified, lower, 'M-C') < 0);
  const afterCurrent = compareTeams(unspecified, lower, 'M-B');
  assert.ok(afterCurrent > 0);
  assert.equal(
    afterCurrent,
    compareTeams(structuredClone(unspecified), structuredClone(lower), 'M-B')
  );
});

test('custom-rule source teams are excluded from every recommendation boundary while user options remain', () => {
  const suggestionTeam = (id, reports) => ({
    id,
    regulation: 'M-C',
    publishedAt: '2026-01-01',
    reports,
    members: [
      {
        pokemon: 'Pikachu',
        item: 'Light Ball',
        ability: 'Static',
        nature: 'Timid',
        moves: ['Volt Switch', 'Protect'],
        spread: null,
      },
      {
        pokemon: 'Rotom-Wash',
        item: 'Leftovers',
        ability: 'Levitate',
        nature: 'Modest',
        moves: ['Hydro Pump'],
        spread: '31 HP / 4 Def / 31 SpA',
      },
      {
        pokemon: 'Archaludon',
        item: 'Assault Vest',
        ability: 'Stamina',
        nature: 'Modest',
        moves: ['Electro Shot'],
        spread: null,
      },
      {
        pokemon: 'Incineroar',
        item: 'Safety Goggles',
        ability: 'Intimidate',
        nature: 'Adamant',
        moves: ['Fake Out'],
        spread: null,
      },
      {
        pokemon: 'Amoonguss',
        item: 'Rocky Helmet',
        ability: 'Regenerator',
        nature: 'Calm',
        moves: ['Spore'],
        spread: null,
      },
      {
        pokemon: 'Rillaboom',
        item: 'Miracle Seed',
        ability: 'Grassy Surge',
        nature: 'Adamant',
        moves: ['Grassy Glide'],
        spread: null,
      },
    ],
  });
  const custom = suggestionTeam('poch-tournament-6ab431f2e905c1db68748c9c-1', [
    {
      event: 'Mudkip’s Marsh Pit #6',
      rank: '1st',
      sourceUrl: '',
      entrants: 40,
    },
  ]);
  const control = suggestionTeam('control', [
    { event: 'Champions ranked battles', rank: 'Master Ball 1', sourceUrl: '' },
  ]);
  const pikachu = control.members[0];
  const rotom = control.members[1];

  assert.deepEqual(pokemonSuggestions([pikachu], [custom], 'M-C'), []);
  assert.deepEqual(
    pokemonSuggestions([pikachu], [control], 'M-C').map(
      (suggestion) => suggestion.pokemon
    ),
    ['Rotom-Wash', 'Archaludon', 'Incineroar', 'Amoonguss', 'Rillaboom']
  );
  assert.deepEqual(
    pokemonSuggestions([pikachu], [custom, control], 'M-C'),
    pokemonSuggestions([pikachu], [control], 'M-C')
  );

  const swapSource = (id, reports) => {
    const team = suggestionTeam(id, reports);
    team.members[5] = {
      ...team.members[5],
      pokemon: 'Gholdengo',
      item: 'Choice Specs',
      ability: 'Good as Gold',
      nature: 'Modest',
      moves: ['Make It Rain'],
    };
    return team;
  };
  const swapControl = swapSource('swap', [
    { event: 'Champions ranked battles', rank: 'Master Ball 1', sourceUrl: '' },
  ]);
  const swapCustom = swapSource('poch-tournament-6ab431f2e905c1db68748c9c-2', [
    {
      event: 'Mudkip’s Marsh Pit #6',
      rank: '1st',
      sourceUrl: '',
      entrants: 40,
    },
  ]);
  assert.deepEqual(swapSuggestions(control.members, [swapCustom], 'M-C'), []);
  assert.ok(
    swapSuggestions(control.members, [swapControl], 'M-C').some(
      (suggestion) => suggestion.pokemon === 'Gholdengo'
    )
  );
  assert.deepEqual(
    swapSuggestions(control.members, [swapCustom, swapControl], 'M-C'),
    swapSuggestions(control.members, [swapControl], 'M-C')
  );

  const empty = catalogSuggestions(rotom, [custom], 'M-C', [pikachu]);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.abilities, []);
  assert.deepEqual(empty.natures, []);
  assert.deepEqual(empty.moves, []);
  const full = catalogSuggestions(rotom, [control], 'M-C', [pikachu]);
  assert.ok(full.items.some((entry) => entry.value === 'Leftovers'));
  assert.ok(full.abilities.some((entry) => entry.value === 'Levitate'));
  assert.ok(full.natures.some((entry) => entry.value === 'Modest'));
  assert.ok(full.moves.some((entry) => entry.value === 'Hydro Pump'));
  assert.deepEqual(
    catalogSuggestions(rotom, [custom, control], 'M-C', [pikachu]),
    full
  );

  assert.deepEqual(catalogSpreadSuggestions(rotom, [custom], 'M-C'), []);
  assert.deepEqual(
    catalogSpreadSuggestions(rotom, [control], 'M-C').map(
      ({ spread, nature }) => ({ spread, nature })
    ),
    [{ spread: '31 HP / 4 Def / 31 SpA', nature: 'Modest' }]
  );
  assert.deepEqual(
    catalogSpreadSuggestions(rotom, [custom, control], 'M-C'),
    catalogSpreadSuggestions(rotom, [control], 'M-C')
  );

  assert.deepEqual(buildBenchmarkIndex([custom], 'M-C').species, []);
  assert.equal(buildBenchmarkIndex([custom], 'M-C').teamCount, 0);
  const controlIndex = buildBenchmarkIndex([control], 'M-C');
  assert.equal(controlIndex.teamCount, 1);
  const rotomSpecies = controlIndex.species.find((entry) =>
    /rotom/i.test(entry.pokemon)
  );
  assert.ok(rotomSpecies);
  assert.equal(rotomSpecies.eligibleTeamCount, 1);
  assert.deepEqual(buildBenchmarkIndex([custom, control], 'M-C'), controlIndex);

  const originalMember = {
    ...rotom,
    item: 'Choice Specs',
    ability: 'Levitate',
  };
  const withOriginal = catalogSuggestions(
    rotom,
    [custom],
    'M-C',
    [pikachu],
    undefined,
    '',
    rotom.pokemon,
    originalMember
  );
  assert.ok(
    withOriginal.items.some(
      (entry) => entry.value === 'Choice Specs' && entry.original
    )
  );
  const own = ownSpreadSuggestions(
    rotom,
    [
      {
        id: 'own',
        name: 'Mine',
        regulation: 'M-C',
        members: [
          {
            ...rotom,
            nature: 'Timid',
            spread: '31 HP / 13 Def / 16 SpD / 6 Spe',
          },
        ],
      },
    ],
    null
  );
  assert.equal(own.length, 1);
  assert.equal(own[0].spread, '31 HP / 13 Def / 16 SpD / 6 Spe');
});
