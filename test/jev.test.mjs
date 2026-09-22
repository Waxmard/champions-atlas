import assert from 'node:assert/strict';
import test from 'node:test';
import { post, questionsFor, stateOf, tagOf } from '../scripts/jev-enrich.mjs';
import { invariantViolations } from '../scripts/jev-eval.mjs';

const member = (moves, ability = null) => ({
  pokemon: 'Absol',
  item: null,
  ability,
  nature: null,
  spread: null,
  moves,
});

test('jev asks one choice question per slot and reads answers back by id', () => {
  const questions = questionsFor([{}, {}, {}]);
  assert.deepEqual(Object.keys(questions), [
    'archetype',
    'speed_mode',
    'role_slot1',
    'role_slot2',
    'role_slot3',
  ]);
  assert.equal(questions.archetype.type, 'choice');
  assert.ok(questions.role_slot2.instructions.includes('slot 2'));

  assert.deepEqual(
    tagOf({
      model: 'jev-1.13.0',
      answers: {
        archetype: { choice: 'rain' },
        speed_mode: { choice: 'faster' },
        role_slot1: { choice: 'support' },
        role_slot2: { choice: 'other' },
      },
    }),
    {
      archetype: 'rain',
      speedMode: 'faster',
      roles: { 1: 'support', 2: 'other' },
    }
  );
  assert.equal(tagOf({ answers: { archetype: { choice: 'rain' } } }), null);
  assert.equal(tagOf(null), null);
});

test('jev state carries only the fields the questions need', () => {
  const state = stateOf({
    id: 't',
    regulation: 'M-C',
    members: [member(['Protect'])],
  });
  assert.equal(state.regulation, 'M-C');
  assert.deepEqual(state.team, [
    {
      slot: 1,
      species: 'Absol',
      item: null,
      ability: null,
      nature: null,
      spread: null,
      moves: ['Protect'],
    },
  ]);
});

test('structural invariants reject unsupported rain, Trick Room, and support claims', () => {
  const team = {
    id: 't',
    members: [
      member(['Follow Me']),
      member(['Rain Dance']),
      member(['Trick Room']),
      member(['Protect']),
    ],
  };
  const tag = (archetype, roles = {}) => ({
    archetype,
    speedMode: 'faster',
    roles,
  });
  assert.deepEqual(invariantViolations(team, tag('rain')), []);
  assert.deepEqual(invariantViolations(team, tag('trick_room')), []);
  assert.deepEqual(
    invariantViolations(team, tag('trick_room', { 1: 'support' })),
    []
  );
  assert.equal(
    invariantViolations(team, tag('rain', { 4: 'support' })).length,
    1
  );
  assert.equal(
    invariantViolations(team, tag('trick_room', { 3: 'support' })).length,
    1
  );
  assert.equal(
    invariantViolations(
      { id: 'u', members: [member(['Protect'])] },
      tag('rain')
    ).length,
    1
  );
});

test('jev retries throttling with retry-after and gives up on other errors', async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push([url, options.headers.Authorization]);
      if (calls.length < 3)
        return new Response('', {
          status: 429,
          headers: { 'retry-after': '0.01' },
        });
      return new Response(
        JSON.stringify({ model: 'jev-1.13.0', answers: {} }),
        {
          status: 200,
        }
      );
    };
    const answer = await post('secret', { state: 'x' });
    assert.equal(answer.model, 'jev-1.13.0');
    assert.deepEqual(calls, [
      ['https://api.typesafe.ai/v1/systemone', 'Bearer secret'],
      ['https://api.typesafe.ai/v1/systemone', 'Bearer secret'],
      ['https://api.typesafe.ai/v1/systemone', 'Bearer secret'],
    ]);

    globalThis.fetch = async () => new Response('', { status: 500 });
    await assert.rejects(() => post('secret', {}), /500/);
  } finally {
    globalThis.fetch = original;
  }
});
