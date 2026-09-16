import { normalize, type Member } from './catalog.ts';

export const CHAMPIONS_STATS = [
  'HP',
  'Atk',
  'Def',
  'SpA',
  'SpD',
  'Spe',
] as const;
export type ChampionsStat = (typeof CHAMPIONS_STATS)[number];
export type ChampionsSpread = Record<ChampionsStat, number>;

export function parseChampionsSpread(
  spread: string | null
): ChampionsSpread | null {
  const values = Object.fromEntries(
    CHAMPIONS_STATS.map((stat) => [stat, 0])
  ) as ChampionsSpread;
  if (!spread?.trim()) return values;
  const seen = new Set<ChampionsStat>();
  for (const part of spread.split('/')) {
    const match = /^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i.exec(part.trim());
    const stat = CHAMPIONS_STATS.find(
      (candidate) => candidate.toLowerCase() === match?.[2].toLowerCase()
    );
    const value = Number(match?.[1]);
    if (!stat || seen.has(stat) || !Number.isInteger(value) || value > 32)
      return null;
    seen.add(stat);
    values[stat] = value;
  }
  return values;
}

export const formatChampionsSpread = (spread: ChampionsSpread) =>
  CHAMPIONS_STATS.filter((stat) => spread[stat] > 0)
    .map((stat) => `${spread[stat]} ${stat}`)
    .join(' / ');

export const championsSpreadTotal = (spread: ChampionsSpread) =>
  CHAMPIONS_STATS.reduce((total, stat) => total + spread[stat], 0);

export function normalizeSpread(spread: string | null): string | null {
  if (!spread) return null;
  const parts = spread
    .split('/')
    .map((part) => part.trim())
    .map((part) => {
      const match = /^(\d+)\s+([A-Za-z]+)$/.exec(part);
      return match ? { value: Number(match[1]), stat: match[2] } : null;
    })
    .filter((entry): entry is { value: number; stat: string } =>
      Boolean(entry)
    );
  if (!parts.length) return spread.trim();
  const isTraditional = parts.some((entry) => entry.value > 32);
  return parts
    .map((entry) => ({
      ...entry,
      value: isTraditional
        ? Math.min(32, Math.floor((entry.value + 4) / 8))
        : entry.value,
    }))
    .filter((entry) => entry.value > 0)
    .map((entry) => `${entry.value} ${entry.stat}`)
    .join(' / ');
}

export function normalizeSet(set: string): string {
  return set
    .split(/\r?\n/)
    .filter((line) => !/^(?:IVs|Level|Tera Type):/.test(line.trim()))
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('EVs:')) {
        const spread = trimmed.slice(4).trim();
        const normalized = normalizeSpread(spread);
        return normalized ? `EVs: ${normalized}` : '';
      }
      return line.trimEnd();
    })
    .filter(Boolean)
    .join('\n');
}

export function parseSetBlock(rawSet: string): Member {
  const set = normalizeSet(rawSet);
  const [first, ...lines] = set.split('\n').map((line) => line.trim());
  const [rawName, item] = first.split(' @ ');
  if (!rawName) throw new Error('Paste set is missing a Pokémon');
  const name = rawName.replace(/ \([MF]\)$/, '');
  const pokemon = /\(([^)]+)\)$/.exec(name)?.[1] || name;
  const field = (label: string) =>
    lines.find((line) => line.startsWith(label))?.slice(label.length) || null;
  const moves = lines
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
  if (moves.length > 4) throw new Error(`${pokemon} has more than four moves`);
  if (
    moves.some(
      (move, index) =>
        moves.findIndex(
          (candidate) => normalize(candidate) === normalize(move)
        ) !== index
    )
  )
    throw new Error(`${pokemon} has duplicate moves`);
  return {
    pokemon,
    item: item || null,
    ability: field('Ability: '),
    moves,
    nature:
      lines.find((line) => line.endsWith(' Nature'))?.replace(/ Nature$/, '') ||
      null,
    spread: field('EVs: '),
    set,
  };
}

export function parsePaste(text: string): Member[] {
  if (!text || text.length > 50000) throw new Error('Invalid paste payload');
  const blocks = text.trim().split(/\r?\n\s*\r?\n/);
  if (blocks.length !== 6) throw new Error('Paste must contain six sets');

  const members = blocks.map(parseSetBlock);
  const species = members.map(({ pokemon }) => normalize(pokemon));
  if (species.some((pokemon, index) => species.indexOf(pokemon) !== index))
    throw new Error('Paste contains duplicate Pokémon forms');
  return members;
}

export function parseCustomPaste(text: string): Member[] {
  const members = parsePaste(text);
  for (const member of members) {
    if (!member.item) throw new Error(`${member.pokemon} is missing an item`);
    if (!member.ability)
      throw new Error(`${member.pokemon} is missing an ability`);
    if (!member.nature)
      throw new Error(`${member.pokemon} is missing a nature`);
    if (!member.spread) throw new Error(`${member.pokemon} is missing EVs`);
    if (member.moves.length !== 4)
      throw new Error(`${member.pokemon} must have exactly four moves`);
  }
  return members;
}
