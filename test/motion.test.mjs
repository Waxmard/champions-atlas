import assert from 'node:assert/strict';
import test from 'node:test';
import { navKind } from '../src/lib/motion.ts';

const place = (id, search = '') => ({
  route: { id },
  url: new URL('http://x/' + search),
});

test('classifies navigation between places', () => {
  const cases = [
    [place('/'), place('/teams/[id]'), 'push'],
    [place('/teams/[id]'), place('/'), 'pop'],
    [place('/', '?page=1'), place('/', '?page=2'), null],
    [place('/'), place('/my-teams'), 'tab'],
    [place('/teams/[id]'), place('/wishlist'), 'tab'],
    [place('/wishlist'), place('/wishlist', '?team=a'), 'push'],
    [place('/wishlist', '?team=a'), place('/wishlist'), 'pop'],
    [place('/wishlist', '?team=a'), place('/wishlist', '?team=b'), null],
    [place('/my-teams', '?team=a'), place('/my-teams', '?team=b'), null],
    [place('/my-teams'), place('/my-teams/new'), 'push'],
    [place('/my-teams/new'), place('/my-teams', '?team=a'), 'pop'],
  ];
  for (const [from, to, expected] of cases) {
    assert.equal(
      navKind(from, to),
      expected,
      `${from.route.id}${from.url.search} → ${to.route.id}${to.url.search}`
    );
  }
});
