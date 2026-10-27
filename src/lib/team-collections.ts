import { isPasteUrl, normalize, type Team } from './catalog.ts';
import type { PokepastePayload } from './pokepaste.ts';
import { canonicalSnapshot } from './team-history.ts';
import {
  deleteTeam,
  newCustomTeam,
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  type SavedTeam,
} from './workbench.ts';

export const teamsInUse = (saved: SavedTeam[]) =>
  saved.filter((team) => team.collection !== 'wishlist');

export class SavedTeamError extends Error {}

const saveAndGet = (
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: SavedTeam
): SavedTeam => {
  const saved = saveTeam(storage, team).find((entry) => entry.id === team.id);
  if (!saved)
    throw new SavedTeamError('This team was not saved. Refresh the list.');
  return saved;
};

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

export function wishlistedCatalogEntries(
  saved: SavedTeam[],
  team: Team
): SavedTeam[] {
  const pasteUrl = isPasteUrl(team.pasteUrl) ? team.pasteUrl : '';
  return saved.filter(
    (entry) =>
      entry.collection === 'wishlist' &&
      (entry.original.id === team.id ||
        (pasteUrl !== '' && entry.original.pasteUrl === pasteUrl))
  );
}

export function addCatalogToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: Team
): SavedTeam {
  const saved = readSavedTeams(storage);
  const existing = wishlistedCatalogEntries(saved, team)[0];
  if (existing) return existing;
  const candidate = { ...newSavedTeam(team), collection: 'wishlist' as const };
  return saveAndGet(storage, candidate);
}

export function addPokepasteToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  payload: PokepastePayload,
  currentRegulation: string,
  catalog: Team[]
): SavedTeam {
  const saved = readSavedTeams(storage);
  const existing = saved.find(
    (entry) =>
      entry.collection === 'wishlist' && entry.original.pasteUrl === payload.url
  );
  if (existing) return existing;
  const team = catalog.find((entry) => entry.pasteUrl === payload.url);
  if (team) return addCatalogToWishlist(storage, team);
  const custom = newCustomTeam(payload.title, currentRegulation, payload.paste);
  return saveAndGet(storage, {
    ...custom,
    collection: 'wishlist',
    original: { ...custom.original, pasteUrl: payload.url },
    sources: [{ name: payload.title, pasteUrl: payload.url }],
  });
}

export function useWishlistedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry)
    throw new SavedTeamError(
      'This Wishlist team is no longer saved. Refresh the list.'
    );
  if (entry.collection !== 'wishlist') return entry;
  const promoted = { ...entry, collection: 'my-teams' as const };
  return saveAndGet(storage, promoted);
}

export function moveInUseTeamToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string,
  baseline: string
): SavedTeam {
  const saved = readSavedTeams(storage);
  const latest = saved.find((team) => team.id === id);
  if (
    !latest ||
    latest.collection === 'wishlist' ||
    canonicalSnapshot({ name: latest.name, members: latest.members }) !==
      baseline
  )
    throw new SavedTeamError(
      'This team changed elsewhere. Reopen My teams before moving it.'
    );
  if (
    saved.some(
      (team) =>
        team.id !== id &&
        team.collection === 'wishlist' &&
        (team.original.id === latest.original.id ||
          (latest.original.pasteUrl !== '' &&
            team.original.pasteUrl === latest.original.pasteUrl))
    )
  )
    throw new SavedTeamError(
      'A copy of this team is already in Wishlist. Move or remove that copy first.'
    );
  return saveAndGet(storage, { ...latest, collection: 'wishlist' });
}

export function useCatalogTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: Team
): SavedTeam {
  const saved = readSavedTeams(storage);
  const bookmarked = wishlistedCatalogEntries(saved, team);
  if (bookmarked.length > 1)
    throw new SavedTeamError(
      'Multiple copies are in Wishlist. Choose a copy in Wishlist.'
    );
  if (bookmarked[0]) return useWishlistedTeam(storage, bookmarked[0].id);
  const candidate = newSavedTeam(team);
  return saveAndGet(storage, candidate);
}

export function removeWishlistedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam[] {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry) return saved;
  if (entry.collection !== 'wishlist')
    throw new SavedTeamError(
      'This team is no longer in Wishlist. Refresh the list.'
    );
  return deleteTeam(storage, id);
}

export function liveInUseTeam(
  storage: Pick<Storage, 'getItem'>,
  id: string
): SavedTeam | null {
  const latest = readSavedTeams(storage).find((team) => team.id === id);
  return latest && latest.collection !== 'wishlist' ? latest : null;
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
