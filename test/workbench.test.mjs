import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteTeam,
  exportPaste,
  newCustomTeam,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  setText,
  storageKey,
} from '../src/lib/workbench.ts';
import {
  championsSpreadTotal,
  formatChampionsSpread,
  parseChampionsSpread,
  parseCustomPaste,
  parsePaste,
} from '../src/lib/paste.ts';

const member = (pokemon, item = 'Item') => ({
  pokemon,
  item,
  ability: 'Ability',
  nature: 'Adamant',
  spread: '32 HP',
  moves: ['Protect', 'Fake Out'],
});
const team = (id = 'original', regulation = 'M-B') => ({
  id,
  name: id,
  regulation,
  publishedAt: '2026-09-01',
  paste: null,
  pasteUrl: 'https://pokepast.es/0000000000000000',
  members: Array.from({ length: 6 }, (_, i) => member(`Pokemon${i}`)),
  reports: [],
});

test('saved team preserves original and raw export fields', () => {
  const source = team();
  source.members[0].set =
    'Nickname (Pokemon0) @ Item\nAbility: Ability\nIVs: 0 Atk\nEVs: 32 HP\nAdamant Nature\n- Protect\n- Fake Out';
  const saved = newSavedTeam(source);
  saved.changeSlot = 5;
  const snapshot = JSON.stringify(saved.original);
  saved.members[5] = member('Replacement');
  assert.equal(JSON.stringify(saved.original), snapshot);
  assert.equal(saved.members[5].pokemon, 'Replacement');
  const paste = exportPaste(saved.members);
  assert.match(paste, /Nickname \(Pokemon0\)/);
  assert.doesNotMatch(paste, /IVs:/);
  assert.equal(parsePaste(paste).length, 6);
});

test('saved teams round-trip, preserve other teams, and never overwrite corrupt or unavailable storage', () => {
  let value = null;
  const storage = {
    getItem: (key) => {
      assert.equal(key, storageKey);
      return value;
    },
    setItem: (_, next) => {
      value = next;
    },
  };
  const first = newSavedTeam(team());
  saveTeam(storage, first);
  const second = newSavedTeam(team('second'));
  saveTeam(storage, second);
  const vrSource = team('vr-source');
  vrSource.pasteUrl = 'https://www.vrpastes.com/qZK7HCqj';
  const vr = newSavedTeam(vrSource);
  const snapshot = structuredClone(vr.original.members);
  saveTeam(storage, vr);
  const reloaded = readSavedTeams(storage).find((saved) => saved.id === vr.id);
  assert.equal(reloaded.original.pasteUrl, vrSource.pasteUrl);
  assert.equal(reloaded.sources[0].pasteUrl, vrSource.pasteUrl);
  assert.deepEqual(reloaded.original.members, snapshot);
  for (const invalid of [
    'https://fakevrpastes.com/qZK7HCqj',
    'https://user@www.vrpastes.com/qZK7HCqj',
    'https://www.vrpastes.com/qZK7HCqj/extra',
    'https://www.vrpastes.com/qZK7HCqj\n',
  ]) {
    const bad = structuredClone(vr);
    bad.sources[0].pasteUrl = invalid;
    const before = value;
    assert.throws(() => saveTeam(storage, bad));
    assert.equal(value, before);
  }
  first.name = 'Edited';
  saveTeam(storage, first);
  assert.equal(readSavedTeams(storage).length, 3);
  assert.equal(
    readSavedTeams(storage).find((team) => team.id === first.id).name,
    'Edited'
  );
  const pochSource = {
    ...team('poch-source', 'Unknown'),
    pasteUrl: '',
    paste: null,
    reports: [
      {
        event: 'Sketch Academy Sunday Regulation M-C Tournament',
        rank: '2nd',
        sourceUrl: 'https://x.com/example/status/2106083996589555887',
      },
    ],
  };
  const poch = newSavedTeam(pochSource);
  saveTeam(storage, poch);
  const loadedPoch = readSavedTeams(storage).find(
    (saved) => saved.id === poch.id
  );
  assert.deepEqual(loadedPoch.original.reports, pochSource.reports);
  assert.deepEqual(loadedPoch.original.members, pochSource.members);
  assert.deepEqual(loadedPoch.sources, []);
  const originalSnapshot = JSON.stringify(loadedPoch.original);
  loadedPoch.members[2] = member('Replacement');
  loadedPoch.members[0].set = 'Edited set';
  assert.equal(JSON.stringify(loadedPoch.original), originalSnapshot);
  saveTeam(storage, loadedPoch);
  const reloadedPoch = readSavedTeams(storage).find(
    (saved) => saved.id === poch.id
  );
  assert.deepEqual(reloadedPoch.original.reports, pochSource.reports);
  assert.deepEqual(reloadedPoch.original.members, pochSource.members);
  assert.equal(reloadedPoch.members[2].pokemon, 'Replacement');
  assert.deepEqual(reloadedPoch.sources, []);
  const original = value;
  assert.throws(
    () =>
      saveTeam(
        {
          ...storage,
          setItem: () => {
            throw new Error('Quota exceeded');
          },
        },
        first
      ),
    /Quota/
  );
  assert.equal(value, original);
  value = '{broken';
  assert.throws(() => saveTeam(storage, first));
  assert.equal(value, '{broken');
  value = JSON.stringify([{ ...first, members: [] }]);
  assert.throws(() => readSavedTeams(storage), /untouched/);
});

