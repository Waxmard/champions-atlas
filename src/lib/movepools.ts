import { Generations } from '@smogon/calc/dist/data/index.js';
import { battleSpecies } from './battle-forms.ts';
import { normalize, pokemonId } from './catalog.ts';
import movepools from './data/movepools.json' with { type: 'json' };

const table = movepools as {
  moves: Record<string, string[]>;
  abilities: Record<string, string[]>;
};
const generation = Generations.get(0);

function lookup(record: Record<string, string[]>, pokemon: string): string[] {
  return (
    record[normalize(pokemon)] ??
    record[pokemonId(pokemon)] ??
    record[normalize(battleSpecies(pokemon)?.name ?? '')] ??
    []
  );
}

export const movepoolFor = (pokemon: string) => lookup(table.moves, pokemon);

export const abilitiesFor = (pokemon: string) =>
  lookup(table.abilities, pokemon);

export function championsItemsFor(pokemon: string): string[] {
  const saved = battleSpecies(pokemon);
  if (!saved) return [];
  const savedKey = normalize(saved.name);
  const items: string[] = [];
  for (const item of generation.items) {
    if (
      !item.megaStone ||
      Object.entries(item.megaStone).some(
        ([base, mega]) =>
          normalize(base) === savedKey || normalize(mega) === savedKey
      )
    ) {
      items.push(item.name);
    }
  }
  return items.sort((a, b) => a.localeCompare(b));
}
