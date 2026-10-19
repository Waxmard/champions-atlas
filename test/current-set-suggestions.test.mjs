import assert from 'node:assert/strict';
import test from 'node:test';
import { pokemonId } from '../src/lib/catalog.ts';
import {
  currentSetsWouldChange,
  reuseCurrentSet,
} from '../src/lib/current-sets.ts';

function member(pokemon, changes = {}) {
  return {
    pokemon,
    item: 'Item',
    ability: 'Ability',
    moves: ['Protect', 'Fake Out'],
    nature: 'Adamant',
    spread: '32 HP / 32 Spe / 2 Atk',
    ...changes,
  };
}

function entry(value) {
  return { id: pokemonId(value.pokemon), member: value };
}

test('current-set availability compares complete snapshots by Browse identity', () => {
  const pikachu = member('Pikachu', {
    set: 'Pikachu set',
    metadata: { source: 'saved' },
  });
  const weavile = member('Weavile');
  const sets = [entry(pikachu), entry(weavile)];

  assert.equal(currentSetsWouldChange(sets, [structuredClone(pikachu)]), false);
  assert.equal(
    currentSetsWouldChange(sets, [
      structuredClone(weavile),
      structuredClone(pikachu),
    ]),
    false
  );
  assert.equal(currentSetsWouldChange(sets, []), false);
  assert.equal(currentSetsWouldChange(sets, [member('Eevee')]), true);

  const mawile = member('Mawile');
  const mega = member('Mawile-Mega', { item: 'Mawilite' });
  assert.equal(pokemonId(mawile.pokemon), pokemonId(mega.pokemon));
  assert.equal(currentSetsWouldChange([entry(mawile)], [mega]), true);

  assert.equal(
    currentSetsWouldChange(
      [entry(member('Gengar', { set: 'Original raw text' }))],
      [member('Gengar', { set: 'Changed raw text' })]
    ),
    true
  );
  assert.equal(
    currentSetsWouldChange(
      [entry(member('Snorlax', { metadata: { source: 'saved' } }))],
      [member('Snorlax', { metadata: { source: 'changed' } })]
    ),
    true
  );

  const floette = member('Floette');
  const eternal = member('Floette-Eternal');
  assert.equal(currentSetsWouldChange([entry(floette)], [eternal]), true);
  assert.equal(
    currentSetsWouldChange(
      [entry(floette), entry(eternal)],
      [floette, eternal]
    ),
    false
  );
});

test('in-game field choices preserve unrelated data and use normal text updates', () => {
  const current = member('Rotom-Wash', {
    item: 'Leftovers',
    ability: 'Levitate',
    moves: ['Protect', 'Will-O-Wisp'],
    nature: 'Bold',
    spread: '32 HP / 32 Def / 2 SpD',
    set: [
      'Bongo (Rotom-Wash) @ Leftovers  ',
      'EVs: 32 HP / 32 Def / 2 SpD   ',
      'Bold Nature',
      'IVs: 0 Atk',
      'Level: 50',
      'Tera Type: Ghost',
      '- Protect',
      '- Will-O-Wisp',
      'Hidden Power: Ice',
    ].join('\n'),
    metadata: { keep: true },
  });
  const saved = member('Rotom-Wash-Mega', {
    item: 'Choice Specs',
    ability: 'Different Ability',
    moves: ['Hydro Pump', 'Thunderbolt'],
    nature: 'Modest',
    spread: '32 SpA / 32 Spe / 2 HP',
    set: 'saved raw text\n- Hydro Pump',
    metadata: { replace: true },
  });
  const before = structuredClone(current);
  const savedBefore = structuredClone(saved);
  const item = reuseCurrentSet(current, saved, { kind: 'item' });
  const ability = reuseCurrentSet(current, saved, { kind: 'ability' });
  const nature = reuseCurrentSet(current, saved, { kind: 'nature' });
  const spread = reuseCurrentSet(current, saved, { kind: 'spread' });

  assert.equal(item.item, saved.item);
  assert.equal(item.ability, current.ability);
  assert.equal(item.nature, current.nature);
  assert.equal(item.spread, current.spread);
  assert.equal(ability.ability, saved.ability);
  assert.equal(ability.item, current.item);
  assert.equal(nature.nature, saved.nature);
  assert.equal(nature.spread, current.spread);
  assert.equal(spread.nature, saved.nature);
  assert.equal(spread.spread, saved.spread);
  for (const result of [item, ability, nature, spread]) {
    assert.deepEqual(result.moves, current.moves);
    assert.deepEqual(result.metadata, current.metadata);
    assert.notStrictEqual(result.metadata, current.metadata);
    assert.equal(
      result.set.split('\n')[0],
      result === item
        ? 'Bongo (Rotom-Wash) @ Choice Specs'
        : 'Bongo (Rotom-Wash) @ Leftovers'
    );
    assert.ok(result.set.split('\n').includes('Hidden Power: Ice'));
    assert.equal(result.set.split('\n').includes('IVs: 0 Atk'), false);
    assert.equal(result.set.split('\n').includes('Level: 50'), false);
    assert.equal(result.set.split('\n').includes('Tera Type: Ghost'), false);
  }
  assert.ok(item.set.includes('Choice Specs'));
  assert.ok(ability.set.includes('Ability: Different Ability'));
  assert.ok(nature.set.includes('Modest Nature'));
  assert.ok(spread.set.includes('EVs: 32 SpA / 32 Spe / 2 HP'));

  const full = reuseCurrentSet(current, saved, { kind: 'set' });
  assert.deepEqual(full, saved);
  assert.notStrictEqual(full, saved);
  assert.notStrictEqual(full.metadata, saved.metadata);
  assert.deepEqual(full, savedBefore);
  assert.deepEqual(saved, savedBefore);
  assert.deepEqual(current, before);
});

test('move choices preserve UI slot gaps before compacting for persistence', () => {
  const current = member('Weavile', {
    moves: ['Protect', '', 'Knock Off', ''],
    set: 'Bongo (Weavile)\n- Protect\n- Knock Off',
  });
  const saved = member('Weavile-Mega', { moves: ['Hydro Pump'] });
  const result = reuseCurrentSet(current, saved, {
    kind: 'move',
    index: 3,
    move: 'hydroPUMP',
  });

  assert.deepEqual(result.moves, ['Protect', 'Knock Off', 'hydroPUMP']);
  assert.deepEqual(
    result.set.split('\n').filter((line) => line.startsWith('- ')),
    ['- Protect', '- Knock Off', '- hydroPUMP']
  );
  for (const invalid of [
    { kind: 'move', index: -1, move: 'Hydro Pump' },
    { kind: 'move', index: 4, move: 'Hydro Pump' },
    { kind: 'move', index: 1.5, move: 'Hydro Pump' },
    { kind: 'move', index: 3, move: 'Thunderbolt' },
  ]) {
    assert.throws(() => reuseCurrentSet(current, saved, invalid), {
      message: 'Invalid in-game move choice.',
    });
  }
  assert.throws(
    () =>
      reuseCurrentSet(member('Floette'), member('Floette-Eternal'), {
        kind: 'item',
      }),
    /does not match/
  );
});
