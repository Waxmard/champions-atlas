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

export function getCardBackgroundStyle(pokemon: string, muted = false): string {
  const types = getPokemonTypes(pokemon);
  const opacity = muted ? 0.06 : 0.15;
  if (types.length === 1) {
    const color = TYPE_COLORS[types[0]] || '#A8A878';
    return `background: linear-gradient(135deg, ${hexToRgba(color, opacity)} 0%, ${hexToRgba(color, opacity * 0.3)} 100%)`;
  }

  const color1 = TYPE_COLORS[types[0]] || '#A8A878';
  const color2 = TYPE_COLORS[types[1]] || color1;
  return `background: linear-gradient(135deg, ${hexToRgba(color1, opacity)} 0%, ${hexToRgba(color2, opacity)} 100%)`;
}
