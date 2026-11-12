import assert from 'node:assert/strict';
import test from 'node:test';
import { newTeamsAlert } from '../scripts/notify-new-teams.mjs';

const current = { regulation: 'M-C', ids: ['a', 'b', 'c'] };
const body = 'Open Browse to see them.';

test('newTeamsAlert counts ids missing from the announced baseline', () => {
  assert.equal(newTeamsAlert(null, current), null);
  assert.equal(newTeamsAlert(['a', 'b', 'c', 'gone'], current), null);
  assert.deepEqual(newTeamsAlert(['a', 'b'], current), {
    title: '1 new Reg M-C team',
    body,
  });
  assert.deepEqual(newTeamsAlert([], current), {
    title: '3 new Reg M-C teams',
    body,
  });
});
