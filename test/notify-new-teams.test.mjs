import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import {
  deliver,
  devicePrefs,
  newTeamsAlert,
  pokemonAlert,
} from '../scripts/notify-new-teams.mjs';

const report = (event, rank = '', sourceUrl = '') => ({
  event,
  rank,
  sourceUrl,
});
const team = (id, reports, regulation = 'M-C', members = []) => ({
  id,
  regulation,
  reports,
  members,
});
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
    { title: '1 new Reg M-C team', body: 'Tap to see them', path: '?new=1' }
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
      path: '?new=1',
    }
  );
});

const members = (names, spread) =>
  Array.from({ length: 6 }, (_, index) => ({
    pokemon: names[index % names.length],
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread,
  }));

test('pokemonAlert, the EV toggle and devicePrefs work per device', () => {
  const complete = '32 HP / 32 Atk / 2 Spe';
  const teams = [
    team(
      'a',
      [regional],
      'M-C',
      members(['Incineroar', 'Rillaboom'], complete)
    ),
    team('b', [channel], 'M-C', members(['Charizard-Mega-Y'], null)),
    team('c', [regional], 'M-B', members(['Incineroar'], complete)),
    team('d', [regional], 'M-C', members(['Incineroar'], complete)),
  ];
  const batch = bundle(teams, ['a', 'b', 'c']);
  const watched = ['Charizard', 'Incineroar', 'Rillaboom', 'Tornadus'];
  assert.deepEqual(pokemonAlert(batch, watched), {
    title: '2 new teams with Charizard, Incineroar and 1 more',
    body: 'Louisville Regional 2027 and CybertronVGC',
    path: '?new=1',
  });
  assert.deepEqual(pokemonAlert(batch, watched, false), {
    title: '1 new team with Incineroar and Rillaboom',
    body: 'Louisville Regional 2027',
    path: '?new=1',
  });
  assert.equal(pokemonAlert(batch, ['Tornadus']), null);
  const single = new URLSearchParams(
    pokemonAlert(batch, ['Charizard']).path.slice(1)
  );
  assert.equal(single.get('new'), '1');
  assert.deepEqual(single.getAll('member'), ['["Charizard","","",""]']);
  assert.deepEqual(newTeamsAlert(batch, false), {
    title: '1 new Reg M-C team',
    body: 'Louisville Regional 2027',
    path: '?new=1',
  });
  assert.deepEqual(devicePrefs(), {
    newTeams: true,
    newTeamsWithoutEvs: true,
    pokemon: [],
    pokemonWithoutEvs: true,
    format: 'doubles',
  });
  assert.deepEqual(
    devicePrefs({
      newTeams: { booleanValue: false },
      pokemon: {
        arrayValue: {
          values: [{ stringValue: 'Incineroar' }, { integerValue: '7' }],
        },
      },
      pokemonWithoutEvs: { booleanValue: false },
    }),
    {
      newTeams: false,
      newTeamsWithoutEvs: true,
      pokemon: ['Incineroar'],
      pokemonWithoutEvs: false,
      format: 'doubles',
    }
  );
  assert.equal(
    devicePrefs({ format: { stringValue: 'singles' } }).format,
    'singles'
  );
});

test('singles alerts read the singles batch and leave doubles titles unchanged', () => {
  const doubles = team('d', [regional], 'M-C', members(['Incineroar'], null));
  const singles = {
    ...team(
      's',
      [report('Poch.ms collection')],
      'M-C',
      members(['Incineroar'], null)
    ),
    format: 'singles',
  };
  const both = {
    ...bundle([doubles, singles], ['d']),
    singlesBatch: { addedAt: '2026-11-14T00:00:00.000Z', ids: ['s'] },
  };
  assert.equal(
    newTeamsAlert(both, true, 'singles').title,
    '1 new Reg M-C singles team'
  );
  assert.equal(newTeamsAlert(both).title, '1 new Reg M-C team');
  assert.equal(
    pokemonAlert(both, ['Incineroar'], true, 'singles').title,
    '1 new singles team with Incineroar'
  );
  assert.equal(
    pokemonAlert(both, ['Incineroar']).title,
    '1 new team with Incineroar'
  );
});

const apns = (
  status,
  reason = '',
  body = reason && JSON.stringify({ reason })
) => ({
  request() {
    const request = new EventEmitter();
    request.setEncoding = () => {};
    request.end = () =>
      queueMicrotask(() => {
        request.emit('response', { ':status': status });
        if (body) request.emit('data', body);
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
  assert.equal(
    await outcome(apns(502, '', '<html>Bad Gateway</html>')),
    'failed: 502 <html>Bad Gateway</html>'
  );
});
