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

export function typeBand(types: readonly PokemonType[]): string {
  const first = types[0];
  const last = types[types.length - 1] ?? first;
  if (!first) return '';
  return `linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[first]} 24%, var(--color-base-100)), color-mix(in oklab, ${TYPE_COLORS[last]} 24%, var(--color-base-100)))`;
}

export function typeFill(type: PokemonType | null): string {
  return type
    ? `background: linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[type]} 28%, var(--color-base-100)) 0%, color-mix(in oklab, ${TYPE_COLORS[type]} 16%, var(--color-base-100)) 100%); border: 1px solid color-mix(in oklab, ${TYPE_COLORS[type]} 38%, var(--color-base-300));`
    : 'background: var(--color-base-200); border: 1px solid var(--color-base-300);';
}

export function typeRowWash(type: PokemonType | null): string {
  return type
    ? `linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[type]} 14%, transparent) 0%, color-mix(in oklab, ${TYPE_COLORS[type]} 6%, transparent) 100%)`
    : '';
}

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
