import assert from 'node:assert/strict';
import test from 'node:test';
import { readNotificationSettings } from '../src/lib/catalog-news.ts';

const stored = (value) => ({ getItem: () => value });

test('readNotificationSettings is off only for an explicit false', () => {
  assert.deepEqual(readNotificationSettings(stored(null)), { newTeams: true });
  assert.deepEqual(readNotificationSettings(stored('{"newTeams":"yes"}')), {
    newTeams: true,
  });
  assert.deepEqual(readNotificationSettings(stored('{"newTeams":false}')), {
    newTeams: false,
  });
});
