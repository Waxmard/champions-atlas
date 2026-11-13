import assert from 'node:assert/strict';
import test from 'node:test';
import {
  moveInUseTeamToSaved,
  useWishlistedTeam,
  useSavedTeam,
  removeSavedTeam,
  orderedSaved,
  reorderSaved,
  setTeamFavorite,
  favoriteTeams,
  teamsInUse,
  SavedTeamError,
  recordSummary,
  applyGameResults,
  shortcutTeam,
} from '../src/lib/team-collections.ts';
import {
  activeTeamKey,
  newSavedTeam,
  readSavedTeams,
} from '../src/lib/workbench.ts';
import { canonicalSnapshot } from '../src/lib/team-history.ts';

const species = [
  'Weavile',
  'Rotom-Wash',
  'Amoonguss',
  'Incineroar',
  'Landorus-Therian',
  'Flutter Mane',
];
const catalogTeam = (id, name = id, roster = species) => ({
  id,
  name,
  sheetIds: [],
  creator: '',
  regulation: 'M-C',
  publishedAt: '',
  pasteUrl: '',
  replicaCode: null,
  replicaStatus: '',
  reports: [],
  paste: null,
  pasteNotes: null,
  members: roster.map((pokemon) => ({
    pokemon,
    item: null,
    ability: null,
    moves: [],
    nature: null,
    spread: null,
  })),
});
const snapshot = (id, name = id, roster = species) => ({
  ...newSavedTeam(catalogTeam(id, name, roster)),
  id,
});
const storage = (teams = []) => ({
  data: JSON.stringify(teams),
  active: null,
  writes: 0,
  getItem(key) {
    return key === activeTeamKey ? this.active : this.data;
  },
  setItem(key, value) {
    if (key === activeTeamKey) this.active = value;
    else this.data = value;
    this.writes++;
  },
});
const wish = (id, roster) => ({
  ...snapshot(id, id, roster),
  collection: 'wishlist',
});
const teamBaseline = (team) =>
  canonicalSnapshot({ name: team.name, members: team.members });

test('Saved lifecycle preserves edits, rejects duplicate base teams, reorders, and restores to My Teams', () => {
  const first = snapshot('fav-1', 'Variant A');
  const second = snapshot('fav-2', 'Variant B');
  const duplicate = {
    ...snapshot('fav-dup', 'Variant C'),
    original: first.original,
  };
  second.members[0].item = 'Choice Band';
  const secondOriginal = structuredClone(second.original);
  const s = storage([first, second, duplicate]);
  const moved = new Set(['fav-1', 'fav-2']);
  const ids = () =>
    orderedSaved(readSavedTeams(s))
      .map((x) => x.id)
      .filter((id) => moved.has(id));
  const saved = (id) => readSavedTeams(s).find((x) => x.id === id);
  const editedSurvives = () => {
    assert.equal(saved('fav-2').members[0].item, 'Choice Band');
    assert.deepEqual(saved('fav-2').original, secondOriginal);
  };
  assert.equal(
    moveInUseTeamToSaved(s, first.id, teamBaseline(first)).collection,
    'saved'
  );
  const beforeDuplicate = s.data;
  const writes = s.writes;
  assert.throws(
    () => moveInUseTeamToSaved(s, duplicate.id, teamBaseline(duplicate)),
    (error) =>
      error instanceof SavedTeamError && /already in Saved/.test(error.message)
  );
  assert.equal(s.data, beforeDuplicate);
  assert.equal(s.writes, writes);
  assert.equal(
    moveInUseTeamToSaved(s, second.id, teamBaseline(second)).collection,
    'saved'
  );
  assert.deepEqual(
    teamsInUse(readSavedTeams(s)).map((x) => x.id),
    ['fav-dup']
  );
  assert.deepEqual(ids(), ['fav-2', 'fav-1']);
  editedSurvives();
  const all = ['fav-2', 'fav-1', 'fav-dup'];
  assert.equal(reorderSaved(s, all, all), null);
  reorderSaved(s, ['fav-1', 'fav-2', 'fav-dup'], all);
  assert.deepEqual(ids(), ['fav-1', 'fav-2']);
  editedSurvives();
  assert.throws(() => reorderSaved(s, all, all), /Saved changed/);
  assert.throws(() => useWishlistedTeam(s, 'fav-2'), /no longer in Wishlist/);
  const restored = useSavedTeam(s, 'fav-2');
  assert.equal(restored.collection, 'my-teams');
  assert.equal(restored.savedOrder, 1);
  assert.equal(restored.members[0].item, 'Choice Band');
  editedSurvives();
  assert.equal(useSavedTeam(s, 'fav-2').id, 'fav-2');
  assert.equal(
    removeSavedTeam(s, 'fav-2').some((x) => x.id === 'fav-2'),
    false
  );
  assert.equal(
    removeSavedTeam(s, 'fav-1').some((x) => x.id === 'fav-1'),
    false
  );
});

