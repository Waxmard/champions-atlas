import assert from 'node:assert/strict';
import test from 'node:test';
import { readNotificationSettings } from '../src/lib/catalog-news.ts';
import { notifiablePokemon } from '../src/lib/rosters.ts';

const stored = (value) => ({ getItem: () => value });

const defaults = {
  newTeams: true,
  newTeamsWithoutEvs: true,
  pokemon: [],
  pokemonWithoutEvs: true,
};

test('readNotificationSettings decodes stored settings with safe defaults', () => {
  assert.deepEqual(readNotificationSettings(stored(null)), defaults);
  assert.deepEqual(
    readNotificationSettings(stored('{"newTeams":"yes"}')),
    defaults
  );
  assert.deepEqual(readNotificationSettings(stored('{"newTeams":false}')), {
    ...defaults,
    newTeams: false,
  });
  assert.deepEqual(
    readNotificationSettings(
      stored(
        '{"newTeams":false,"newTeamsWithoutEvs":false,"pokemon":["Incineroar",7,""],"pokemonWithoutEvs":false}'
      )
    ),
    {
      newTeams: false,
      newTeamsWithoutEvs: false,
      pokemon: ['Incineroar'],
      pokemonWithoutEvs: false,
    }
  );
  assert.deepEqual(
    readNotificationSettings(stored('{"pokemon":"Incineroar"}')),
    defaults
  );
});

test('notifiablePokemon offers the current roster and Browse names once each', () => {
  const roster = notifiablePokemon([], 'M-C');
  for (const name of ['Ariados', 'Sandaconda', 'Aegislash'])
    assert.ok(roster.includes(name), name);
  assert.equal(roster.filter((name) => name === 'Maushold').length, 1);
  assert.ok(!roster.includes('Maushold-Four'));
  assert.ok(!roster.includes('Aegislash-Shield'));
  assert.deepEqual(
    notifiablePokemon(
      [{ members: [{ pokemon: 'Zacian' }, { pokemon: 'Charizard-Mega-Y' }] }],
      'M-Z'
    ),
    ['Charizard', 'Zacian']
  );
});
