import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCatalogTeam,
  resolveSavedTeamId,
  isTeamInUse,
  teamsInUse,
  addCatalogToWishlist,
  addPokepasteToWishlist,
  useCatalogTeam,
  moveInUseTeamToWishlist,
  useWishlistedTeam,
  removeWishlistedTeam,
  orderedWishlist,
  rankSavedTeams,
  SavedTeamError,
  wishlistedCatalogEntries,
} from '../src/lib/team-collections.ts';
import {
  activeTeamKey,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
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
const pasteUrl = 'https://pokepast.es/abcdef1234567890';
const payload = {
  url: pasteUrl,
  title: 'Poképaste team',
  paste: species
    .map(
      (p, i) =>
        `${i ? p : `Ace (${p})`} @ Item\nAbility: Ability\nEVs: 252 HP / 252 Atk / 4 Spe\nAdamant Nature\nShiny: Yes\n- One\n- Two\n- Three\n- Four`
    )
    .join('\n\n'),
};
const names = (...labels) =>
  labels.map((name, i) => ({
    ...snapshot(
      String(i),
      name,
      species.map((_, j) => `Other${i}${j}`)
    ),
  }));

test('catalog resolution uses original IDs or unique canonical paste URLs without changing snapshots', () => {
  const current = { ...catalogTeam('current'), pasteUrl };
  const vrUrl = 'https://www.vrpastes.com/AbC12345';
  const vrTeam = { ...catalogTeam('vr'), pasteUrl: vrUrl };
  const saved = snapshot('obsolete');
  saved.name = 'Edited name';
  saved.members[0].item = 'Edited item';
  saved.original.pasteUrl = pasteUrl;
  const cat = [current, vrTeam];
  const before = structuredClone({ saved, cat });
  assert.equal(resolveCatalogTeam(saved.original, cat), current);
  assert.equal(
    resolveCatalogTeam({ id: 'current', pasteUrl: vrUrl }, cat),
    current
  );
  assert.equal(resolveCatalogTeam({ pasteUrl: vrUrl }, cat), vrTeam);
  assert.equal(resolveCatalogTeam({ id: '', pasteUrl: vrUrl }, cat), vrTeam);
  assert.deepEqual({ saved, cat }, before);
});

test('catalog resolution rejects missing, malformed, unmatched, and ambiguous URLs', () => {
  const current = { ...catalogTeam('current'), pasteUrl };
  const duplicate = { ...catalogTeam('duplicate'), pasteUrl };
  const badUrl = 'https://pokepast.es/abcdef1234567890?source=other';
  const cat = [
    current,
    duplicate,
    { ...catalogTeam('m'), pasteUrl: badUrl },
    catalogTeam(''),
  ];
  const before = structuredClone(cat);
  for (const q of [
    {},
    { id: '', pasteUrl: '' },
    { pasteUrl: badUrl },
    { pasteUrl: 'https://pokepast.es/1111111111111111' },
    { id: 'obsolete', pasteUrl },
  ])
    assert.equal(resolveCatalogTeam(q, cat), undefined);
  assert.equal(resolveCatalogTeam({ id: 'current', pasteUrl }, cat), current);
  assert.deepEqual(cat, before);
});

test('legacy teams default to My Teams without rewriting; Wishlist and Saved are excluded from resolution', () => {
  const legacy = snapshot('legacy');
  delete legacy.collection;
  const s = storage([legacy]);
  assert.equal(readSavedTeams(s)[0].collection, undefined);
  assert.equal(s.writes, 0);
  const list = [
    snapshot('a'),
    { ...snapshot('w'), collection: 'wishlist' },
    { ...snapshot('f'), collection: 'saved' },
    snapshot('b'),
  ];
  assert.deepEqual(
    teamsInUse(list).map((x) => x.id),
    ['a', 'b']
  );
  assert.equal(isTeamInUse(list[0]), true);
  assert.equal(isTeamInUse(list[1]), false);
  assert.equal(isTeamInUse(list[2]), false);
});

test('Wishlist deduplicates catalog IDs and promotion preserves the exact saved snapshot', () => {
  const s = storage();
  const first = addCatalogToWishlist(s, catalogTeam('source'));
  const writes = s.writes;
  assert.equal(addCatalogToWishlist(s, catalogTeam('source')).id, first.id);
  assert.equal(s.writes, writes);
  const other = addCatalogToWishlist(s, catalogTeam('other'));
  const changed = {
    ...first,
    name: 'Edited',
    members: first.members.map((m, i) => (i ? m : { ...m, set: 'raw set' })),
    sources: [
      { name: 'Source', pasteUrl: 'https://pokepast.es/abcdef1234567890' },
    ],
  };
  saveTeam(s, changed);
  const before = readSavedTeams(s).find((x) => x.id === first.id);
  const promoted = useWishlistedTeam(s, first.id);
  assert.deepEqual(orderedWishlist(readSavedTeams(s)), [other]);
  assert.equal(promoted.collection, 'my-teams');
  assert.equal(promoted.id, first.id);
  assert.deepEqual(promoted.original, before.original);
  assert.deepEqual(promoted.members, before.members);
  assert.deepEqual(promoted.sources, before.sources);
  assert.equal(useWishlistedTeam(s, first.id).name, 'Edited');
  assert.equal(
    readSavedTeams(s).find((x) => x.id === other.id).collection,
    'wishlist'
  );
  assert.throws(
    () => removeWishlistedTeam(s, first.id),
    /no longer in Wishlist/
  );
});

test('catalog Use promotes bookmarks and preserves independent repeated copies', () => {
  const s = storage();
  const bookmark = addCatalogToWishlist(s, catalogTeam('catalog'));
  assert.equal(useCatalogTeam(s, catalogTeam('catalog')).id, bookmark.id);
  const first = useCatalogTeam(s, catalogTeam('unbookmarked'));
  const second = useCatalogTeam(s, catalogTeam('unbookmarked'));
  assert.notEqual(first.id, second.id);
  assert.throws(() => useWishlistedTeam(s, 'absent'), /no longer saved/);
  assert.throws(
    () => removeWishlistedTeam(s, bookmark.id),
    /no longer in Wishlist/
  );
  const result = removeWishlistedTeam(s, 'absent');
  assert.equal(result.length, 3);
  assert.equal(removeWishlistedTeam(s, 'absent').length, result.length);
});

test('collection changes preserve the catalog team and its saved original', () => {
  const s = storage();
  const source = {
    ...catalogTeam('catalog', 'Original name'),
    creator: 'Original creator',
    pasteUrl,
  };
  const baseline = structuredClone(source);
  const assertOriginal = () => {
    assert.deepEqual(source, baseline);
    assert.deepEqual(readSavedTeams(s)[0].original, baseline);
  };

  const bookmark = addCatalogToWishlist(s, source);
  assertOriginal();
  const promoted = useCatalogTeam(s, source);
  assert.equal(promoted.id, bookmark.id);
  assertOriginal();

  saveTeam(s, {
    ...promoted,
    name: 'Edited name',
    members: promoted.members.map((member, index) =>
      index ? member : { ...member, item: 'Edited item' }
    ),
  });
  const edited = readSavedTeams(s)[0];
  assert.equal(edited.name, 'Edited name');
  assert.equal(edited.members[0].item, 'Edited item');
  assertOriginal();

  const beforeMove = s.data;
  assert.throws(
    () =>
      moveInUseTeamToWishlist(
        s,
        edited.id,
        canonicalSnapshot({ name: edited.name, members: edited.members })
      ),
    (error) =>
      error instanceof SavedTeamError &&
      /only holds original teams/.test(error.message)
  );
  assert.equal(s.data, beforeMove);
  assertOriginal();
  assert.equal(wishlistedCatalogEntries(readSavedTeams(s), source).length, 0);
  const fresh = useCatalogTeam(s, source);
  assert.notEqual(fresh.id, edited.id);
  assert.deepEqual(fresh.members, fresh.original.members);
  assert.deepEqual(source, baseline);
});

test('invalid collection, corrupt storage, quota, and capacity preserve existing data', () => {
  const invalid = storage([{ ...snapshot('bad'), collection: 'lost' }]);
  const raw = invalid.data;
  assert.throws(() => readSavedTeams(invalid));
  assert.equal(invalid.data, raw);
  const quota = storage();
  quota.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(() => addCatalogToWishlist(quota, catalogTeam('x')), /quota/);
  const full = storage(
    Array.from({ length: 50 }, (_, i) => snapshot(String(i)))
  );
  const fullRaw = full.data;
  assert.throws(() => addCatalogToWishlist(full, catalogTeam('x')));
  assert.equal(full.data, fullRaw);
  const corrupt = storage();
  corrupt.data = '{';
  assert.throws(() => readSavedTeams(corrupt));
});

test('search uses exact, prefix, substring, subsequence tiers, AND terms, and stable ties', () => {
  const teams = names(
    'weavile',
    'weavile squad',
    'good weavile group',
    'w x e x a x v x i x l x e',
    'rotom'
  );
  teams[4].members[0].pokemon = 'Rotom-Wash';
  teams[4].members[1].pokemon = 'Weavile';
  const ranked = rankSavedTeams(teams, 'weavile');
  assert.deepEqual(
    ranked.map((x) => x.id),
    ['0', '4', '1', '2', '3']
  );
  assert.deepEqual(
    rankSavedTeams(teams, 'wv').map((x) => x.id),
    ['0', '1', '2', '3', '4']
  );
  assert.deepEqual(
    rankSavedTeams(teams, 'weavile rotom').map((x) => x.id),
    ['4']
  );
  assert.deepEqual(rankSavedTeams(teams, '!!!'), teams);
  assert.deepEqual(rankSavedTeams(teams, 'nomatch'), []);
});

const wish = (id, roster) => ({
  ...snapshot(id, id, roster),
  collection: 'wishlist',
});
const failing = (teams) => {
  const s = storage(teams);
  s.setItem = () => {
    throw new Error('quota');
  };
  return s;
};

const teamBaseline = (team) =>
  canonicalSnapshot({ name: team.name, members: team.members });

test('moving a renamed team to Wishlist and back keeps its saved record and latest sources', () => {
  const initial = snapshot('team', 'Original name');
  const edited = {
    ...initial,
    name: 'Edited name',
    original: { ...initial.original, pasteUrl },
    sources: [{ name: 'Original source', pasteUrl }],
  };
  const s = storage([edited]);
  s.active = edited.id;
  const baseline = teamBaseline(readSavedTeams(s)[0]);
  saveTeam(s, {
    ...readSavedTeams(s)[0],
    sources: [{ name: 'Updated source', pasteUrl, note: 'Keep this note' }],
  });
  const latest = readSavedTeams(s)[0];
  const moved = moveInUseTeamToWishlist(s, edited.id, baseline);
  assert.deepEqual(moved, { ...latest, collection: 'wishlist' });
  assert.equal(s.active, edited.id);
  assert.deepEqual(readSavedTeams(s), [moved]);
  const promoted = useWishlistedTeam(s, edited.id);
  assert.deepEqual(promoted, { ...latest, collection: 'my-teams' });
  assert.deepEqual(readSavedTeams(s), [promoted]);
});

test('moving rejects missing, already moved, renamed, and edited live teams without writing', () => {
  const initial = snapshot('team');
  const baseline = teamBaseline(readSavedTeams(storage([initial]))[0]);
  const editedMembers = initial.members.map((m, i) =>
    i ? m : { ...m, item: 'Changed elsewhere' }
  );
  const cases = [
    { id: 'missing', team: initial },
    { id: initial.id, team: { ...initial, collection: 'wishlist' } },
    { id: initial.id, team: { ...initial, name: 'Changed elsewhere' } },
    { id: initial.id, team: { ...initial, members: editedMembers } },
  ];
  for (const { id, team } of cases) {
    const s = storage([team]);
    const before = s.data;
    assert.throws(
      () => moveInUseTeamToWishlist(s, id, baseline),
      (error) =>
        error instanceof SavedTeamError &&
        /changed elsewhere/.test(error.message)
    );
    assert.equal(s.data, before);
    assert.equal(s.writes, 0);
  }
});

test('moving rejects Wishlist copies by original ID or nonempty source URL without merging edits', () => {
  const initial = snapshot('team');
  const target = { ...initial, original: { ...initial.original, pasteUrl } };
  const byId = {
    ...wish('by-id'),
    original: { ...wish('by-id').original, id: target.original.id },
  };
  const byUrl = {
    ...wish('by-url'),
    original: { ...wish('by-url').original, pasteUrl },
  };
  for (const duplicate of [byId, byUrl]) {
    const s = storage([target, duplicate]);
    const before = s.data;
    const baseline = teamBaseline(readSavedTeams(s)[0]);
    assert.throws(
      () => moveInUseTeamToWishlist(s, target.id, baseline),
      (error) =>
        error instanceof SavedTeamError &&
        /already in Wishlist/.test(error.message)
    );
    assert.equal(s.data, before);
    assert.equal(s.writes, 0);
  }
  const unrelated = wish('unrelated');
  const inUseCopy = { ...snapshot('copy'), original: initial.original };
  const s = storage([initial, unrelated, inUseCopy]);
  const before = readSavedTeams(s);
  const moved = moveInUseTeamToWishlist(s, initial.id, teamBaseline(before[0]));
  assert.deepEqual(moved, { ...before[0], collection: 'wishlist' });
  assert.deepEqual(readSavedTeams(s).slice(0, 2), [before[1], before[2]]);
});

test('moving at the record limit succeeds and quota failures keep existing bytes', () => {
  const teams = Array.from({ length: 50 }, (_, index) =>
    snapshot(`team-${index}`)
  );
  const s = storage(teams);
  const original = readSavedTeams(s)[0];
  const moved = moveInUseTeamToWishlist(s, original.id, teamBaseline(original));
  assert.deepEqual(moved, { ...original, collection: 'wishlist' });
  assert.equal(readSavedTeams(s).length, 50);
  assert.deepEqual(useWishlistedTeam(s, original.id), {
    ...original,
    collection: 'my-teams',
  });
  assert.equal(readSavedTeams(s).length, 50);

  const quota = failing([teams[0]]);
  const before = quota.data;
  assert.throws(
    () => moveInUseTeamToWishlist(quota, original.id, teamBaseline(original)),
    /quota/
  );
  assert.equal(quota.data, before);
});

test('requested, active and fallback IDs never resolve to Wishlist or Saved entries', () => {
  const fav = (id) => ({ ...snapshot(id), collection: 'saved' });
  const w1 = wish('w1'),
    w2 = wish('w2'),
    f1 = fav('f1'),
    f2 = fav('f2');
  const list = [w1, f1, snapshot('a'), w2, f2, snapshot('b')];
  assert.equal(resolveSavedTeamId(list, 'w1', null), 'a');
  assert.equal(resolveSavedTeamId(list, 'f1', null), 'a');
  assert.equal(resolveSavedTeamId(list, null, 'f2'), 'a');
  assert.equal(resolveSavedTeamId(list, 'f1', 'w2'), 'a');
  assert.equal(resolveSavedTeamId(list, 'b', 'f2'), 'b');
  assert.equal(resolveSavedTeamId([w1, f1], null, 'f1'), null);
  assert.equal(resolveSavedTeamId([], null, null), null);
});

test('bookmarking leaves existing My Teams copies untouched and stays idempotent', () => {
  const s = storage();
  const copy = useCatalogTeam(s, catalogTeam('source'));
  const copyBefore = JSON.stringify(
    readSavedTeams(s).find((x) => x.id === copy.id)
  );
  const bookmark = addCatalogToWishlist(s, catalogTeam('source'));
  assert.notEqual(bookmark.id, copy.id);
  assert.equal(bookmark.collection, 'wishlist');
  const afterAdd = s.data;
  const writes = s.writes;
  assert.equal(addCatalogToWishlist(s, catalogTeam('source')).id, bookmark.id);
  assert.equal(s.data, afterAdd);
  assert.equal(s.writes, writes);
  const saved = readSavedTeams(s);
  assert.equal(saved.length, 2);
  assert.equal(JSON.stringify(saved.find((x) => x.id === copy.id)), copyBefore);
  assert.equal(saved.find((x) => x.id === copy.id).collection, undefined);
});

test('removing a bookmark deletes only it with one write; absent IDs write nothing', () => {
  const s = storage([snapshot('keep'), wish('w1'), wish('w2')]);
  assert.deepEqual(
    removeWishlistedTeam(s, 'w1').map((x) => x.id),
    ['keep', 'w2']
  );
  assert.equal(s.writes, 1);
  assert.deepEqual(
    readSavedTeams(s).map((x) => x.id),
    ['keep', 'w2']
  );
  const raw = s.data;
  assert.deepEqual(
    removeWishlistedTeam(s, 'w1').map((x) => x.id),
    ['keep', 'w2']
  );
  assert.equal(s.writes, 1);
  assert.equal(s.data, raw);
});

test('quota failure during promotion or removal leaves stored bytes unchanged', () => {
  const s = failing([snapshot('keep'), wish('w1')]);
  const raw = s.data;
  assert.throws(() => useWishlistedTeam(s, 'w1'), /quota/);
  assert.throws(() => useCatalogTeam(s, catalogTeam('w1')), /quota/);
  assert.throws(() => removeWishlistedTeam(s, 'w1'), /quota/);
  assert.equal(s.data, raw);
  assert.equal(readSavedTeams(s)[1].collection, 'wishlist');
});

test('Poképaste import saves a custom Wishlist record and never changes the active team', () => {
  const s = storage();
  s.active = 'active-team';
  const saved = addPokepasteToWishlist(s, payload, 'M-C', []);
  assert.equal(saved.collection, 'wishlist');
  assert.equal(saved.origin, 'custom');
  assert.equal(saved.original.pasteUrl, pasteUrl);
  assert.equal(saved.original.regulation, 'M-C');
  assert.deepEqual(saved.sources, [{ name: payload.title, pasteUrl }]);
  assert.match(saved.original.paste, /^Ace \(Weavile\) @ Item/m);
  assert.match(saved.original.paste, /^Shiny: Yes$/m);
  assert.equal(saved.members[0].spread, '32 HP / 32 Atk / 1 Spe');
  assert.deepEqual(readSavedTeams(s), [saved]);
  assert.equal(s.getItem(activeTeamKey), 'active-team');
  assert.equal(s.writes, 1);
});

test('duplicate Poképaste import re-reads and preserves edited Wishlist bytes', () => {
  const s = storage();
  const original = addPokepasteToWishlist(s, payload, 'M-C', []);
  const edited = {
    ...original,
    name: 'Edited name',
    members: original.members.map((member, i) =>
      i ? member : { ...member, item: 'Edited item' }
    ),
    sources: [{ ...original.sources[0], note: 'Retained source note' }],
  };
  saveTeam(s, edited);
  const before = s.data;
  const writes = s.writes;
  const result = addPokepasteToWishlist(
    s,
    { ...payload, title: 'Different title', paste: 'not a team' },
    'M-A',
    []
  );
  assert.deepEqual(result, readSavedTeams(s)[0]);
  assert.equal(result.id, original.id);
  assert.equal(result.name, 'Edited name');
  assert.equal(result.members[0].item, 'Edited item');
  assert.equal(result.sources[0].note, 'Retained source note');
  assert.equal(s.data, before);
  assert.equal(s.writes, writes);
  const ambiguousCatalog = [
    { ...catalogTeam('first'), pasteUrl },
    { ...catalogTeam('second'), pasteUrl },
  ];
  assert.deepEqual(
    addPokepasteToWishlist(s, payload, 'M-C', ambiguousCatalog),
    result
  );
  assert.equal(s.data, before);
  assert.equal(s.writes, writes);
});

test('ambiguous catalog Poképaste imports fail without writing', () => {
  const catalog = [
    { ...catalogTeam('first'), pasteUrl },
    { ...catalogTeam('second'), pasteUrl },
  ];
  const s = storage([snapshot('keep')]);
  s.active = 'keep';
  const before = s.data;

  assert.throws(
    () => addPokepasteToWishlist(s, payload, 'M-C', catalog),
    (error) =>
      error instanceof SavedTeamError &&
      /Multiple catalog teams/.test(error.message)
  );
  assert.equal(s.data, before);
  assert.equal(s.active, 'keep');
  assert.equal(s.writes, 0);
});

test('Poképaste catalog matches keep the catalog snapshot and My teams copy independent', () => {
  const team = {
    ...catalogTeam('published', 'Published team'),
    regulation: 'M-A',
    pasteUrl,
    reports: [
      { event: 'Tournament', rank: '1st', sourceUrl: 'https://example.com' },
    ],
  };
  const s = storage();
  const inUse = useCatalogTeam(s, team);
  const before = JSON.stringify(readSavedTeams(s)[0]);
  assert.deepEqual(wishlistedCatalogEntries(readSavedTeams(s), team), []);
  const bookmark = addPokepasteToWishlist(s, payload, 'M-C', [team]);
  assert.notEqual(bookmark.id, inUse.id);
  assert.equal(bookmark.origin, 'catalog');
  assert.equal(bookmark.collection, 'wishlist');
  assert.deepEqual(bookmark.original, team);
  assert.deepEqual(bookmark.sources, [{ name: team.name, pasteUrl }]);
  assert.equal(
    JSON.stringify(readSavedTeams(s).find((x) => x.id === inUse.id)),
    before
  );
  assert.deepEqual(wishlistedCatalogEntries(readSavedTeams(s), team), [
    bookmark,
  ]);
});

test('a Poképaste in My teams never counts as an existing Wishlist copy', () => {
  const s = storage();
  const bookmark = addPokepasteToWishlist(s, payload, 'M-C', []);
  const inUse = useWishlistedTeam(s, bookmark.id);
  const before = JSON.stringify(readSavedTeams(s)[0]);
  const fresh = addPokepasteToWishlist(s, payload, 'M-C', []);
  assert.notEqual(fresh.id, inUse.id);
  assert.equal(fresh.collection, 'wishlist');
  assert.equal(
    JSON.stringify(readSavedTeams(s).find((entry) => entry.id === inUse.id)),
    before
  );
});

test('catalog source ID matching preserves an existing bookmark when its URL changes', () => {
  const s = storage();
  const oldTeam = {
    ...catalogTeam('published'),
    pasteUrl: 'https://pokepast.es/1111111111111111',
  };
  const existing = addCatalogToWishlist(s, oldTeam);
  const before = s.data;
  const writes = s.writes;
  const currentTeam = { ...oldTeam, pasteUrl };
  const result = addPokepasteToWishlist(s, payload, 'M-C', [currentTeam]);
  assert.equal(result.id, existing.id);
  assert.equal(s.data, before);
  assert.equal(s.writes, writes);
});

test('catalog Use promotes an imported bookmark by source URL without replacing edits', () => {
  const s = storage();
  const imported = addPokepasteToWishlist(s, payload, 'M-C', []);
  saveTeam(s, {
    ...imported,
    name: 'Edited import',
    members: imported.members.map((member, i) =>
      i ? member : { ...member, item: 'Edited item' }
    ),
  });
  const team = { ...catalogTeam('catalog'), pasteUrl };
  const before = readSavedTeams(s)[0];
  assert.notEqual(before.original.id, team.id);
  assert.equal(wishlistedCatalogEntries([before], team)[0].id, before.id);
  assert.equal(addCatalogToWishlist(s, team).id, before.id);
  const promoted = useCatalogTeam(s, team);
  assert.deepEqual(promoted, { ...before, collection: 'my-teams' });
  assert.deepEqual(wishlistedCatalogEntries(readSavedTeams(s), team), []);
});

test('catalog matching ignores empty and noncanonical URLs and rejects multiple Wishlist copies', () => {
  const team = { ...catalogTeam('catalog'), pasteUrl };
  const byId = {
    ...wish('id-copy'),
    original: { ...wish('id-copy').original, id: team.id },
  };
  const byUrl = {
    ...wish('url-copy'),
    original: { ...wish('url-copy').original, pasteUrl },
  };
  const s = storage([
    byId,
    byUrl,
    { ...snapshot('in-use'), original: { ...byUrl.original } },
  ]);
  const before = s.data;
  const entries = (t) => wishlistedCatalogEntries(readSavedTeams(s), t);
  assert.deepEqual(
    entries(team).map((e) => e.id),
    ['id-copy', 'url-copy']
  );
  assert.throws(
    () => useCatalogTeam(s, team),
    (error) =>
      error instanceof SavedTeamError &&
      /Multiple copies are in Wishlist/.test(error.message)
  );
  assert.equal(s.data, before);
  assert.equal(s.writes, 0);
  const other = { ...catalogTeam('other'), pasteUrl: '' };
  assert.deepEqual(entries(other), []);
  const bad = { ...other, pasteUrl: 'not a canonical URL' };
  const badEntry = {
    ...byUrl,
    original: { ...byUrl.original, pasteUrl: bad.pasteUrl },
  };
  assert.deepEqual(wishlistedCatalogEntries([badEntry], bad), []);
  const vrUrl = 'https://www.vrpastes.com/AbC12345';
  const vrEntry = {
    ...byUrl,
    original: { ...byUrl.original, pasteUrl: vrUrl },
  };
  assert.equal(
    wishlistedCatalogEntries([vrEntry], { ...other, pasteUrl: vrUrl })[0].id,
    byUrl.id
  );
});

test('Poképaste import failures leave saved bytes untouched', () => {
  const initial = [snapshot('keep')];
  const s = storage(initial);
  const before = s.data;
  const bad = { ...payload, paste: 'not a team' };
  assert.throws(() => addPokepasteToWishlist(s, bad, 'M-C', []), /six sets/);
  assert.equal(s.data, before);
  assert.equal(s.writes, 0);
  const quota = failing(initial);
  assert.throws(
    () => addPokepasteToWishlist(quota, payload, 'M-C', []),
    /quota/
  );
  assert.equal(quota.data, before);
  const full = storage(Array.from({ length: 50 }, (_, i) => snapshot(`t${i}`)));
  const fullBefore = full.data;
  assert.throws(() => addPokepasteToWishlist(full, payload, 'M-C', []));
  assert.equal(full.data, fullBefore);
  assert.equal(full.writes, 0);
});

test('at the 50-record cap promotion works but new bookmarks and copies fail untouched', () => {
  const full = [
    ...Array.from({ length: 49 }, (_, i) => snapshot(`t${i}`)),
    wish('w'),
  ];
  const s = storage(full);
  const raw = s.data;
  assert.throws(() => addCatalogToWishlist(s, catalogTeam('new')));
  assert.throws(() => useCatalogTeam(s, catalogTeam('new')));
  assert.equal(s.data, raw);
  assert.equal(s.writes, 0);
  const promoted = useCatalogTeam(s, catalogTeam('w'));
  assert.equal(promoted.id, 'w');
  assert.equal(promoted.collection, 'my-teams');
  const saved = readSavedTeams(s);
  assert.equal(saved.length, 50);
  assert.equal(teamsInUse(saved).length, 50);
  assert.equal(s.writes, 1);
});

test('empty query keeps order and search ignores originals and items', () => {
  const teams = names('alpha', 'beta');
  assert.equal(rankSavedTeams(teams, ''), teams);
  assert.equal(rankSavedTeams(teams, '   '), teams);
  const edited = structuredClone(teams[0]);
  edited.original.name = 'Original Hidden';
  for (const m of edited.original.members) m.pokemon = 'Garchomp';
  for (const m of edited.members) m.item = 'Choice Scarf';
  for (const q of ['garchomp', 'hidden', 'scarf'])
    assert.deepEqual(rankSavedTeams([edited], q), []);
  assert.equal(rankSavedTeams([edited], 'alpha')[0].id, edited.id);
});
