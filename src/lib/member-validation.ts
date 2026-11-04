import { normalize, type Member } from './catalog.ts';
import {
  championsSpreadTotal,
  NATURES,
  parseChampionsSpread,
  parsePaste,
} from './paste.ts';
import { isMegaSpecies, MAX_TEAM_MEGAS } from './workbench.ts';

export function memberRosterError(
  next: Member,
  accepted: Member,
  teammates: Member[]
): string {
  if (
    teammates.some(
      (teammate) => normalize(teammate.pokemon) === normalize(next.pokemon)
    )
  )
    return 'This Pokémon is already on the team.';
  if (
    normalize(next.pokemon) !== normalize(accepted.pokemon) &&
    isMegaSpecies(next.pokemon) &&
    teammates.filter((teammate) => isMegaSpecies(teammate.pokemon)).length >=
      MAX_TEAM_MEGAS
  )
    return 'A team can include at most two Mega Pokémon.';
  return '';
}

export function memberValidationError(
  next: Member,
  accepted: Member,
  teammates: Member[],
  mode: 'structured' | 'text'
): { field: 'pokemon' | 'nature' | 'spread' | 'text'; message: string } | null {
  const reason = memberRosterError(next, accepted, teammates);
  if (reason)
    return {
      field: mode === 'text' ? 'text' : 'pokemon',
      message: reason,
    };
  if (!next.pokemon.trim())
    return {
      field: mode === 'text' ? 'text' : 'pokemon',
      message: 'Enter a Pokémon.',
    };

  const nature = next.nature?.trim() || '';
  if (nature && nature !== (accepted.nature || '')) {
    const standardNature = NATURES.find(
      (candidate) => candidate.toLowerCase() === nature.toLowerCase()
    );
    if (!standardNature)
      return {
        field: mode === 'text' ? 'text' : 'nature',
        message: 'Choose a standard nature.',
      };
    next.nature = standardNature;
  }

  const spread = next.spread?.trim() || '';
  if (spread === (accepted.spread || '') || (!spread && mode === 'text'))
    return null;
  const parsed = parseChampionsSpread(spread);
  if (!parsed)
    return {
      field: mode === 'text' ? 'text' : 'spread',
      message: 'Enter a valid EV spread totaling 66 points.',
    };
  const total = championsSpreadTotal(parsed);
  if (total !== 66)
    return {
      field: mode === 'text' ? 'text' : 'spread',
      message: `Changed EV spreads must total 66 points (currently ${total}).`,
    };
  return null;
}

export function parseTeamPaste(text: string, current: Member[]): Member[] {
  const parsed = parsePaste(text);
  if (
    parsed.filter((member) => isMegaSpecies(member.pokemon)).length >
    MAX_TEAM_MEGAS
  )
    throw new Error('A team can include at most two Mega Pokémon.');
  return parsed.map((member, index) => {
    const previous = current.find(
      (candidate) => normalize(candidate.pokemon) === normalize(member.pokemon)
    );
    const accepted = previous ?? { ...member, nature: null, spread: null };
    const error = memberValidationError(
      member,
      accepted,
      parsed.filter((_, other) => other !== index),
      'text'
    );
    if (error)
      throw new Error(
        `${member.pokemon || `Slot ${index + 1}`}: ${error.message}`
      );
    return previous ? { ...previous, ...member } : member;
  });
}
