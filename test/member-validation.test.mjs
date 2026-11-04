import assert from 'node:assert/strict';
import test from 'node:test';
import {
  memberRosterError,
  memberValidationError,
  parseTeamPaste,
} from '../src/lib/member-validation.ts';
import { exportPaste } from '../src/lib/workbench.ts';

const member = (
  pokemon,
  nature = 'Serious',
  spread = '32 Atk / 32 Spe / 2 HP'
) => ({
  pokemon,
  item: 'Item',
  ability: 'Ability',
  nature,
  spread,
  moves: ['Protect'],
});

const snapshot = (...members) => structuredClone(members);

test('roster validation rejects duplicate species and excess Mega Pokémon', () => {
  const accepted = member('Pikachu');
  const teammates = [
    member('Pikachu'),
    member('Absol-Mega'),
    member('Lucario-Mega-X'),
  ];
  const before = snapshot(accepted, ...teammates);

  assert.equal(
    memberRosterError(member('Pikachu'), accepted, teammates),
    'This Pokémon is already on the team.'
  );
  assert.deepEqual(
    memberValidationError(
      member('Venusaur-Mega'),
      accepted,
      teammates,
      'structured'
    ),
    {
      field: 'pokemon',
      message: 'A team can include at most two Mega Pokémon.',
    }
  );
  assert.deepEqual(
    memberValidationError(member('Pikachu'), accepted, teammates, 'text'),
    { field: 'text', message: 'This Pokémon is already on the team.' }
  );
  assert.equal(
    memberRosterError(member('Absol-Mega'), member('Absol-Mega'), [
      member('Lucario-Mega-X'),
      member('Venusaur-Mega'),
    ]),
    ''
  );
  assert.deepEqual([accepted, ...teammates], before);
});

test('unchanged legacy nature and spread remain accepted', () => {
  const accepted = member('Pikachu', 'Old Nature', 'legacy spread');
  const next = structuredClone(accepted);
  const teammates = [member('Raichu')];
  const before = snapshot(accepted, ...teammates);

  assert.equal(
    memberValidationError(next, accepted, teammates, 'structured'),
    null
  );
  assert.equal(next.nature, 'Old Nature');
  assert.deepEqual([accepted, ...teammates], before);
});

test('changed malformed, under-budget, and over-budget spreads are rejected', () => {
  const accepted = member('Pikachu');
  const teammates = [member('Raichu')];
  const before = snapshot(accepted, ...teammates);

  for (const [spread, expected] of [
    [
      '32 Atk / nope Spe',
      {
        field: 'spread',
        message: 'Enter a valid EV spread totaling 66 points.',
      },
    ],
    [
      '32 Atk / 32 Def',
      {
        field: 'spread',
        message: 'Changed EV spreads must total 66 points (currently 64).',
      },
    ],
    [
      '32 Atk / 32 Def / 3 Spe',
      {
        field: 'spread',
        message: 'Changed EV spreads must total 66 points (currently 67).',
      },
    ],
  ]) {
    const next = { ...member('Pikachu'), spread };
    assert.deepEqual(
      memberValidationError(next, accepted, teammates, 'structured'),
      expected
    );
  }
  assert.deepEqual([accepted, ...teammates], before);
});

test('nature values canonicalize standard names and reject unknown names', () => {
  const accepted = member('Pikachu');
  const teammates = [member('Raichu')];
  const before = snapshot(accepted, ...teammates);
  const next = { ...member('Pikachu'), nature: '  aDaMaNt  ' };

  assert.equal(
    memberValidationError(next, accepted, teammates, 'structured'),
    null
  );
  assert.equal(next.nature, 'Adamant');
  assert.deepEqual(
    memberValidationError(
      { ...member('Pikachu'), nature: 'Not A Nature' },
      accepted,
      teammates,
      'structured'
    ),
    { field: 'nature', message: 'Choose a standard nature.' }
  );
  assert.deepEqual(
    memberValidationError(
      { ...member('Pikachu'), nature: 'Not A Nature' },
      accepted,
      teammates,
      'text'
    ),
    { field: 'text', message: 'Choose a standard nature.' }
  );
  assert.deepEqual([accepted, ...teammates], before);
});

test('text mode permits clearing spread and valid whole-set reuse', () => {
  const accepted = member('Pikachu', 'Old Nature', 'legacy spread');
  const teammates = [member('Raichu')];
  const before = snapshot(accepted, ...teammates);

  assert.equal(
    memberValidationError(
      { ...accepted, spread: null },
      accepted,
      teammates,
      'text'
    ),
    null
  );
  const reused = member('Pikachu', 'Adamant', '32 Atk / 32 Spe / 2 HP');
  assert.equal(
    memberValidationError(reused, accepted, teammates, 'structured'),
    null
  );
  assert.deepEqual([accepted, ...teammates], before);
});

