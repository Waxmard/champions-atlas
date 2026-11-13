import assert from 'node:assert/strict';
import test from 'node:test';
import {
  moveSavedTeamToWishlist,
  useWishlistedTeam,
  removeSavedTeam,
  orderedSaved,
  reorderSaved,
  setTeamFavorite,
  favoriteTeams,
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
  const wishlisted = storage([rain, snapshot('b', 'Sun'), wish('w')]);
  for (const active of ['missing', 'w']) {
    wishlisted.active = active;
    assert.equal(
      shortcutTeam(wishlisted).id,
      orderedSaved(readSavedTeams(wishlisted))[0].id
    );
  }
  assert.equal(shortcutTeam(storage()), null);
});
