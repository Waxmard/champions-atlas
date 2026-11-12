import { battleSpecies } from './battle-forms.ts';
import { normalize } from './catalog.ts';
import data from './data/ladder-partners.json' with { type: 'json' };

export type LadderShares = Record<string, Record<string, number> | undefined>;

export const ladderShares = (regulation: string): LadderShares | undefined =>
  data.regulation === regulation ? data.partners : undefined;

const speciesKey = (name: string) =>
  normalize(battleSpecies(name)?.baseSpecies ?? name);

export function ladderScore(
  shares: LadderShares | undefined,
  form: string,
  teammates: readonly string[]
): number {
  if (!shares || !teammates.length) return 0;
  let sum = 0;
  for (const name of teammates) {
    const key = normalize(name);
    const row = shares[key] ?? shares[speciesKey(name)] ?? shares[`${key}mega`];
    sum += row?.[normalize(form)] ?? row?.[speciesKey(form)] ?? 0;
  }
  return sum / teammates.length;
}
