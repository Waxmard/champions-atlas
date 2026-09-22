import { base } from '$app/paths';
import { normalize } from '$lib/catalog';
import rawData from '$lib/data/pokemon-types.json';

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
  return `${base}/types/${type.toLowerCase()}.svg`;
}

export function getMoveType(move: string): PokemonType | null {
  const key = normalize(move);
  return typeData.moves[key] || null;
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