test('saved Wishlist ranks are validated and protected from stale saves', () => {
  const existing = {
    ...newSavedTeam(team('ranked')),
    collection: 'wishlist',
    wishlistOrder: 7,
  };
  const inUse = {
    ...newSavedTeam(team('in-use')),
    collection: 'my-teams',
    wishlistOrder: 9,
  };
  let raw = JSON.stringify([existing, inUse]);
  let writes = 0;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => {
      raw = value;
      writes++;
    },
  };
  const stale = structuredClone(existing);
  delete stale.wishlistOrder;
  stale.original.name = 'Untrusted original';
  let saved = saveTeam(storage, stale).find(({ id }) => id === existing.id);
  assert.equal(saved.wishlistOrder, 7);
  assert.deepEqual(saved.original, existing.original);
  saved = saveTeam(storage, { ...stale, wishlistOrder: 3 }).find(
    ({ id }) => id === existing.id
  );
  assert.equal(saved.wishlistOrder, 7);
  saved = saveTeam(storage, { ...saved, collection: 'my-teams' }).find(
    ({ id }) => id === existing.id
  );
  assert.equal(Object.hasOwn(saved, 'wishlistOrder'), false);
  saved = saveTeam(storage, { ...existing, wishlistOrder: 3 }).find(
    ({ id }) => id === existing.id
  );
  assert.equal(Object.hasOwn(saved, 'wishlistOrder'), false);
  const fresh = {
    ...newSavedTeam(team('new')),
    collection: 'wishlist',
    wishlistOrder: 4,
  };
  saved = saveTeam(storage, fresh).find(({ id }) => id === fresh.id);
  assert.equal(Object.hasOwn(saved, 'wishlistOrder'), false);
  saved = saveTeam(storage, inUse).find(({ id }) => id === inUse.id);
  assert.equal(Object.hasOwn(saved, 'wishlistOrder'), false);
  const unchanged = raw;
  const writesBeforeErrors = writes;
  for (const wishlistOrder of [0.5, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    const invalid = JSON.stringify([{ ...existing, wishlistOrder }]);
    assert.throws(
      () => readSavedTeams({ getItem: () => invalid }),
      /untouched/
    );
    assert.throws(
      () => saveTeam(storage, { ...existing, wishlistOrder }),
      /untouched/
    );
  }
  for (const wishlistOrder of [
    Number.MIN_SAFE_INTEGER,
    0,
    Number.MAX_SAFE_INTEGER,
  ]) {
    const value = JSON.stringify([{ ...existing, wishlistOrder }]);
    assert.equal(
      readSavedTeams({ getItem: () => value })[0].wishlistOrder,
      wishlistOrder
    );
  }
  assert.equal(raw, unchanged);
  assert.equal(writes, writesBeforeErrors);
});

