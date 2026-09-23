import { Generations } from '@smogon/calc/dist/data/index.js';
import type { ID } from '@smogon/calc/dist/data/interface.js';
import {
  battleSpecies,
  resolveBattleForm,
  type BattleForm,
} from './battle-forms.ts';
import { normalize, type Member, type Team } from './catalog.ts';
import {
  NATURES,
  championsSpreadTotal,
  formatChampionsSpread,
  parseChampionsSpread,
} from './paste.ts';
import { statsFor } from './stats.ts';

export type BenchmarkVariant = {
  key: string;
  member: Member;
  teamIds: string[];
};

export type BenchmarkSpecies = {
  pokemon: string;
  teamCount: number;
  eligibleTeamCount: number;
  variants: BenchmarkVariant[];
};

export type BenchmarkIndex = {
  regulation: string;
  teamCount: number;
  species: BenchmarkSpecies[];
};

const generation = Generations.get(0);
const nature = (name: string | null) =>
  NATURES.find((candidate) => normalize(candidate) === normalize(name ?? ''));

function indexedMember(member: Member, form: BattleForm) {
  if (
    !member.spread?.trim() ||
    !member.item?.trim() ||
    !normalize(member.item) ||
    !form.ability?.trim() ||
    !normalize(form.ability)
  )
    return null;
  const spread = parseChampionsSpread(member.spread);
  if (
    !spread ||
    championsSpreadTotal(spread) !== 66 ||
    Object.values(spread).some(
      (value) => !Number.isInteger(value) || value < 0 || value > 32
    )
  )
    return null;
  const canonicalNature = nature(member.nature);
  const item = generation.items.get(normalize(member.item) as ID);
  if (!canonicalNature || !item) return null;
  const species = form.error ? null : battleSpecies(form.pokemon);
  if (!species || !form.ability) return null;
  const effectiveAbility = generation.abilities.get(
    normalize(form.ability) as ID
  );
  if (!effectiveAbility || !statsFor(species.name, spread, canonicalNature))
    return null;
  const moves = member.moves
    .map((move) => generation.moves.get(normalize(move) as ID))
    .filter((move) => move && move.category !== 'Status');
  if (!moves.length) return null;
  const canonicalMoves = member.moves.map(normalize).sort();
  const key = JSON.stringify([
    species.name,
    normalize(item.name),
    normalize(effectiveAbility.name),
    canonicalNature,
    formatChampionsSpread(spread),
    canonicalMoves,
  ]);
  return { key };
}

export function buildBenchmarkIndex(
  teams: Team[],
  regulation: string
): BenchmarkIndex {
  const currentTeams = teams.filter((team) => team.regulation === regulation);
  const teamIds = new Set(currentTeams.map((team) => team.id));
  const entries = new Map<
    string,
    {
      teamIds: Set<string>;
      eligibleTeamIds: Set<string>;
      variants: Map<string, { member: Member; teamIds: Set<string> }>;
    }
  >();

  for (const team of currentTeams) {
    for (const member of team.members) {
      const form = resolveBattleForm(member);
      const species = battleSpecies(form.pokemon)?.name ?? member.pokemon;
      let entry = entries.get(species);
      if (!entry) {
        entry = {
          teamIds: new Set(),
          eligibleTeamIds: new Set(),
          variants: new Map(),
        };
        entries.set(species, entry);
      }
      entry.teamIds.add(team.id);
      const indexed = indexedMember(member, form);
      if (!indexed) continue;
      entry.eligibleTeamIds.add(team.id);
      let variant = entry.variants.get(indexed.key);
      if (!variant) {
        variant = { member, teamIds: new Set() };
        entry.variants.set(indexed.key, variant);
      }
      variant.teamIds.add(team.id);
    }
  }

  const species = [...entries]
    .map(([pokemon, entry]) => ({
      pokemon,
      teamCount: entry.teamIds.size,
      eligibleTeamCount: entry.eligibleTeamIds.size,
      variants: [...entry.variants]
        .map(([key, variant]) => ({
          key,
          member: variant.member,
          teamIds: [...variant.teamIds].sort(),
        }))
        .sort(
          (a, b) =>
            b.teamIds.length - a.teamIds.length || a.key.localeCompare(b.key)
        ),
    }))
    .sort(
      (a, b) => b.teamCount - a.teamCount || a.pokemon.localeCompare(b.pokemon)
    );

  return { regulation, teamCount: teamIds.size, species };
}
