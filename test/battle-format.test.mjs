import assert from 'node:assert/strict';
import test from 'node:test';
import {
  battleFormatKey,
  parseBattleFormat,
  readBattleFormat,
  teamFormat,
  writeBattleFormat,
} from '../src/lib/battle-format.ts';

const storing = (raw) => ({ getItem: () => raw });

test('missing, unreadable and malformed settings read as doubles', () => {
  const fallback = { format: 'doubles', at: 0 };
  for (const raw of [
    null,
    '{',
    '"singles"',
    '{"format":"triples","at":1}',
    '{"format":"singles"}',
  ])
    assert.deepEqual(readBattleFormat(storing(raw)), fallback);
  assert.deepEqual(
    readBattleFormat({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
    fallback
  );
});

test('a written setting reads back and unknown formats are rejected', () => {
  let raw = null;
  writeBattleFormat(
    {
      setItem(key, value) {
        assert.equal(key, battleFormatKey);
        raw = value;
      },
    },
    { format: 'singles', at: 5 }
  );
  assert.deepEqual(readBattleFormat(storing(raw)), {
    format: 'singles',
    at: 5,
  });
  assert.throws(() => parseBattleFormat({ format: 'triples', at: 1 }));
  assert.deepEqual(parseBattleFormat({ format: 'singles', at: 2, extra: 1 }), {
    format: 'singles',
    at: 2,
  });
});

test('only an explicit singles marker makes a singles team', () => {
  assert.equal(teamFormat({}), 'doubles');
  assert.equal(teamFormat({ format: 'singles' }), 'singles');
  assert.equal(teamFormat({ format: 'other' }), 'doubles');
});
