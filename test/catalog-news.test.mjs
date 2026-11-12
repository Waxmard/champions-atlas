import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextCatalogNews,
  readCatalogNews,
  readNotificationSettings,
} from '../src/lib/catalog-news.ts';

const stored = (value) => ({ getItem: () => value });

test('nextCatalogNews tracks fresh ids per visit and never forgets known ids', () => {
  assert.deepEqual(nextCatalogNews(null, ['a', 'b'], true), {
    known: ['a', 'b'],
    fresh: [],
  });
  assert.deepEqual(
    nextCatalogNews({ known: ['a', 'b'], fresh: [] }, ['a', 'b', 'c'], false),
    { known: ['a', 'b'], fresh: ['c'] }
  );
  assert.deepEqual(
    nextCatalogNews(
      { known: ['a', 'b'], fresh: ['c'] },
      ['a', 'b', 'c', 'd'],
      false
    ).fresh,
    ['c', 'd']
  );
  assert.deepEqual(
    nextCatalogNews(
      { known: ['a', 'b'], fresh: ['c'] },
      ['a', 'b', 'c', 'd'],
      true
    ),
    { known: ['a', 'b', 'c'], fresh: ['d'] }
  );
  const shrunk = nextCatalogNews(
    { known: ['a', 'b'], fresh: [] },
    ['a'],
    false
  );
  assert.deepEqual(nextCatalogNews(shrunk, ['a', 'b'], false).fresh, []);
});

test('readCatalogNews rejects missing, malformed, and unreadable data', () => {
  assert.equal(readCatalogNews(stored(null)), null);
  assert.equal(readCatalogNews(stored('{')), null);
  assert.equal(readCatalogNews(stored('{"known":[1],"fresh":[]}')), null);
  assert.equal(
    readCatalogNews({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
    null
  );
});

test('readNotificationSettings is on only for an explicit true', () => {
  assert.deepEqual(readNotificationSettings(stored(null)), { newTeams: false });
  assert.deepEqual(readNotificationSettings(stored('{"newTeams":"yes"}')), {
    newTeams: false,
  });
  assert.deepEqual(readNotificationSettings(stored('{"newTeams":true}')), {
    newTeams: true,
  });
});
