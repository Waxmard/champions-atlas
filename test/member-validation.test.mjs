import assert from 'node:assert/strict';
import test from 'node:test';
import {
  memberRosterError,
  memberValidationError,
} from '../src/lib/member-validation.ts';

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
