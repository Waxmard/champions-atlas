import assert from 'node:assert/strict';
import test from 'node:test';
import {
  moveSavedTeamToWishlist,
  useWishlistedTeam,
  removeSavedTeam,
  orderedSaved,
  reorderSaved,
  setTeamFavorite,
  setCurrentTeam,
  favoriteTeams,
  SavedTeamError,
  recordSummary,
  applyGameResults,
  shortcutTeam,
  sortByWinRate,
} from '../src/lib/team-collections.ts';
import {
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  storageKey,
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
  writes: 0,
  getItem() {
    return this.data;
  },
  setItem(key, value) {
    assert.equal(key, storageKey);
    this.data = value;
    this.writes++;
  },
});
const wish = (id, roster) => ({
  ...snapshot(id, id, roster),
  collection: 'wishlist',
});
const teamBaseline = (team) =>
  canonicalSnapshot({ name: team.name, members: team.members });

test('Saved lists every non-Wishlist team, reorders and deletes', () => {
  const s = storage([
    snapshot('a'),
    { ...snapshot('b'), collection: 'saved' },
    wish('w'),
  ]);
  const ids = () => orderedSaved(readSavedTeams(s)).map((x) => x.id);
  const all = ids();
  assert.deepEqual([...all].sort(), ['a', 'b']);
  const reversed = [...all].reverse();
  reorderSaved(s, reversed, all);
  assert.deepEqual(ids(), reversed);
  assert.throws(() => reorderSaved(s, all, all), /Saved changed/);
  assert.equal(
    removeSavedTeam(s, 'a').some((x) => x.id === 'a'),
    false
  );
  assert.throws(
    () => removeSavedTeam(s, 'w'),
    (error) =>
      error instanceof SavedTeamError &&
      /no longer in Saved/.test(error.message)
  );
});

test('Win/loss record survives a Wishlist round trip and invalid records are rejected', () => {
  const record = { wins: 3, losses: 1 };
  const team = { ...snapshot('rec'), record };
  const s = storage([team]);
  moveSavedTeamToWishlist(s, team.id, teamBaseline(team));
  assert.deepEqual(readSavedTeams(s)[0].record, record);
  assert.deepEqual(useWishlistedTeam(s, team.id).record, record);
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
  moveSavedTeamToWishlist(s, 'a', teamBaseline(a));
  assert.equal(useWishlistedTeam(s, 'a').favorite, true);
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

test('Shortcut results add to saved records once and name the current team', () => {
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
  assert.equal(shortcutTeam(s).id, orderedSaved(readSavedTeams(s))[0].id);
  setCurrentTeam(s, 'a', true);
  reorderSaved(s, ['b', 'a'], ['a', 'b']);
  assert.deepEqual(shortcutTeam(s), {
    id: 'a',
    name: 'Rain',
    wins: 9999,
    losses: 3,
  });
  assert.equal(shortcutTeam(storage()), null);
});

test('Win rate sort ranks by rate, then games, and leaves unplayed teams last in manual order', () => {
  const teams = [
    snapshot('a'),
    { ...snapshot('b'), record: { wins: 1, losses: 1 } },
    { ...snapshot('c'), record: { wins: 3, losses: 1 } },
    { ...snapshot('d'), record: { wins: 2, losses: 2 } },
    { ...snapshot('e'), record: { wins: 0, losses: 0 } },
  ];
  assert.deepEqual(
    sortByWinRate(teams).map(({ id }) => id),
    ['c', 'd', 'b', 'a', 'e']
  );
  assert.deepEqual(
    teams.map(({ id }) => id),
    ['a', 'b', 'c', 'd', 'e']
  );
});

test('A newly saved team goes to the top of a manually ordered Saved list', () => {
  const s = storage([snapshot('a'), snapshot('b')]);
  const before = orderedSaved(readSavedTeams(s)).map(({ id }) => id);
  reorderSaved(s, before.toReversed(), before);
  saveTeam(s, snapshot('c'));
  assert.deepEqual(
    orderedSaved(readSavedTeams(s)).map(({ id }) => id),
    ['c', ...before.toReversed()]
  );
});

test('Current team goes to the top and returns to its win rate spot', () => {
  const s = storage([
    { ...snapshot('a'), record: { wins: 3, losses: 1 } },
    { ...snapshot('b'), record: { wins: 1, losses: 1 } },
    snapshot('c'),
    { ...snapshot('d'), record: { wins: 2, losses: 2 } },
    { ...snapshot('e'), record: { wins: 4, losses: 0 } },
    wish('w'),
  ]);
  const ids = () => orderedSaved(readSavedTeams(s)).map(({ id }) => id);
  const current = () =>
    readSavedTeams(s)
      .filter((team) => team.current)
      .map(({ id }) => id);
  reorderSaved(s, ['a', 'd', 'b', 'c', 'e'], ids());

  setCurrentTeam(s, 'e', true);
  assert.deepEqual(ids(), ['e', 'a', 'd', 'b', 'c']);
  assert.deepEqual(current(), ['e']);

  setCurrentTeam(s, 'b', true);
  assert.deepEqual(ids(), ['b', 'e', 'a', 'd', 'c']);
  assert.deepEqual(current(), ['b']);

  setCurrentTeam(s, 'b', false);
  assert.deepEqual(ids(), ['e', 'a', 'd', 'b', 'c']);
  assert.deepEqual(current(), []);

  const writes = s.writes;
  setCurrentTeam(s, 'c', false);
  assert.equal(s.writes, writes);

  setCurrentTeam(s, 'c', true);
  setCurrentTeam(s, 'c', false);
  assert.deepEqual(ids(), ['e', 'a', 'd', 'b', 'c']);

  for (const id of ['missing', 'w'])
    assert.throws(() => setCurrentTeam(s, id, true), SavedTeamError);
});

test('Moving the current team to Wishlist clears the marker', () => {
  const s = storage([snapshot('a'), snapshot('b')]);
  setCurrentTeam(s, 'a', true);
  const a = readSavedTeams(s).find(({ id }) => id === 'a');
  const moved = moveSavedTeamToWishlist(s, 'a', teamBaseline(a));
  assert.equal(Object.hasOwn(moved, 'current'), false);
  assert.equal(shortcutTeam(s).id, 'b');
});
