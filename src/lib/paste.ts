import { normalize, type Member } from './catalog.ts';

export function parsePaste(text: string): Member[] {
  if (!text || text.length > 50000) throw new Error('Invalid paste payload');
  const blocks = text.trim().split(/\r?\n\s*\r?\n/);
  if (blocks.length !== 6) throw new Error('Paste must contain six sets');

  const members = blocks.map((set) => {
    const [first, ...lines] = set.split(/\r?\n/).map((line) => line.trim());
    const [rawName, item] = first.split(' @ ');
    if (!rawName) throw new Error('Paste set is missing a Pokémon');
    const name = rawName.replace(/ \([MF]\)$/, '');
    const pokemon = /\(([^)]+)\)$/.exec(name)?.[1] || name;
    const field = (label: string) =>
      lines.find((line) => line.startsWith(label))?.slice(label.length) || null;
    const moves = lines
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2));
    if (moves.length > 4)
      throw new Error(`${pokemon} has more than four moves`);
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
        lines
          .find((line) => line.endsWith(' Nature'))
          ?.replace(/ Nature$/, '') || null,
      spread: field('EVs: '),
      set,
    };
  });
  const species = members.map(({ pokemon }) => normalize(pokemon));
  if (species.some((pokemon, index) => species.indexOf(pokemon) !== index))
    throw new Error('Paste contains duplicate Pokémon forms');
  return members;
}