test('delete saved team preserves remaining teams and corrupt data', () => {
  const first = newSavedTeam(team('first'));
  const second = newSavedTeam(team('second'));
  let value = JSON.stringify([first, second]);
  const writes = [];
  const storage = {
    getItem: (key) => {
      assert.equal(key, storageKey);
      return value;
    },
    setItem: (key, next) => {
      assert.equal(key, storageKey);
      writes.push(next);
      value = next;
    },
  };

  assert.deepEqual(deleteTeam(storage, first.id), [second]);
  assert.deepEqual(JSON.parse(value), [second]);
  const writesBeforeMissing = writes.length;
  assert.deepEqual(deleteTeam(storage, 'missing'), [second]);
  assert.equal(writes.length, writesBeforeMissing);

  assert.deepEqual(deleteTeam(storage, second.id), []);
  assert.equal(value, '[]');
  assert.deepEqual(JSON.parse(value), []);

  value = '{broken';
  const writesBeforeCorrupt = writes.length;
  assert.throws(() => deleteTeam(storage, 'missing'));
  assert.equal(value, '{broken');
  assert.equal(writes.length, writesBeforeCorrupt);

  value = JSON.stringify([first, second]);
  const beforeFailedWrite = value;
  assert.throws(
    () =>
      deleteTeam(
        {
          ...storage,
          setItem: (key) => {
            assert.equal(key, storageKey);
            throw new Error('Quota exceeded');
          },
        },
        first.id
      ),
    /Quota exceeded/
  );
  assert.equal(value, beforeFailedWrite);
});

test('old saved teams load without retaining obsolete locks or losing original and edits', () => {
  const saved = newSavedTeam(team());
  saved.members[0].set =
    'Pokemon0 @ Item\nAbility: Ability\nLevel: 50\nTera Type: Fire\nIVs: 0 Atk\nEVs: 32 HP\nAdamant Nature\n- Protect';
  saved.original.members[0].set = saved.members[0].set;
  saved.original.paste = saved.members[0].set;
  saved.original.cachedAt = '2026-09-01T00:00:00Z';
  saved.members[0].flavor = 'keep-member';
  saved.sources[0].note = 'keep-source';
  const { changeSlot, ...old } = saved;
  assert.equal(changeSlot, null);
  const raw = JSON.stringify([
    {
      ...old,
      targetRegulation: 'M-C',
      locks: [{ pokemon: 'Pokemon0', item: '', ability: '', moves: [] }],
    },
  ]);
  assert.deepEqual(readSavedTeams({ getItem: () => raw }), [saved]);
  const loaded = readSavedTeams({ getItem: () => raw })[0];
  assert.equal(loaded.original.paste, saved.original.paste);
  assert.equal(loaded.original.cachedAt, '2026-09-01T00:00:00Z');
  assert.equal(loaded.members[0].flavor, 'keep-member');
  assert.equal(loaded.sources[0].note, 'keep-source');
  assert.match(loaded.original.paste, /Level: 50/);
  for (const text of [
    setText(loaded.members[0]),
    exportPaste(loaded.members),
    exportPaste(loaded.original.members),
  ]) {
    assert.doesNotMatch(text, /IVs:|Level:|Tera Type:/);
    assert.match(text, /Ability: Ability/);
    assert.match(text, /EVs: 32 HP/);
    assert.match(text, /- Protect/);
  }
  let stored = raw;
  const storage = {
    getItem: (key) => (key === storageKey ? stored : null),
    setItem: (_, next) => {
      stored = next;
    },
  };
  saveTeam(storage, loaded);
  const reloaded = readSavedTeams(storage)[0];
  assert.equal(reloaded.changeSlot, null);
  assert.equal(reloaded.original.cachedAt, '2026-09-01T00:00:00Z');
  assert.equal(reloaded.members[0].flavor, 'keep-member');
  assert.equal(reloaded.sources[0].note, 'keep-source');
  assert.equal(reloaded.original.paste, saved.original.paste);
  assert.throws(
    () =>
      readSavedTeams({
        getItem: () => JSON.stringify([{ ...saved, changeSlot: 6 }]),
      }),
    /untouched/
  );
});

