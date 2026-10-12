import { normalize, type Team } from './catalog.ts';
import {
  deleteTeam,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  type SavedTeam,
} from './workbench.ts';

export const teamsInUse = (saved: SavedTeam[]) =>
  saved.filter((team) => team.collection !== 'wishlist');

export function resolveSavedTeamId(
  saved: SavedTeam[],
  requestedId: string | null,
  activeId: string | null
): string | null {
  const teams = teamsInUse(saved);
  const fallbackId =
    (activeId && teams.find((team) => team.id === activeId)?.id) ??
    teams[0]?.id ??
    null;
  return requestedId && teams.some((team) => team.id === requestedId)
    ? requestedId
    : fallbackId;
}

export function addCatalogToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: Team
): SavedTeam {
  const saved = readSavedTeams(storage);
  const existing = saved.find(
    (entry) => entry.collection === 'wishlist' && entry.original.id === team.id
  );
  if (existing) return existing;
  const candidate = { ...newSavedTeam(team), collection: 'wishlist' as const };
  return saveTeam(storage, candidate).find(
    (entry) => entry.id === candidate.id
  )!;
}

export function useWishlistedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry)
    throw new Error('This Wishlist team is no longer saved. Refresh the list.');
  if (entry.collection !== 'wishlist') return entry;
  const promoted = { ...entry, collection: 'my-teams' as const };
  return saveTeam(storage, promoted).find((team) => team.id === id)!;
}

export function useCatalogTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: Team
): SavedTeam {
  const saved = readSavedTeams(storage);
  const bookmarked = saved.find(
    (entry) => entry.collection === 'wishlist' && entry.original.id === team.id
  );
  if (bookmarked) return useWishlistedTeam(storage, bookmarked.id);
  const candidate = newSavedTeam(team);
  return saveTeam(storage, candidate).find(
    (entry) => entry.id === candidate.id
  )!;
}

export function removeWishlistedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam[] {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry) return saved;
  if (entry.collection !== 'wishlist')
    throw new Error('This team is no longer in Wishlist. Refresh the list.');
  return deleteTeam(storage, id);
}

const subsequence = (query: string, field: string) => {
  let at = 0;
  for (const char of field) if (char === query[at]) at++;
  return at === query.length;
};

function matchTier(term: string, fields: string[]): number {
  let best = Infinity;
  for (const field of fields) {
    if (field === term) best = Math.min(best, 0);
    else if (field.startsWith(term)) best = Math.min(best, 1);
    else if (field.includes(term)) best = Math.min(best, 2);
    else if (subsequence(term, field)) best = Math.min(best, 3);
  }
  return best;
}

export function rankSavedTeams(teams: SavedTeam[], query: string): SavedTeam[] {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!terms.length) return teams;
  return teams
    .map((team, index) => {
      const fields = [
        team.name,
        ...team.members.map((member) => member.pokemon),
      ].map(normalize);
      let score = 0;
      for (const term of terms) {
        const tier = matchTier(term, fields);
        if (!Number.isFinite(tier)) return null;
        score += tier;
      }
      return { team, index, score };
    })
    .filter(
      (entry): entry is { team: SavedTeam; index: number; score: number } =>
        entry !== null
    )
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ team }) => team);
}
