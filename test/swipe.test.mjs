import assert from 'node:assert/strict';
import test from 'node:test';
import { swipeKind } from '../src/lib/swipe.ts';

test('swipeKind picks the dominant direction past the slop', () => {
  const cases = [
    [9, 9, null],
    [10, 0, 'right'],
    [-10, 0, 'left'],
    [0, 10, 'down'],
    [0, -10, 'up'],
    [30, 29, 'right'],
    [30, 30, 'down'],
    [-31, 30, 'left'],
    [-30, 30, 'down'],
    [-30, -30, 'up'],
  ];
  for (const [dx, dy, expected] of cases)
    assert.equal(swipeKind(dx, dy), expected, `${dx},${dy}`);
});