test('blank species and structured blank spreads retain field-specific errors', () => {
  const accepted = member('Pikachu');
  for (const mode of ['structured', 'text']) {
    assert.deepEqual(
      memberValidationError({ ...accepted, pokemon: ' ' }, accepted, [], mode),
      {
        field: mode === 'text' ? 'text' : 'pokemon',
        message: 'Enter a Pokémon.',
      }
    );
    assert.deepEqual(
      memberValidationError(
        { ...accepted, spread: '32 HP' },
        accepted,
        [],
        mode
      ),
      {
        field: mode === 'text' ? 'text' : 'spread',
        message: 'Changed EV spreads must total 66 points (currently 32).',
      }
    );
  }
  assert.deepEqual(
    memberValidationError(
      { ...accepted, spread: null },
      accepted,
      [],
      'structured'
    ),
    {
      field: 'spread',
      message: 'Changed EV spreads must total 66 points (currently 0).',
    }
  );
});

test('team text matches reordered sets by normalized Pokémon identity', () => {
  const source = {
    pasteUrl: 'https://pokepast.es/0000000000000000',
    videoUrls: ['https://www.youtube.com/watch?v=aaaaaaaaaaa'],
    sourceSet: 'source',
    originalSet: 'original',
    appliedSignature: 'signature',
    borrowedNature: false,
  };
  const current = [
    { ...member('Mr. Mime', 'Old Nature', '32 HP'), marker: 'mime' },
    {
      ...member('Pikachu', 'Serious', '20 Def'),
      marker: 'pikachu',
      spreadSource: source,
    },
    member('Absol-Mega'),
    member('Charizard-Mega'),
    member('Blastoise'),
    member('Venusaur'),
  ];
  const before = snapshot(...current);
  const text = exportPaste([
    current[1],
    current[0],
    ...current.slice(2),
  ]).replace('Mr. Mime', 'mr-mime');
  const result = parseTeamPaste(text, current);

  assert.equal(result[0].pokemon, 'Pikachu');
  assert.equal(result[0].marker, 'pikachu');
  assert.deepEqual(result[0].spreadSource, source);
  assert.equal(result[1].pokemon, 'mr-mime');
  assert.equal(result[1].marker, 'mime');
  assert.equal(result[1].nature, 'Old Nature');
  assert.equal(result[1].spread, '32 HP');
  assert.deepEqual(current, before);

  const replacement = parseTeamPaste(
    text.replace('Pikachu', 'Mew').replace('20 Def', '32 Atk / 32 Spe / 2 HP'),
    current
  );
  assert.equal(replacement[0].pokemon, 'Mew');
  assert.equal(replacement[0].marker, undefined);
  assert.equal(replacement[0].spreadSource, undefined);

  const forms = [
    { ...member('Charizard'), marker: 'base' },
    { ...member('Charizard-Mega'), marker: 'mega' },
    ...current.slice(2).filter((entry) => entry.pokemon !== 'Charizard-Mega'),
    member('Raichu'),
  ];
  const reorderedForms = parseTeamPaste(
    exportPaste([forms[1], forms[0], ...forms.slice(2)]),
    forms
  );
  assert.equal(reorderedForms[0].marker, 'mega');
  assert.equal(reorderedForms[1].marker, 'base');

  assert.throws(
    () => parseTeamPaste(text.replace('32 HP', '31 HP'), current),
    /Changed EV spreads must total 66 points \(currently 31\)/
  );
  assert.throws(
    () => parseTeamPaste(text.replace('mr-mime', 'Mew'), current),
    /Choose a standard nature/
  );
  assert.throws(
    () => parseTeamPaste(text.replace('Pikachu', 'Mew'), current),
    /Changed EV spreads must total 66 points \(currently 20\)/
  );
  assert.throws(
    () =>
      parseTeamPaste(
        exportPaste([current[0], current[0], ...current.slice(2)]),
        current
      ),
    /duplicate Pokémon forms/
  );
  assert.throws(
    () =>
      parseTeamPaste(
        exportPaste([
          member('Absol-Mega'),
          member('Charizard-Mega'),
          member('Venusaur-Mega'),
          member('Blastoise'),
          member('Pikachu'),
          member('Raichu'),
        ]),
        current
      ),
    /at most two Mega Pokémon/
  );
});
