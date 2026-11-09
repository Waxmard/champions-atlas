import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSavedTeams, teamsSnapshot } from '../src/lib/team-sync.ts';
import { orderedWishlist } from '../src/lib/team-collections.ts';

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
test('Wishlist metadata survives sync snapshots and merge promotion', () => {
  const bookmark = {
    ...team('wish'),
    collection: 'wishlist',
    sources: [
      { name: 'Source', pasteUrl: 'https://pokepast.es/abcdef1234567890' },
    ],
  };
  const snapshot = teamsSnapshot([bookmark]);
  assert.match(snapshot, /wishlist/);
  const promoted = { ...bookmark, collection: 'my-teams' };
  assert.equal(
    merge([bookmark], [promoted], [bookmark])[0].collection,
    'my-teams'
  );
  const staleDelete = merge([bookmark], [], [promoted]);
  assert.equal(staleDelete[0].collection, 'my-teams');
});

const wishlisted = (id, name = id) => ({
  ...team(id, name),
  collection: 'wishlist',
  sources: [
    { name: 'Source', pasteUrl: 'https://pokepast.es/abcdef1234567890' },
  ],
});

test('promotion versus stale Wishlist deletion recovers the promoted team intact', () => {
  const base = [wishlisted('wish')];
  const promoted = [{ ...base[0], collection: 'my-teams' }];
  const ids = new Map();
  const recovered = merge(base, [], promoted, ids);
  assert.equal(recovered.length, 1);
  assert.notEqual(recovered[0].id, 'wish');
  assert.equal(recovered[0].name, 'wish (recovered)');
  assert.equal(recovered[0].collection, 'my-teams');
  assert.deepEqual(recovered[0].original, promoted[0].original);
  assert.deepEqual(recovered[0].members, promoted[0].members);
  assert.deepEqual(recovered[0].sources, promoted[0].sources);
  assert.deepEqual(merge(base, [], promoted, ids), recovered);
  assert.deepEqual(merge(recovered, recovered, recovered), recovered);
  assert.deepEqual(merge(base, promoted, []), promoted);
});

test('recovered conflicting teams keep each side collection', () => {
  const base = [wishlisted('wish')];
  const localEdit = [{ ...base[0], name: 'Local rename' }];
  const remotePromoted = [{ ...base[0], collection: 'my-teams' }];
  const result = merge(base, localEdit, remotePromoted);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map(({ id, name, collection }) => ({ id, name, collection })),
    [
      { id: 'wish', name: 'Local rename', collection: 'wishlist' },
      {
        id: result[1].id,
        name: 'wish (recovered)',
        collection: 'my-teams',
      },
    ]
  );
  assert.notEqual(result[1].id, 'wish');
  assert.deepEqual(result[1].sources, base[0].sources);
});

test('first adoption recovery retains Wishlist collection on the displaced team', () => {
  const cloud = { ...wishlisted('one', 'Cloud'), collection: 'my-teams' };
  const local = wishlisted('one', 'Local');
  const merged = merge(null, [local], [cloud]);
  assert.deepEqual(
    merged.map(({ name, collection }) => ({ name, collection })),
    [
      { name: 'Cloud', collection: 'my-teams' },
      { name: 'Local (recovered)', collection: 'wishlist' },
    ]
  );
});

const ranked = (id, wishlistOrder, name = id) => ({
  ...wishlisted(id, name),
  wishlistOrder,
});

test('one-sided Wishlist reorders sync in either direction and survive rebase', () => {
  const base = [ranked('a', 0), ranked('b', 1), ranked('c', 2)];
  const reordered = [ranked('a', 1), ranked('b', 0), ranked('c', 2)];
  assert.deepEqual(merge(base, reordered, base), reordered);
  assert.deepEqual(merge(base, base, reordered), reordered);
  assert.notEqual(teamsSnapshot(base), teamsSnapshot(reordered));
  assert.equal(
    teamsSnapshot(reordered),
    teamsSnapshot([...reordered].reverse())
  );

  const remote = [ranked('a', 0), ranked('b', 2), ranked('c', 1)];
  const committed = merge(base, reordered, remote);
  assert.deepEqual(committed, [ranked('a', 1), ranked('b', 0), ranked('c', 1)]);
  const newer = [ranked('a', 2), ranked('b', 0), ranked('c', 2)];
  const rebased = merge(reordered, newer, committed);
  assert.deepEqual(rebased, [ranked('a', 2), ranked('b', 0), ranked('c', 1)]);
  assert.notEqual(teamsSnapshot(rebased), teamsSnapshot(committed));
});

