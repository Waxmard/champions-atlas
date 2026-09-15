import assert from 'node:assert/strict';
import test from 'node:test';
import {
  differences,
  exportPaste,
  replacementMembers,
  newCustomTeam,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  similarTeams,
  storageKey,
  useCandidate,
} from '../src/lib/workbench.ts';
import { parseCustomPaste, parsePaste } from '../src/lib/paste.ts';

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

test('default recommendations keep discovery ranking; selecting one slot yields builds and replacements from similar teams', () => {
  const saved = newSavedTeam(team());
  assert.equal(saved.changeSlot, null);
  const close = team('close', 'M-C');
  close.members[5] = member('New');
  close.members[0].item = 'Other item';
  const less = team('less', 'M-C');
  less.members[4] = member('Other');
  less.members[5] = member('Another');
  less.reports = [{ event: 'Worlds', rank: 'Champion', sourceUrl: '' }];
  assert.deepEqual(
    similarTeams(saved, [less, close, team()], 'M-C').map(
      ({ team }) => team.id
    ),
    ['close', 'less']
  );
  assert.throws(
    () => useCandidate(saved, similarTeams(saved, [close], 'M-C')[0]),
    /replacement/
  );
  saved.changeSlot = 0;
  const recommendations = similarTeams(saved, [less, close], 'M-C');
  assert.equal(recommendations[0].team.id, 'close');
  assert.equal(recommendations[0].member.pokemon, 'Pokemon0');
  assert.ok(
    recommendations.some(
      ({ member }) =>
        member.pokemon === 'Pokemon0' && member.item === 'Other item'
    )
  );
  assert.ok(recommendations.some(({ member }) => member.pokemon === 'New'));
  assert.ok(
    recommendations.every(
      ({ member }) =>
        !saved.members
          .slice(1)
          .some((other) => other.pokemon === member.pokemon)
    )
  );
  assert.throws(
    () => replacementMembers(saved, saved.members[1]),
    /another slot/
  );
  saved.changeSlot = 3;
  const next = useCandidate(saved, similarTeams(saved, [close], 'M-C')[0]);
  assert.deepEqual(
    next.members.filter((_, i) => i !== 3),
    saved.members.filter((_, i) => i !== 3)
  );
});

test('replacement changes only selected slot, preserves original and raw export fields, and deduplicates suggestions', () => {
  const source = team();
  source.members[0].set =
    'Nickname (Pokemon0) @ Item\nAbility: Ability\nIVs: 0 Atk\nEVs: 32 HP\nAdamant Nature\n- Protect\n- Fake Out';
  const saved = newSavedTeam(source);
  saved.changeSlot = 5;
  const snapshot = JSON.stringify(saved.original);
  const candidate = team('candidate', 'M-C');
  candidate.pasteUrl = 'https://pokepast.es/1111111111111111';
  candidate.members[5] = member('Replacement');
  candidate.members[1].item = 'Must not be applied';
  const recommendations = similarTeams(
    saved,
    [candidate, { ...candidate, id: 'duplicate' }],
    'M-C'
  );
  assert.equal(recommendations.length, 1);
  const edited = useCandidate(saved, recommendations[0]);
  assert.equal(JSON.stringify(saved.original), snapshot);
  assert.equal(JSON.stringify(edited.original), snapshot);
  assert.deepEqual(edited.members.slice(0, 5), saved.members.slice(0, 5));
  assert.equal(edited.members[5].pokemon, 'Replacement');
  assert.equal(saved.members[5].pokemon, 'Pokemon5');
  assert.equal(edited.sources.length, 2);
  assert.equal(useCandidate(edited, recommendations[0]).sources.length, 2);
  const paste = exportPaste(edited.members);
  assert.match(paste, /Nickname \(Pokemon0\)/);
  assert.doesNotMatch(paste, /IVs:/);
  assert.equal(parsePaste(paste).length, 6);
});

test('diff aligns species despite reordered slots, and distinguishes missing information from known changes', () => {
  const before = team().members;
  const after = structuredClone(before).reverse();
  assert.deepEqual(differences(before, after), []);
  after[0].item = null;
  after[1].moves = ['Protect'];
  after[2] = member('Replacement');
  const rows = differences(before, after);
  assert.ok(
    rows.some((row) => row.pokemon === 'Pokemon5' && row.after === 'Unknown')
  );
  assert.ok(
    rows.some((row) => row.field === 'Moves' && row.after === 'Protect')
  );
  assert.equal(rows.filter((row) => row.field === 'Pokémon').length, 2);
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
  first.name = 'Edited';
  saveTeam(storage, first);
  assert.equal(readSavedTeams(storage).length, 2);
  assert.equal(
    readSavedTeams(storage).find((team) => team.id === first.id).name,
    'Edited'
  );
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

test('old saved teams load without retaining obsolete locks or losing original and edits', () => {
  const saved = newSavedTeam(team());
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
  assert.throws(
    () =>
      readSavedTeams({
        getItem: () => JSON.stringify([{ ...saved, changeSlot: 6 }]),
      }),
    /untouched/
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

test('generateUUID falls back when crypto.randomUUID is undefined (insecure context)', () => {
  const original = crypto.randomUUID;
  try {
    delete crypto.randomUUID;
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
    crypto.randomUUID = original;
  }
});
