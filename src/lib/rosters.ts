import { battleSpecies } from './battle-forms.ts';
import { isMegaSpecies, normalize, pokemonId } from './catalog.ts';
import rosterA from '../../scripts/data/champions-m-a.json' with { type: 'json' };
import rosterB from '../../scripts/data/champions-m-b.json' with { type: 'json' };
import rosterC from '../../scripts/data/champions-m-c.json' with { type: 'json' };

const rosters: Record<
  string,
  { pokemon: Record<string, string[]>; megas: Record<string, string> }
> = {
  'M-A': rosterA,
  'M-B': rosterB,
  'M-C': rosterC,
};
const rosterNames = new Map<string, string[]>();
const rosterIds = new Map<string, Set<string>>();

export function rosterSpecies(regulation: string): string[] {
  let names = rosterNames.get(regulation);
  if (!names) {
    names = Object.values(rosters[regulation]?.pokemon ?? {}).flatMap(
      ([id]) => battleSpecies(id)?.name ?? []
    );
    rosterNames.set(regulation, names);
  }
  return names;
}

export function isRosterLegal(form: string, regulation: string): boolean {
  let ids = rosterIds.get(regulation);
  if (!ids) {
    ids = new Set(Object.values(rosters[regulation]?.pokemon ?? {}).flat());
    rosterIds.set(regulation, ids);
  }
  return (
    ids.has(pokemonId(form)) &&
    (!isMegaSpecies(form) || normalize(form) in rosters[regulation].megas)
  );
}
