import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { deliver, newTeamsAlert } from '../scripts/notify-new-teams.mjs';

const report = (event, rank = '', sourceUrl = '') => ({
  event,
  rank,
  sourceUrl,
});
const team = (id, reports, regulation = 'M-C') => ({ id, regulation, reports });
const bundle = (teams, ids = teams.map(({ id }) => id)) => ({
  currentRegulation: 'M-C',
  teams,
  latestBatch: { addedAt: '2026-11-13T14:17:00.000Z', ids },
});
const regional = report('Louisville Regional 2027', '1st');
const channel = report(
  'CybertronVGC collection',
  '',
  'https://www.youtube.com/@CybertronVGC'
);

test('newTeamsAlert counts the latest batch in the current regulation and names its sources', () => {
  assert.equal(
    newTeamsAlert({ currentRegulation: 'M-C', teams: [team('a', [])] }),
    null
  );
  assert.equal(newTeamsAlert(bundle([team('old', [regional], 'M-B')])), null);
  assert.deepEqual(
    newTeamsAlert(bundle([team('a', [report('Poch.ms collection')])])),
    { title: '1 new Reg M-C team', body: 'Tap to see them' }
  );
  assert.deepEqual(
    newTeamsAlert(
      bundle(
        [
          team('a', [regional]),
          team('b', [regional]),
          team('c', [channel, regional]),
          team('d', [report('Nice Regional 2027', 'Top 8')]),
          team('e', [report('Local Tour', '2nd')]),
          team('f', [report('Poch.ms collection')]),
          team('g', [regional], 'M-B'),
          team('h', [regional]),
        ],
        ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      )
    ),
    {
      title: '6 new Reg M-C teams',
      body: 'Louisville Regional 2027, CybertronVGC, Nice Regional 2027 and 1 more',
    }
  );
});

const apns = (status, reason = '') => ({
  request() {
    const request = new EventEmitter();
    request.setEncoding = () => {};
    request.end = () =>
      queueMicrotask(() => {
        request.emit('response', { ':status': status });
        if (reason) request.emit('data', JSON.stringify({ reason }));
        request.emit('end');
      });
    return request;
  },
});

test('deliver maps APNs replies to sent, dead, rejected, or failed', async () => {
  const outcome = (...sessions) => deliver(sessions, 'bearer x', 'token', '{}');
  assert.equal(await outcome(apns(200)), 'sent');
  assert.equal(await outcome(apns(410, 'Unregistered')), 'dead');
  assert.equal(await outcome(apns(400, 'BadDeviceToken'), apns(200)), 'sent');
  assert.equal(
    await outcome(apns(400, 'BadDeviceToken'), apns(400, 'BadDeviceToken')),
    'dead'
  );
  assert.equal(
    await outcome(apns(400, 'DeviceTokenNotForTopic')),
    'rejected: 400 DeviceTokenNotForTopic'
  );
  assert.equal(
    await outcome(apns(403, 'InvalidProviderToken')),
    'failed: 403 InvalidProviderToken'
  );
  assert.equal(
    await outcome(apns(429, 'TooManyRequests')),
    'failed: 429 TooManyRequests'
  );
});
