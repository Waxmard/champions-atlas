import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSavedTeams, teamsSnapshot } from '../src/lib/team-sync.ts';
import { checkpointTeam } from '../src/lib/team-history.ts';

const team = (id, name = id) => ({
  id,
  name,
  original: {
    id,
    name: id,
    regulation: 'M-C',
    pasteUrl: '',
    paste: null,
    members: Array.from({ length: 6 }, (_, i) => ({
      pokemon: `Pokemon${i}`,
      item: 'Item',
      ability: null,
      moves: ['Protect'],
      nature: null,
      spread: null,
      set: `Pokemon${i} @ Item\n- Protect`,
    })),
  },
  members: Array.from({ length: 6 }, (_, i) => ({
    pokemon: `Pokemon${i}`,
    item: 'Item',
    ability: null,
    moves: ['Protect'],
    nature: null,
    spread: null,
    set: `Pokemon${i} @ Item\n- Protect`,
  })),
  changeSlot: null,
  sources: [],
  history: [],
});
const merge = (base, local, remote, ids = new Map()) =>
  mergeSavedTeams(base, local, remote, ids);

test('sequential saves share one original ID and stale devices accept edits and deletion', () => {
  const t0 = [team('one')];
  const t1 = [team('one', 'Desktop')];
  const t2 = [team('one', 'Mobile latest')];
  assert.deepEqual(merge(t0, t1, t0), t1);
  assert.deepEqual(merge(t0, t0, t1), t1);
  assert.deepEqual(merge(t1, t2, t1), t2);
  assert.deepEqual(merge(t1, t1, t2), t2);
  assert.deepEqual(merge(t1, t1, []), []);
  assert.deepEqual(merge(t1, [], t1), []);
});

test('independent team changes compose in cloud order', () => {
  const base = [team('one'), team('two')];
  assert.deepEqual(
    merge(
      base,
      [team('one', 'local'), base[1]],
      [base[0], team('two', 'remote')]
    ),
    [team('one', 'local'), team('two', 'remote')]
  );
});

test('conflicting edits retain displaced exact member and raw set in one recovered team', () => {
  const base = [team('one')];
  const local = [team('one', 'Local')];
  const remote = [team('one', 'Remote')];
  remote[0].members[0].item = 'Life Orb';
  remote[0].members[0].set = 'Exact raw text\nIVs: 0 Atk';
  const ids = new Map();
  const result = merge(base, local, remote, ids);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Local');
  assert.equal(result[1].name, 'Remote (recovered)');
  assert.equal(result[1].members[0].set, 'Exact raw text\nIVs: 0 Atk');
  assert.equal(result[1].members[0].item, 'Life Orb');
  assert.deepEqual(merge(base, local, remote, ids), result);
  assert.deepEqual(merge(result, result, result), result);
});

test('deletion versus edit respects absence and keeps displaced edits', () => {
  const base = [team('one')];
  const remote = [team('one', 'Remote edit')];
  const deleted = merge(base, [], remote);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].name, 'Remote edit (recovered)');
  assert.notEqual(deleted[0].id, 'one');
  assert.deepEqual(merge(base, [team('one', 'Local edit')], []), [
    team('one', 'Local edit'),
  ]);
  assert.deepEqual(merge(base, [], base), []);
});

test('first adoption unions unique IDs and recovers local collision, not matching map reorder', () => {
  const cloud = team('one', 'Cloud');
  const local = team('one', 'Local');
  const merged = merge(null, [local, team('local')], [cloud, team('cloud')]);
  assert.deepEqual(
    merged.map(({ name }) => name),
    ['Cloud', 'cloud', 'local', 'Local (recovered)']
  );
  const reordered = structuredClone(cloud);
  reordered.members[0] = Object.fromEntries(
    Object.entries(reordered.members[0]).reverse()
  );
  assert.equal(teamsSnapshot([cloud]), teamsSnapshot([reordered]));
  assert.deepEqual(merge(null, [reordered], [cloud]), [reordered]);
  assert.equal(
    teamsSnapshot([cloud, team('two')]),
    teamsSnapshot([team('two'), cloud])
  );
});

test('a save during an in-flight commit remains pending after rebase', () => {
  const base = [team('one')];
  const captured = [team('one', 'First')];
  const committed = merge(base, captured, base);
  for (const newer of [
    [team('one', 'Second')],
    [captured[0], team('two')],
    [],
  ]) {
    const rebased = merge(captured, newer, committed);
    assert.equal(teamsSnapshot(rebased), teamsSnapshot(newer));
    assert.notEqual(teamsSnapshot(rebased), teamsSnapshot(committed));
  }
});

test('invalid teams and overflow never mutate inputs', () => {
  const initial = [team('one')];
  const before = structuredClone(initial);
  assert.throws(() =>
    merge(initial, [{ ...team('one'), members: [] }], initial)
  );
  assert.throws(
    () => merge(initial, [team('one'), team('one')], initial),
    /Duplicate/
  );
  const base = Array.from({ length: 50 }, (_, i) => team(String(i)));
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local[0].name = 'Local';
  remote[0].name = 'Remote';
  assert.throws(() => merge(base, local, remote), /Sync needs more room/);
  assert.deepEqual(initial, before);
  assert.equal(base[0].name, '0');
  assert.equal(local[0].name, 'Local');
  assert.equal(remote[0].name, 'Remote');
});

test('complete branch histories survive sequential sync, recovery, deletion and in-flight rebase', () => {
  const initial = team('history');
  initial.origin = 'catalog';
  initial.original.creator = 'Author';
  const edit = (previous, name, id) =>
    checkpointTeam(
      previous,
      { ...structuredClone(previous), name },
      { id, label: name }
    );
  const first = edit(initial, 'First', 'first');
  const second = edit(first, 'Second', 'second');
  assert.deepEqual(merge([initial], [first], [initial]), [first]);
  assert.deepEqual(merge([first], [first], [second]), [second]);
  assert.deepEqual(merge([first], [second], [first]), [second]);
  const other = edit(first, 'Other branch', 'other');
  other.members[0].set += '\nIVs: 0 Atk';
  other.members[0].evidence = { original: true };
  const recovered = merge([first], [second], [other]);
  assert.deepEqual(recovered[0], second);
  assert.deepEqual(recovered[1].history, other.history);
  assert.deepEqual(recovered[1].original, other.original);
  assert.equal(recovered[1].origin, other.origin);
  assert.deepEqual(recovered[1].members, other.members);
  assert.deepEqual(
    recovered[0].history.map((r) => r.id),
    ['first', 'second']
  );
  assert.deepEqual(
    recovered[1].history.map((r) => r.id),
    ['first', 'other']
  );
  const deleted = merge([first], [], [other]);
  assert.equal(deleted.length, 1);
  assert.deepEqual(deleted[0].history, other.history);
  assert.deepEqual(deleted[0].original, other.original);
  assert.deepEqual(merge([second], [second], []), []);
  const committed = merge([initial], [first], [initial]);
  const rebased = merge([first], [second], committed);
  assert.deepEqual(rebased, [second]);
  assert.deepEqual(merge(committed, rebased, committed), [second]);
});
