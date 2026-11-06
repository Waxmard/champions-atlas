import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';
import { normalize } from '#lib/catalog.js';
import rawData from '#lib/data/pokemon-types.json';

export type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy';

export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC',
};
const typeData = rawData as {
  moves: Record<string, PokemonType>;
  pokemon: Record<string, PokemonType[]>;
};

export function getTypeIcon(type: string): string {
  return asset(`types/${type.toLowerCase()}.svg` as AssetPath);
}

export function getMoveType(move: string): PokemonType | null {
  const key = normalize(move);
  return typeData.moves[key] || null;
}

export function getMoveSummary(move: string): string {
  const data = Generations.get(0).moves.get(normalize(move) as ID);
  if (!data) return '';
  return [data.category, data.basePower > 0 ? `${data.basePower} BP` : '']
    .filter(Boolean)
    .join(' · ');
}

export function getPokemonTypes(pokemon: string): PokemonType[] {
  const key = normalize(pokemon);
  if (typeData.pokemon[key]) return typeData.pokemon[key];

  // Try stripping mega/form suffixes if not found
  const baseKey = key
    .replace(/mega[a-z]?$/, '')
    .replace(/galar|alola|paldea|hisui/, '');
  if (typeData.pokemon[baseKey]) return typeData.pokemon[baseKey];

  return ['normal'];
}
