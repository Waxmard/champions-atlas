import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { normalize } from './catalog.ts';

export type NameKind = 'item' | 'ability' | 'move';

const generation = Generations.get(9);

const lookup: Record<NameKind, (id: ID) => string | undefined> = {
  item: (id) => generation.items.get(id)?.name,
  ability: (id) => generation.abilities.get(id)?.name,
  move: (id) => generation.moves.get(id)?.name,
};

export function canonicalName(kind: NameKind, value: string): string {
  return lookup[kind](normalize(value) as ID) ?? value;
}
