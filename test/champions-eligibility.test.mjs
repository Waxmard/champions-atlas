import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eligibilitySourceTexts,
  teamEligibilityError,
} from '../scripts/champions-eligibility.mjs';
import { battleSpecies, resolveBattleForm } from '../src/lib/battle-forms.ts';

const baseline = [
  'Venusaur',
  'Charizard',
  'Blastoise',
  'Pikachu',
  'Dragonite',
  'Mimikyu',
];
const team = (regulation, pokemon = baseline) => ({
  regulation,
  members: pokemon.map((member) =>
    typeof member === 'string'
      ? { pokemon: member, item: null, ability: null }
      : member
  ),
});
const withFirst = (regulation, member) =>
  team(regulation, [member, ...baseline.slice(1)]);

test('checked-in snapshots retain every official roster row and Mega entry', () => {
  const snapshots = eligibilitySourceTexts.map((source) => JSON.parse(source));
  assert.deepEqual(
    snapshots.map((snapshot) => [
      Object.keys(snapshot.pokemon).length,
      Object.keys(snapshot.megas).length,
    ]),
    [
      [213, 60],
      [235, 76],
      [262, 82],
    ]
  );
  assert.equal(
    snapshots[0].pokemon['0666-018'].includes('vivillonpokeball'),
    false
  );
  assert.deepEqual(snapshots[0].pokemon['0670-005'], ['floetteeternal']);
  assert.equal(snapshots[0].megas.floettemega, '0670-005');
  assert.deepEqual(
    [snapshots[2].pokemon['0931-000'], snapshots[2].pokemon['0931-002']],
    [['squawkabilly'], ['squawkabilly']]
  );
});

test('regulation rosters and Mega additions are exact', () => {
  assert.equal(teamEligibilityError(withFirst('M-C', 'Squawkabilly')), null);
  assert.match(
    teamEligibilityError(withFirst('M-A', 'Squawkabilly')),
    /Squawkabilly/
  );

  const mawileMega = { pokemon: 'Mawile', item: 'Mawilite', ability: null };
  assert.match(teamEligibilityError(withFirst('M-A', mawileMega)), /Mawile/);
  assert.equal(teamEligibilityError(withFirst('M-B', mawileMega)), null);

  const lucarioMegaZ = {
    pokemon: 'Lucario',
    item: 'Lucarionite Z',
    ability: null,
  };
  assert.match(
    teamEligibilityError(withFirst('M-B', lucarioMegaZ)),
    /Lucario-Mega-Z/
  );
  assert.equal(teamEligibilityError(withFirst('M-C', lucarioMegaZ)), null);

  for (const pokemon of ['Brute Bonnet', 'Iron Bundle'])
    assert.match(
      teamEligibilityError(withFirst('M-C', pokemon)),
      new RegExp(pokemon)
    );
});

test('Maushold family forms follow their official regulation-specific IDs', () => {
  for (const regulation of ['M-A', 'M-B']) {
    assert.equal(teamEligibilityError(withFirst(regulation, 'Maushold')), null);
    assert.match(
      teamEligibilityError(withFirst(regulation, 'Maushold-Four')),
      /Maushold-Four/
    );
  }
  assert.equal(teamEligibilityError(withFirst('M-C', 'Maushold-Four')), null);
  assert.match(teamEligibilityError(withFirst('M-C', 'Maushold')), /Maushold/);
});

test('explicit Mega identities use their underlying official roster rows', () => {
  for (const pokemon of [
    'Meowstic-Mega',
    'Meowstic-M-Mega',
    'Meowstic-F-Mega',
    'Floette-Eternal-Mega',
  ])
    assert.equal(
      teamEligibilityError(withFirst('M-A', pokemon)),
      null,
      pokemon
    );

  assert.match(
    teamEligibilityError(withFirst('M-A', 'Mawile-Mega')),
    /Mawile-Mega/
  );
  assert.equal(teamEligibilityError(withFirst('M-B', 'Mawile-Mega')), null);
  assert.match(
    teamEligibilityError(withFirst('M-B', 'Lucario-Mega-Z')),
    /Lucario-Mega-Z/
  );
  assert.equal(teamEligibilityError(withFirst('M-C', 'Lucario-Mega-Z')), null);
});

