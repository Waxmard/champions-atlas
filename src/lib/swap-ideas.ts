import { resolveBattleForm } from './battle-forms.ts';
import {
  MAX_TEAM_MEGAS,
  basePokemon,
  compareTeams,
  isMegaSpecies,
  normalize,
  type Member,
  type Team,
} from './catalog.ts';
import { ladderScore, type LadderShares } from './ladder.ts';
import {
  CLOSE_SHARED,
  SLOT_SUGGESTION_LIMIT,
  fitKey,
  isKnownMember,
  pokemonSuggestions,
  type FavoriteTeamSource,
  type SwapSuggestion,
} from './swap-suggestions.ts';
import type { TeamTagsIndex } from './tags.ts';

export function swapTargets(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  favoriteTeams: readonly FavoriteTeamSource[] = []
): string[] {
  const present = new Set<string>();
  let megas = 0;
  for (const member of members) {
    const form = resolveBattleForm(member);
    const name = form.error ? member.pokemon : form.pokemon;
    present.add(normalize(name));
    present.add(basePokemon(name));
    if (isMegaSpecies(name)) megas++;
  }
  const names = new Set<string>();
  const addMember = (member: Member, requireKnown: boolean) => {
    if (requireKnown && !isKnownMember(member)) return;
    const form = resolveBattleForm(member);
    if (form.error) return;
    if (
      present.has(normalize(form.pokemon)) ||
      present.has(basePokemon(form.pokemon)) ||
      (isMegaSpecies(form.pokemon) && megas >= MAX_TEAM_MEGAS)
    )
      return;
    names.add(form.pokemon);
  };
  for (const team of teams) {
    if (team.regulation !== currentRegulation) continue;
    for (const member of team.members) addMember(member, false);
  }
  for (const favTeam of favoriteTeams) {
    for (const member of favTeam.members) addMember(member, true);
  }
  return [...names].sort();
}

export function swapIdeas(
  members: Member[],
  teams: Team[],
  currentRegulation: string,
  tags?: TeamTagsIndex,
  limit = 4,
  favoriteTeams: readonly FavoriteTeamSource[] = [],
  ladder?: LadderShares,
  all = false
): SwapSuggestion[] {
  const pool: SwapSuggestion[] = [];
  const forms = members.map((member) => resolveBattleForm(member).pokemon);
  for (const [slot, replaced] of members.entries()) {
    const others = (_: unknown, index: number) => index !== slot;
    const own = ladderScore(ladder, forms[slot], forms.filter(others));
    const ideas = pokemonSuggestions(
      members.filter(others),
      teams,
      currentRegulation,
      replaced.pokemon,
      tags,
      '',
      { limit: SLOT_SUGGESTION_LIMIT, ladder },
      favoriteTeams
    ).map((idea) => ({ ...idea, slot, ladder: idea.ladder - own }));
    const kept = ideas.filter(
      (idea) => idea.sharedTeammates >= CLOSE_SHARED || idea.ladder >= 0
    );
    pool.push(...(kept.length ? kept : ideas.slice(0, 1)));
  }
  const seenSlots = new Set<number>();
  const seenSpecies = new Set<string>();
  const form = (idea: SwapSuggestion) =>
    normalize(resolveBattleForm(idea.member).pokemon);
  const head = pool
    .sort(
      (a, b) =>
        b.closeSupport - a.closeSupport ||
        fitKey(b.sharedTeammates, b.ladder) -
          fitKey(a.sharedTeammates, a.ladder) ||
        b.sharedTeammates - a.sharedTeammates ||
        b.support - a.support ||
        b.matchingDetails - a.matchingDetails ||
        Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
        compareTeams(a.source, b.source, currentRegulation) ||
        a.slot - b.slot
    )
    .filter((idea) => {
      const key = form(idea);
      if (seenSlots.has(idea.slot) || seenSpecies.has(key)) return false;
      seenSlots.add(idea.slot);
      seenSpecies.add(key);
      return true;
    })
    .slice(0, limit);
  if (!all) return head;
  const taken = new Set(head.map(form));
  const rest = pool.filter((idea) => {
    const key = form(idea);
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
  return [...head, ...rest];
}
