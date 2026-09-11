import assert from 'node:assert/strict';
import test from 'node:test';
import {
  differences,
  exportPaste,
  matchesLocks,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  similarTeams,
  storageKey,
  useCandidate,
} from '../src/lib/workbench.ts';
import { parsePaste } from '../src/lib/paste.ts';

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

test('similarity applies every lock, ranks shared species before details/results, and never rewards unknowns', () => {
  const saved = newSavedTeam(team(), 'M-C');
  saved.locks = [
    {
      pokemon: 'Pokemon0',
      item: 'Item',
      ability: 'Ability',
      moves: ['Protect', 'Fake Out'],
    },
  ];
  const close = team('close', 'M-C');
  close.members[5] = member('New');
  const less = team('less', 'M-C');
  less.members[4] = member('Other');
  less.members[5] = member('Another');
  less.reports = [{ event: 'Worlds', rank: 'Champion', sourceUrl: '' }];
  const invalid = team('invalid', 'M-C');
  invalid.members[0].item = 'Different';
  const unknown = team('unknown', 'M-C');
  unknown.members[0].moves = [];
  assert.deepEqual(
    similarTeams(saved, [less, invalid, unknown, close, team()], 'M-C').map(
      ({ team }) => team.id
    ),
    ['close', 'less']
  );
  assert.equal(matchesLocks(invalid, saved.locks), false);
  assert.equal(matchesLocks(unknown, saved.locks), false);
  const equal = team('equal', 'M-C');
  equal.members = [...close.members].reverse();
  equal.reports = less.reports;
  assert.equal(similarTeams(saved, [close, equal], 'M-C')[0].team.id, 'equal');
});

test('candidate copies preserve immutable original, retain sources, enforce locks, and export raw extra fields', () => {
  const source = team();
  source.members[0].set =
    'Nickname (Pokemon0) @ Item\nAbility: Ability\nIVs: 0 Atk\nEVs: 32 HP\nAdamant Nature\n- Protect\n- Fake Out';
  const saved = newSavedTeam(source, 'M-C');
  const snapshot = JSON.stringify(saved.original);
  const candidate = team('candidate', 'M-C');
  candidate.pasteUrl = 'https://pokepast.es/1111111111111111';
  candidate.members[0].set = source.members[0].set;
  candidate.members[5] = member('Replacement');
  const edited = useCandidate(saved, candidate);
  edited.members[1].item = 'Changed';
  assert.equal(JSON.stringify(saved.original), snapshot);
  assert.equal(JSON.stringify(edited.original), snapshot);
  assert.equal(saved.members[1].item, 'Item');
  assert.equal(candidate.members[1].item, 'Item');
  assert.equal(edited.sources.length, 2);
  assert.equal(useCandidate(edited, candidate).sources.length, 2);
  const paste = exportPaste(edited.members);
  assert.match(paste, /Nickname \(Pokemon0\)/);
  assert.match(paste, /IVs: 0 Atk/);
  assert.equal(parsePaste(paste).length, 6);
  saved.locks = [{ pokemon: 'Pokemon5', item: '', ability: '', moves: [] }];
  assert.throws(() => useCandidate(saved, candidate), /locks/);
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
  const first = newSavedTeam(team(), 'M-C');
  saveTeam(storage, first);
  const second = newSavedTeam(team('second'), 'M-C');
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
