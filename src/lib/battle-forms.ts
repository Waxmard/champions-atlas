import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import { normalize, type Member } from './catalog.ts';

const generation = Generations.get(0);
const aliases: Record<string, string> = {
  aegislash: 'Aegislash-Shield',
  floetteeternalmega: 'Floette-Mega',
};

export const battleSpecies = (name: string) =>
  generation.species.get(normalize(aliases[normalize(name)] ?? name) as ID);

export type BattleForm = {
  pokemon: string;
  ability: string | null;
  error: string | null;
};

export function battleFormChoices(
  member: Pick<Member, 'pokemon' | 'item'>
): string[] {
  const saved = battleSpecies(member.pokemon);
  if (!saved) return [];
  const choices: string[] = [saved.name];
  const stone = member.item
    ? generation.items.get(normalize(member.item) as ID)?.megaStone
    : undefined;
  if (stone) {
    for (const [base, mega] of Object.entries(stone)) {
      if (normalize(base) === normalize(saved.name)) choices.push(mega);
      else if (normalize(mega) === normalize(saved.name)) choices.push(base);
    }
  }
  if (normalize(saved.name) === 'palafin') choices.push('Palafin-Hero');
  if (normalize(saved.name) === 'palafinhero') choices.push('Palafin');
  return [...new Set(choices)];
}

export function resolveBattleForm(
  member: Pick<Member, 'pokemon' | 'item' | 'ability'>,
  override?: string
): BattleForm {
  const saved = battleSpecies(member.pokemon);
  if (!saved)
    return {
      pokemon: member.pokemon,
      ability: member.ability,
      error: `Unknown battle species: ${member.pokemon}`,
    };
  const stone = member.item
    ? generation.items.get(normalize(member.item) as ID)?.megaStone
    : undefined;
  let matchedMega: string | undefined;
  let matchedBase: string | undefined;
  if (stone) {
    for (const [base, mega] of Object.entries(stone)) {
      if (
        normalize(base) === normalize(saved.name) ||
        normalize(mega) === normalize(saved.name)
      ) {
        matchedMega = mega;
        matchedBase = base;
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
  if (
    override &&
    !battleFormChoices(member).some(
      (choice) => normalize(choice) === normalize(override)
    )
  )
    return {
      pokemon: saved.name,
      ability: null,
      error: `Invalid battle form: ${override}`,
    };
  const selected = battleSpecies(override ?? matchedMega ?? saved.name);
  if (!selected)
    return {
      pokemon: saved.name,
      ability: null,
      error: 'Battle form is unavailable',
    };
  const isMega = /-Mega(?:-[XYZ])?$/i.test(selected.name);
  const preMega = Boolean(
    override &&
    matchedBase &&
    normalize(selected.name) === normalize(matchedBase)
  );
  const storedAbility =
    member.ability && member.ability !== '---' ? member.ability : null;
  const ability = isMega ? selected.abilities?.[0] || null : storedAbility;
  if (preMega && storedAbility && matchedMega) {
    const megaAbility = battleSpecies(matchedMega)?.abilities?.[0];
    if (megaAbility && normalize(storedAbility) === normalize(megaAbility))
      return {
        pokemon: selected.name,
        ability: null,
        error: 'Pre-Mega ability is unknown',
      };
  }
  return { pokemon: selected.name, ability, error: null };
}
