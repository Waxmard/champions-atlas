import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { megaStoneTargets, normalize, type Member } from './catalog.ts';

const generation = Generations.get(0);
const aliases: Record<string, string> = {
  aegislash: 'Aegislash-Shield',
  floetteeternalmega: 'Floette-Mega',
  meowsticmega: 'Meowstic-M-Mega',
};

// Appearance-only forms: identical stats, types, abilities, and movesets, so a
// set naming one form is the same set as the other.
export const cosmeticForms: Record<string, string> = {
  sinistchamasterpiece: 'sinistcha',
  sinisteaantique: 'sinistea',
  polteageistantique: 'polteageist',
  poltchageistartisan: 'poltchageist',
  vivillonfancy: 'vivillon',
  vivillonpokeball: 'vivillon',
};

export const battleSpecies = (name: string) =>
  generation.species.get(normalize(aliases[normalize(name)] ?? name) as ID);

type BattleForm = {
  pokemon: string;
  ability: string | null;
  error: string | null;
};

export function resolveBattleForm(
  member: Pick<Member, 'pokemon' | 'item' | 'ability'>
): BattleForm {
  const saved = battleSpecies(member.pokemon);
  if (!saved)
    return {
      pokemon: member.pokemon,
      ability: member.ability,
      error: `Unknown battle species: ${member.pokemon}`,
    };
  const stone = member.item ? megaStoneTargets(member.item) : undefined;
  let matchedMega: string | undefined;
  if (stone) {
    for (const [base, mega] of Object.entries(stone)) {
      if (
        normalize(base) === normalize(saved.name) ||
        normalize(mega) === normalize(saved.name)
      ) {
        matchedMega = mega;
        break;
      }
    }
  }
  const explicitMega = /-Mega(?:-[XYZ])?$/i.test(saved.name);
  if (explicitMega && stone && !matchedMega)
    return {
      pokemon: saved.name,
      ability: null,
      error: `Mega Stone conflicts with ${saved.name}`,
    };
  const selected = battleSpecies(matchedMega ?? saved.name);
  if (!selected)
    return {
      pokemon: saved.name,
      ability: null,
      error: 'Battle form is unavailable',
    };
  const isMega = /-Mega(?:-[XYZ])?$/i.test(selected.name);
  const storedAbility =
    member.ability && member.ability !== '---' ? member.ability : null;
  const ability = isMega ? selected.abilities?.[0] || null : storedAbility;
  return { pokemon: selected.name, ability, error: null };
}