test('official forms and explicit battle-only aliases map to their roster rows', () => {
  const accepted = [
    'Raichu-Alola',
    'Tauros-Paldea-Combat',
    'Meowstic',
    'Meowstic-F',
    'Basculegion',
    'Basculegion-F',
    'Gourgeist',
    'Gourgeist-Small',
    'Gourgeist-Large',
    'Gourgeist-Super',
    'Lycanroc',
    'Lycanroc-Midnight',
    'Lycanroc-Dusk',
    'Aegislash-Blade',
    'Palafin-Hero',
    'Morpeko-Hangry',
    'Castform-Snowy',
    'Vivillon-Fancy',
    'Sinistcha-Masterpiece',
    'Polteageist-Antique',
  ];
  for (const pokemon of accepted)
    assert.equal(
      teamEligibilityError(withFirst('M-A', pokemon)),
      null,
      pokemon
    );

  for (const pokemon of [
    'Indeedee',
    'Indeedee-F',
    'Toxtricity',
    'Toxtricity-Low-Key',
  ]) {
    assert.equal(
      teamEligibilityError(withFirst('M-C', pokemon)),
      null,
      pokemon
    );
    assert.match(
      teamEligibilityError(withFirst('M-A', pokemon)),
      new RegExp(pokemon)
    );
  }

  assert.match(teamEligibilityError(withFirst('M-A', 'Floette')), /Floette/);
  assert.equal(teamEligibilityError(withFirst('M-A', 'Floette-Eternal')), null);
  assert.equal(
    teamEligibilityError(
      withFirst('M-A', {
        pokemon: 'Floette-Eternal',
        item: 'Floettite',
        ability: null,
      })
    ),
    null
  );
  assert.equal(teamEligibilityError(withFirst('M-A', 'Vivillon')), null);
  assert.match(
    teamEligibilityError(withFirst('M-A', 'Vivillon-Pokeball')),
    /Vivillon-Pokeball/
  );
});

test('generic and sex-specific Meowstic Mega identities resolve consistently', () => {
  assert.equal(battleSpecies('Meowstic-Mega')?.name, 'Meowstic-M-Mega');
  assert.equal(battleSpecies('Meowstic-M-Mega')?.name, 'Meowstic-M-Mega');
  assert.equal(battleSpecies('Meowstic-F-Mega')?.name, 'Meowstic-F-Mega');
  assert.equal(
    resolveBattleForm({ pokemon: 'Meowstic-Mega', item: null, ability: null })
      .pokemon,
    'Meowstic-M-Mega'
  );
  assert.equal(
    teamEligibilityError(
      withFirst('M-A', {
        pokemon: 'Meowstic',
        item: 'Meowsticite',
        ability: null,
      })
    ),
    null
  );
  assert.equal(
    teamEligibilityError(
      withFirst('M-A', {
        pokemon: 'Meowstic-F',
        item: 'Meowsticite',
        ability: null,
      })
    ),
    null
  );
});

test('Unknown retains its label and requires one complete supported roster', () => {
  const unknown = team('Unknown', [
    'Venusaur',
    'Charizard',
    'Blastoise',
    'Mawile',
    'Dragonite',
    'Mimikyu',
  ]);
  const before = structuredClone(unknown);
  assert.equal(teamEligibilityError(unknown), null);
  assert.equal(unknown.regulation, 'Unknown');
  assert.deepEqual(unknown, before);

  const ineligible = withFirst('Unknown', 'Brute Bonnet');
  assert.match(teamEligibilityError(ineligible), /Regulation Unknown/);
  assert.match(teamEligibilityError(ineligible), /Brute Bonnet/);

  assert.equal(teamEligibilityError(withFirst('Unknown', 'Maushold')), null);
  assert.equal(
    teamEligibilityError(withFirst('Unknown', 'Squawkabilly')),
    null
  );
  const mixed = team('Unknown', [
    'Maushold',
    'Squawkabilly',
    ...baseline.slice(2),
  ]);
  const mixedBefore = structuredClone(mixed);
  assert.match(teamEligibilityError(mixed), /no single supported roster/);
  assert.deepEqual(mixed, mixedBefore);
});

test('malformed, unsupported, and unknown identities fail without mutation', () => {
  assert.match(teamEligibilityError(team('M-A', baseline.slice(0, 5))), /six/);
  assert.match(teamEligibilityError(team('M-D')), /M-D/);
  assert.match(
    teamEligibilityError({ members: team('M-A').members }),
    /Regulation missing/
  );
  assert.match(
    teamEligibilityError({ ...team('M-A'), regulation: '' }),
    /Regulation missing/
  );
  assert.match(
    teamEligibilityError(team('M-A', [null, ...baseline.slice(1)])),
    /slot 1/
  );

  const unknown = withFirst('M-C', 'Missingno');
  const before = structuredClone(unknown);
  assert.match(teamEligibilityError(unknown), /Missingno/);
  assert.deepEqual(unknown, before);
});