test('Wishlist reorders combine with opposite-side edits without recovery', () => {
  const base = [ranked('wish', 0)];
  const reordered = [ranked('wish', 2)];
  const renamed = { ...base[0], name: 'Renamed' };
  const edited = structuredClone(base[0]);
  edited.members[0].item = 'Life Orb';
  edited.members[0].set = 'Exact edited set\nIVs: 0 Atk';
  for (const edit of [renamed, edited]) {
    const expected = [{ ...edit, wishlistOrder: 2 }];
    assert.deepEqual(merge(base, reordered, [edit]), expected);
    assert.deepEqual(merge(base, [edit], reordered), expected);
  }
});

test('Favorites reorders sync, merge with opposite-side renames, and strip on promotion', () => {
  const fav = (id, favoriteOrder, name = id) => ({
    ...team(id, name),
    collection: 'favorites',
    ...(favoriteOrder === undefined ? {} : { favoriteOrder }),
  });
  const base = [fav('a', 0), fav('b', 1)];
  const reordered = [fav('a', 1), fav('b', 0)];
  assert.deepEqual(merge(base, reordered, base), reordered);
  assert.deepEqual(merge(base, base, reordered), reordered);
  const renamed = [fav('a', 0, 'Renamed'), fav('b', 1)];
  const combined = [fav('a', 1, 'Renamed'), fav('b', 0)];
  assert.deepEqual(merge(base, reordered, renamed), combined);
  assert.deepEqual(merge(base, renamed, reordered), combined);
  const promoted = [
    { ...team('a', 'Renamed'), collection: 'my-teams' },
    fav('b', 1),
  ];
  const afterPromote = merge(base, reordered, promoted);
  assert.equal(afterPromote[0].collection, 'my-teams');
  assert.equal(Object.hasOwn(afterPromote[0], 'favoriteOrder'), false);
  const promotedIn = [
    { ...team('a'), collection: 'favorites', favoriteOrder: 4 },
    fav('b', 1),
  ];
  const inUse = [team('a'), fav('b', 1)];
  assert.deepEqual(merge(inUse, inUse, promotedIn), promotedIn);
  assert.deepEqual(merge(inUse, promotedIn, inUse), promotedIn);
});

test('deletion and promotion win over an opposite-side Wishlist reorder', () => {
  const base = [ranked('wish', 0)];
  const reordered = [ranked('wish', 3)];
  assert.deepEqual(merge(base, [], reordered), []);
  assert.deepEqual(merge(base, reordered, []), []);

  const promoted = { ...base[0], collection: 'my-teams' };
  delete promoted.wishlistOrder;
  assert.deepEqual(merge(base, [promoted], reordered), [promoted]);
  assert.deepEqual(merge(base, reordered, [promoted]), [promoted]);
  const legacyPromotion = { ...promoted };
  delete legacyPromotion.collection;
  assert.deepEqual(merge(base, [legacyPromotion], reordered), [
    legacyPromotion,
  ]);
  assert.deepEqual(merge(base, reordered, [legacyPromotion]), [
    legacyPromotion,
  ]);
  const staleRank = { ...promoted, wishlistOrder: 17 };
  for (const result of [
    merge(base, [staleRank], reordered),
    merge(base, reordered, [staleRank]),
    merge(null, [staleRank], []),
  ]) {
    assert.deepEqual(result, [promoted]);
    assert.equal(Object.hasOwn(result[0], 'wishlistOrder'), false);
  }
});

test('concurrent Wishlist reorders use per-record local changes and stable ties', () => {
  const first = 'wish-alpha';
  const second = 'wish-beta';
  const base = [ranked('a', 0), ranked(first, 1), ranked(second, 2)];
  const local = [ranked('a', 1), ranked(first, 0), ranked(second, 2)];
  const remote = [ranked('a', 2), ranked(first, 1), ranked(second, 0)];
  const merged = merge(base, local, remote);
  const reversed = merge(base, [...local].reverse(), [...remote].reverse());
  assert.deepEqual(merged, [
    ranked('a', 1),
    ranked(first, 0),
    ranked(second, 0),
  ]);
  assert.equal(teamsSnapshot(merged), teamsSnapshot(reversed));
  for (const result of [merged, reversed]) {
    assert.deepEqual(
      orderedWishlist(result).map(({ id }) => id),
      [first, second, 'a']
    );
  }
});

