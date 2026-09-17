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

export interface TypeColor {
  bg: string;
  text: string;
}

export const TYPE_COLORS: Record<PokemonType, TypeColor> = {
  normal: { bg: '#A8A878', text: '#fff' },
  fire: { bg: '#F08030', text: '#fff' },
  water: { bg: '#6890F0', text: '#fff' },
  electric: { bg: '#F8D030', text: '#333' },
  grass: { bg: '#78C850', text: '#fff' },
  ice: { bg: '#98D8D8', text: '#333' },
  fighting: { bg: '#C03028', text: '#fff' },
  poison: { bg: '#A040A0', text: '#fff' },
  ground: { bg: '#E0C068', text: '#333' },
  flying: { bg: '#A890F0', text: '#fff' },
  psychic: { bg: '#F85888', text: '#fff' },
  bug: { bg: '#A8B820', text: '#fff' },
  rock: { bg: '#B8A038', text: '#fff' },
  ghost: { bg: '#705898', text: '#fff' },
  dragon: { bg: '#7038F8', text: '#fff' },
  dark: { bg: '#705848', text: '#fff' },
  steel: { bg: '#B8B8D0', text: '#333' },
  fairy: { bg: '#EE99AC', text: '#333' },
};

const typeData = rawData as {
  moves: Record<string, PokemonType>;
  pokemon: Record<string, PokemonType[]>;
};

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

export function getCardBackgroundStyle(pokemon: string): string {
  const types = getPokemonTypes(pokemon);
  const opacity = 0.15;

  if (types.length === 1) {
    const color = TYPE_COLORS[types[0]]?.bg || '#A8A878';
    return `background: linear-gradient(135deg, ${hexToRgba(color, opacity)} 0%, ${hexToRgba(color, opacity * 0.3)} 100%)`;
  }

  const color1 = TYPE_COLORS[types[0]]?.bg || '#A8A878';
  const color2 = TYPE_COLORS[types[1]]?.bg || color1;
  return `background: linear-gradient(135deg, ${hexToRgba(color1, opacity)} 0%, ${hexToRgba(color2, opacity)} 100%)`;
}
