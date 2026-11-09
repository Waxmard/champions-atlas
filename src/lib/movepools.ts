import { Generations } from '@smogon/calc/dist/data/index.js';
import { battleSpecies } from './battle-forms.ts';
import { normalize, pokemonId } from './catalog.ts';
import movepools from './data/movepools.json' with { type: 'json' };

const table = movepools as {
  moves: Record<string, string[]>;
  abilities: Record<string, string[]>;
};
const generation = Generations.get(0);

export function movepoolFor(pokemon: string): string[] {
  return (
    table.moves[normalize(pokemon)] ??
    table.moves[pokemonId(pokemon)] ??
    table.moves[normalize(battleSpecies(pokemon)?.name ?? '')] ??
    []
  );
}

export function abilitiesFor(pokemon: string): string[] {
  return (
    table.abilities[normalize(pokemon)] ??
    table.abilities[pokemonId(pokemon)] ??
    table.abilities[normalize(battleSpecies(pokemon)?.name ?? '')] ??
    []
  );
}

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
