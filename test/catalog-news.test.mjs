import assert from 'node:assert/strict';
import test from 'node:test';
import { readNotificationSettings } from '../src/lib/catalog-news.ts';

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
