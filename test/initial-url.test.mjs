import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeInitialUrl } from '../src/lib/initial-url.ts';

function parts(url) {
  return [url.pathname, url.search, url.hash];
}

test('normalizes an empty native path to the root', () => {
  assert.deepEqual(parts(normalizeInitialUrl('capacitor://localhost', '/')), [
    '/',
    '',
    '',
  ]);
});

test('preserves query and fragment on an empty native path', () => {
  assert.deepEqual(
    parts(normalizeInitialUrl('capacitor://localhost?browse=all#section', '/')),
    ['/', '?browse=all', '#section']
  );
});

test('preserves explicit native paths, queries and fragments', () => {
  assert.deepEqual(
    parts(
      normalizeInitialUrl(
        'capacitor://localhost/my-teams?team=existing#member',
        '/'
      )
    ),
    ['/my-teams', '?team=existing', '#member']
  );
});

test('preserves nonempty web paths', () => {
  assert.equal(normalizeInitialUrl('https://localhost/', '/').pathname, '/');
  assert.equal(
    normalizeInitialUrl('https://localhost/teams/example', '/').pathname,
    '/teams/example'
  );
});

test('uses the supplied root for an empty native path', () => {
  assert.equal(
    normalizeInitialUrl('capacitor://localhost', '/atlas/').pathname,
    '/atlas/'
  );
});