test('Saved moves and restores reject missing or changed teams without writing', () => {
  const initial = snapshot('team');
  const baseline = teamBaseline(readSavedTeams(storage([initial]))[0]);
  const editedMembers = initial.members.map((m, i) =>
    i ? m : { ...m, item: 'Changed elsewhere' }
  );
  const cases = [
    { id: 'missing', team: initial },
    { id: initial.id, team: { ...initial, collection: 'saved' } },
    { id: initial.id, team: { ...initial, name: 'Changed elsewhere' } },
    { id: initial.id, team: { ...initial, members: editedMembers } },
  ];
  for (const { id, team } of cases) {
    const s = storage([team]);
    const before = s.data;
    assert.throws(
      () => moveInUseTeamToSaved(s, id, baseline),
      (error) =>
        error instanceof SavedTeamError &&
        /changed elsewhere/.test(error.message)
    );
    assert.equal(s.data, before);
    assert.equal(s.writes, 0);
  }
  const s = storage([wish('w')]);
  const before = s.data;
  for (const [id, pattern] of [
    ['missing', /no longer saved/],
    ['w', /no longer in Saved/],
  ])
    assert.throws(
      () => useSavedTeam(s, id),
      (error) => error instanceof SavedTeamError && pattern.test(error.message)
    );
  assert.throws(
    () => removeSavedTeam(s, 'w'),
    (error) =>
      error instanceof SavedTeamError &&
      /no longer in Saved/.test(error.message)
  );
  assert.deepEqual(removeSavedTeam(s, 'missing'), readSavedTeams(s));
  assert.equal(s.data, before);
  assert.equal(s.writes, 0);
});

test('Win/loss record survives Saved moves and invalid records are rejected', () => {
  const record = { wins: 3, losses: 1 };
  const team = { ...snapshot('rec'), record };
  const s = storage([team]);
  moveInUseTeamToSaved(s, team.id, teamBaseline(team));
  assert.deepEqual(readSavedTeams(s)[0].record, record);
  assert.deepEqual(useSavedTeam(s, team.id).record, record);
  for (const bad of [
    { wins: -1, losses: 0 },
    { wins: 1.5, losses: 0 },
    { wins: 0, losses: 10000 },
  ])
    assert.throws(
      () => readSavedTeams(storage([{ ...team, record: bad }])),
      /could not be read/
    );
});

test('favorite is a flag on current and Saved-only teams', () => {
  const s = storage([
    snapshot('a'),
    { ...snapshot('b'), collection: 'saved' },
    wish('w'),
  ]);
  const starred = setTeamFavorite(s, 'a', true);
  assert.equal(starred.favorite, true);
  assert.equal(starred.collection, undefined);
  assert.equal(
    Object.hasOwn(setTeamFavorite(s, 'a', false), 'favorite'),
    false
  );
  const before = s.data;
  const writes = s.writes;
  for (const id of ['w', 'missing'])
    assert.throws(
      () => setTeamFavorite(s, id, true),
      (error) => error instanceof SavedTeamError
    );
  assert.equal(s.data, before);
  assert.equal(s.writes, writes);
  setTeamFavorite(s, 'a', true);
  setTeamFavorite(s, 'b', true);
  const a = readSavedTeams(s).find((team) => team.id === 'a');
  moveInUseTeamToSaved(s, 'a', teamBaseline(a));
  assert.equal(useSavedTeam(s, 'a').favorite, true);
  assert.deepEqual(
    favoriteTeams(readSavedTeams(s))
      .map((team) => team.id)
      .sort(),
    ['a', 'b']
  );
  assert.deepEqual(
    orderedSaved(readSavedTeams(s))
      .map((team) => team.id)
      .sort(),
    ['a', 'b']
  );
});
test('Record summary adds a rounded win rate once a game is logged', () => {
  assert.deepEqual(recordSummary({ wins: 3, losses: 1 }), {
    text: '3W – 1L · 75%',
    label: '3 wins, 1 loss, 75% win rate',
    rate: 75,
  });
  assert.equal(recordSummary({ wins: 2, losses: 1 }).text, '2W – 1L · 67%');
  assert.deepEqual(recordSummary({ wins: 0, losses: 0 }), {
    text: '0W – 0L',
    label: '0 wins, 0 losses',
    rate: null,
  });
});

test('Shortcut results add to saved records once and name the active team', () => {
  const rain = { ...snapshot('a', 'Rain'), record: { wins: 9998, losses: 1 } };
  const s = storage([rain, snapshot('b', 'Sun')]);
  const record = (id) =>
    readSavedTeams(s).find((team) => team.id === id).record;
  assert.equal(
    applyGameResults(s, [
      { teamId: 'a', wins: 3, losses: 2 },
      { teamId: 'gone', wins: 1, losses: 0 },
    ]),
    true
  );
  assert.deepEqual(record('a'), { wins: 9999, losses: 3 });
  assert.equal(record('b'), undefined);
  assert.equal(s.writes, 1);
  assert.equal(
    applyGameResults(s, [{ teamId: 'gone', wins: 1, losses: 0 }]),
    false
  );
  assert.equal(s.writes, 1);
  s.active = 'b';
  assert.deepEqual(shortcutTeam(s), {
    id: 'b',
    name: 'Sun',
    wins: 0,
    losses: 0,
  });
  s.active = 'missing';
  assert.equal(shortcutTeam(s).id, 'a');
  assert.equal(shortcutTeam(storage()), null);
});