test('Wishlist order reconciliation omits an absent winning rank', () => {
  const base = [ranked('wish', 0)];
  const unranked = wishlisted('wish');
  const remote = ranked('wish', 2);
  const result = merge(base, [unranked], [remote]);
  assert.deepEqual(result, [unranked]);
  assert.equal(Object.hasOwn(result[0], 'wishlistOrder'), false);

  const unrankedBase = [unranked];
  assert.deepEqual(merge(unrankedBase, [unranked], [remote]), [remote]);
  assert.deepEqual(merge(unrankedBase, [remote], [unranked]), [remote]);
});

test('first adoption and new shared IDs prefer defined remote Wishlist rank', () => {
  const unranked = wishlisted('wish');
  for (const base of [null, []]) {
    for (const [local, remote, expected] of [
      [ranked('wish', 3), ranked('wish', 0), ranked('wish', 0)],
      [unranked, ranked('wish', 2), ranked('wish', 2)],
      [ranked('wish', 3), unranked, ranked('wish', 3)],
      [unranked, unranked, unranked],
    ]) {
      const result = merge(base, [local], [remote]);
      assert.deepEqual(result, [expected]);
      if (expected.wishlistOrder === undefined)
        assert.equal(Object.hasOwn(result[0], 'wishlistOrder'), false);
    }
  }
  assert.deepEqual(merge(null, [ranked('local', 4)], []), [ranked('local', 4)]);
  assert.deepEqual(merge(null, [], [ranked('remote', 5)]), [
    ranked('remote', 5),
  ]);
});

test('Wishlist content conflicts retain exact sets and reuse recovery IDs across rank changes', () => {
  const base = [ranked('wish', 0)];
  const local = [ranked('wish', 1, 'Local')];
  const remote = [ranked('wish', 2, 'Remote')];
  remote[0].members[0].item = 'Life Orb';
  remote[0].members[0].set = 'Exact displaced set\nIVs: 0 Atk';
  const ids = new Map();
  const first = merge(base, local, remote, ids);
  const retry = merge(base, local, [{ ...remote[0], wishlistOrder: 3 }], ids);
  const unrankedRemote = { ...remote[0] };
  delete unrankedRemote.wishlistOrder;
  const retryUnranked = merge(base, local, [unrankedRemote], ids);
  assert.equal(first.length, 2);
  assert.equal(retry.length, 2);
  assert.equal(retryUnranked.length, 2);
  assert.deepEqual(first[0], local[0]);
  assert.deepEqual(retry[0], local[0]);
  assert.equal(first[1].id, retry[1].id);
  assert.equal(first[1].id, retryUnranked[1].id);
  assert.equal(ids.size, 1);
  assert.equal(first[1].name, 'Remote (recovered)');
  assert.equal(first[1].wishlistOrder, 2);
  assert.equal(retry[1].wishlistOrder, 3);
  assert.equal(Object.hasOwn(retryUnranked[1], 'wishlistOrder'), false);
  assert.equal(retry[1].members[0].item, 'Life Orb');
  assert.equal(retry[1].members[0].set, 'Exact displaced set\nIVs: 0 Atk');
});

test('conflicts across collections retain each surviving source rank', () => {
  const base = [ranked('wish', 0)];
  const local = ranked('wish', 3, 'Local');
  const promoted = { ...base[0], collection: 'my-teams' };
  delete promoted.wishlistOrder;
  const merged = merge(base, [local], [promoted]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], local);
  assert.equal(merged[1].collection, 'my-teams');
  assert.equal(Object.hasOwn(merged[1], 'wishlistOrder'), false);

  const cloud = { ...promoted, name: 'Cloud' };
  const adopted = merge(null, [local], [cloud]);
  assert.deepEqual(adopted[0], cloud);
  assert.equal(adopted[1].name, 'Local (recovered)');
  assert.equal(adopted[1].collection, 'wishlist');
  assert.equal(adopted[1].wishlistOrder, 3);

  for (const [cloudWishlist, expectedRank] of [
    [ranked('wish', 5, 'Cloud'), 5],
    [wishlisted('wish', 'Cloud'), 3],
  ]) {
    const result = merge(null, [local], [cloudWishlist]);
    assert.deepEqual(result[0], {
      ...cloudWishlist,
      wishlistOrder: expectedRank,
    });
    assert.equal(result[1].name, 'Local (recovered)');
    assert.equal(result[1].wishlistOrder, 3);
  }
});
