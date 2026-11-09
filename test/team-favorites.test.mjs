import assert from 'node:assert/strict';
import test from 'node:test';
import {
  moveInUseTeamToFavorites,
  useWishlistedTeam,
  useFavoriteTeam,
  removeFavoriteTeam,
  orderedFavorites,
  reorderFavorites,
  teamsInUse,
  SavedTeamError,
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

test('Favorites lifecycle preserves edits, rejects duplicate base teams, reorders, and restores to My Teams', () => {
  const first = snapshot('fav-1', 'Variant A');
  const second = snapshot('fav-2', 'Variant B');
  const duplicate = {
    ...snapshot('fav-dup', 'Variant C'),
    original: first.original,
  };
  second.members[0].item = 'Choice Band';
  const secondOriginal = structuredClone(second.original);
  const s = storage([first, second, duplicate]);
  const ids = () => orderedFavorites(readSavedTeams(s)).map((x) => x.id);
  const favorite = (id) => readSavedTeams(s).find((x) => x.id === id);
  const editedSurvives = () => {
    assert.equal(favorite('fav-2').members[0].item, 'Choice Band');
    assert.deepEqual(favorite('fav-2').original, secondOriginal);
  };
  assert.equal(
    moveInUseTeamToFavorites(s, first.id, teamBaseline(first)).collection,
    'favorites'
  );
  const beforeDuplicate = s.data;
  const writes = s.writes;
  assert.throws(
    () => moveInUseTeamToFavorites(s, duplicate.id, teamBaseline(duplicate)),
    (error) =>
      error instanceof SavedTeamError &&
      /already in Favorites/.test(error.message)
  );
  assert.equal(s.data, beforeDuplicate);
  assert.equal(s.writes, writes);
  assert.equal(
    moveInUseTeamToFavorites(s, second.id, teamBaseline(second)).collection,
    'favorites'
  );
  assert.deepEqual(
    teamsInUse(readSavedTeams(s)).map((x) => x.id),
    ['fav-dup']
  );
  assert.deepEqual(ids(), ['fav-2', 'fav-1']);
  editedSurvives();
  assert.equal(
    reorderFavorites(s, ['fav-2', 'fav-1'], ['fav-2', 'fav-1']),
    null
  );
  reorderFavorites(s, ['fav-1', 'fav-2'], ['fav-2', 'fav-1']);
  assert.deepEqual(ids(), ['fav-1', 'fav-2']);
  editedSurvives();
  assert.throws(
    () => reorderFavorites(s, ['fav-2', 'fav-1'], ['fav-2', 'fav-1']),
    /Favorites changed/
  );
  assert.throws(() => useWishlistedTeam(s, 'fav-2'), /no longer in Wishlist/);
  const restored = useFavoriteTeam(s, 'fav-2');
  assert.equal(restored.collection, 'my-teams');
  assert.equal(restored.favoriteOrder, undefined);
  assert.equal(restored.members[0].item, 'Choice Band');
  editedSurvives();
  assert.equal(useFavoriteTeam(s, 'fav-2').id, 'fav-2');
  assert.throws(() => removeFavoriteTeam(s, 'fav-2'), /no longer in Favorites/);
  assert.equal(
    removeFavoriteTeam(s, 'fav-1').some((x) => x.id === 'fav-1'),
    false
  );
});

test('Favorites moves and restores reject missing or changed teams without writing', () => {
  const initial = snapshot('team');
  const baseline = teamBaseline(readSavedTeams(storage([initial]))[0]);
  const editedMembers = initial.members.map((m, i) =>
    i ? m : { ...m, item: 'Changed elsewhere' }
  );
  const cases = [
    { id: 'missing', team: initial },
    { id: initial.id, team: { ...initial, collection: 'favorites' } },
    { id: initial.id, team: { ...initial, name: 'Changed elsewhere' } },
    { id: initial.id, team: { ...initial, members: editedMembers } },
  ];
  for (const { id, team } of cases) {
    const s = storage([team]);
    const before = s.data;
    assert.throws(
      () => moveInUseTeamToFavorites(s, id, baseline),
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
    ['w', /no longer in Favorites/],
  ])
    assert.throws(
      () => useFavoriteTeam(s, id),
      (error) => error instanceof SavedTeamError && pattern.test(error.message)
    );
  assert.deepEqual(removeFavoriteTeam(s, 'missing'), readSavedTeams(s));
  assert.equal(s.data, before);
  assert.equal(s.writes, 0);
});