test('saveTeam rejects empty-normalizing and duplicate species without touching storage', () => {
  let value = null;
  const storage = {
    getItem: (key) => {
      assert.equal(key, storageKey);
      return value;
    },
    setItem: (_, next) => {
      value = next;
    },
  };
  saveTeam(storage, newSavedTeam(team()));
  const original = value;

  const empty = newSavedTeam(team('empty'));
  empty.members[0].pokemon = '!!!';
  assert.throws(() => saveTeam(storage, empty), /untouched/);
  assert.equal(value, original);

  const duplicate = newSavedTeam(team('duplicate'));
  duplicate.members[0].pokemon = 'Pikachu';
  duplicate.members[1].pokemon = 'pikachu';
  assert.throws(() => saveTeam(storage, duplicate), /untouched/);
  assert.equal(value, original);
});

test('readSavedTeams rejects oversized and duplicate-ID storage', () => {
  const many = JSON.stringify(
    Array.from({ length: 51 }, (_, i) => newSavedTeam(team(`team${i}`)))
  );
  assert.throws(() => readSavedTeams({ getItem: () => many }), /untouched/);

  const a = newSavedTeam(team());
  const b = newSavedTeam(team());
  b.id = a.id;
  assert.throws(
    () => readSavedTeams({ getItem: () => JSON.stringify([a, b]) }),
    /Duplicate saved team IDs/
  );
});

test('custom teams validate paste and preserve independent snapshots and empty source metadata through storage', () => {
  const paste = Array.from(
    { length: 6 },
    (_, i) =>
      `Pokemon${i} @ Item\nAbility: Ability\nEVs: 32 HP\nAdamant Nature\n- One\n- Two\n- Three\n- Four`
  ).join('\n\n');
  const custom = newCustomTeam('  Mine  ', 'M-C', paste);
  assert.throws(() => newCustomTeam('  ', 'M-C', paste), /name/);
  assert.throws(
    () => newCustomTeam('Mine', 'M-C', paste.replace('EVs: 32 HP\n', '')),
    /missing EVs/
  );
  assert.equal(custom.name, 'Mine');
  assert.equal(custom.original.name, 'Mine');
  assert.equal(custom.original.id, custom.id);
  assert.equal(custom.original.pasteUrl, '');
  assert.deepEqual(custom.sources, []);
  assert.equal(parseCustomPaste(custom.original.paste).length, 6);
  custom.members[0].item = 'Changed';
  assert.equal(custom.original.members[0].item, 'Item');
  let raw = null;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => (raw = value),
  };
  saveTeam(storage, custom);
  assert.deepEqual(readSavedTeams(storage), [custom]);
  const invalid = { ...custom, sources: [{ name: 'No URL', pasteUrl: '' }] };
  assert.throws(() => saveTeam(storage, invalid), /untouched/);
});

test('generateUUID produces valid RFC4122 v4 UUID', () => {
  const team = newSavedTeam({
    id: 'test',
    name: 'Test',
    regulation: 'M-C',
    pasteUrl: '',
    members: [],
    paste: null,
  });
  assert.match(
    team.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test('generateUUID falls back when crypto.randomUUID is undefined (insecure context)', () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', {
    value: undefined,
    configurable: true,
  });
  try {
    assert.equal(typeof crypto.randomUUID, 'undefined');
    const team = newSavedTeam({
      id: 'test',
      name: 'Test',
      regulation: 'M-C',
      pasteUrl: '',
      members: [],
      paste: null,
    });
    assert.match(
      team.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
    else Reflect.deleteProperty(crypto, 'randomUUID');
    assert.equal(typeof crypto.randomUUID, 'function');
  }
});

test('strict Champions spreads parse, format, and total six ordered stats', () => {
  const spread = parseChampionsSpread(
    '2 Spe / 32 SpA / 0 Def / 32 HP / 0 SpD / 0 Atk'
  );
  assert.deepEqual(spread, {
    HP: 32,
    Atk: 0,
    Def: 0,
    SpA: 32,
    SpD: 0,
    Spe: 2,
  });
  assert.equal(formatChampionsSpread(spread), '32 HP / 32 SpA / 2 Spe');
  for (const total of [64, 65, 66, 67])
    assert.equal(championsSpreadTotal({ ...spread, HP: total - 34 }), total);
  for (const invalid of [
    '33 HP',
    '-1 HP',
    '1.5 HP',
    '1 HP / 2 HP',
    '1 Special',
  ])
    assert.equal(parseChampionsSpread(invalid), null);
});
