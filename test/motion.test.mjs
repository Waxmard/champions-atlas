import assert from 'node:assert/strict';
import test from 'node:test';
import { morphTeam, navKind } from '../src/lib/motion.ts';

const place = (id, search = '', params = null) => ({
  route: { id },
  url: new URL('http://x/' + search),
  params,
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

test('finds the team a list-to-team navigation is about', () => {
  const cases = [
    [place('/teams/[id]', '', { id: 't1' }), 't1'],
    [place('/teams/[id]'), null],
    [place('/wishlist', '?team=a'), 'a'],
    [place('/favorites', '?team=b%20c'), 'b c'],
    [place('/wishlist'), null],
    [place('/my-teams/new'), null],
    [place('/my-teams', '?team=a'), null],
    [place('/'), null],
  ];
  for (const [at, expected] of cases) {
    assert.equal(morphTeam(at), expected, `${at.route.id}${at.url.search}`);
  }
});
