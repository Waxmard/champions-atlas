import assert from 'node:assert/strict';
import test from 'node:test';
import { swipeDirection } from '../src/lib/swipe.ts';

test('classifies swipe direction', () => {
  const cases = [
    [64, 0, 'right'],
    [63, 0, null],
    [64, 32, 'right'],
    [64, 33, null],
    [-200, 0, null],
    [0, 96, 'down'],
    [0, 95, null],
    [48, 96, 'down'],
    [49, 96, null],
    [0, -200, null],
    [100, 100, null],
  ];
  for (const [dx, dy, expected] of cases)
    assert.equal(swipeDirection(dx, dy), expected, `${dx},${dy}`);
});
