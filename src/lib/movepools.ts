import movepools from './data/movepools.json' with { type: 'json' };
import { normalize, pokemonId } from './catalog.ts';

const table = movepools as Record<string, string[]>;

export function movepoolFor(pokemon: string): string[] {
  return table[pokemonId(pokemon)] ?? table[normalize(pokemon)] ?? [];
}
