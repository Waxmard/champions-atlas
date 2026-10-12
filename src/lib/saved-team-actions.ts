import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { Team } from './catalog';
import { pushNow } from './sync.svelte';
import { addCatalogToWishlist, useCatalogTeam } from './team-collections';
import { activeTeamKey, readSavedTeams, type SavedTeam } from './workbench';

export const SAVE_FAILURE =
  'Could not save this team. Check browser storage access and available space. Existing saved teams were not replaced.';

export function readSavedTeamsState(): {
  saved: SavedTeam[];
  error: string;
} {
  try {
    return { saved: readSavedTeams(localStorage), error: '' };
  } catch {
    return {
      saved: [],
      error:
        'Saved teams could not be read, so Wishlist and Use are unavailable. Check browser storage access.',
    };
  }
}

export function wishlistCatalogTeam(team: Team): string {
  try {
    addCatalogToWishlist(localStorage, team);
    void pushNow();
    return '';
  } catch {
    return SAVE_FAILURE;
  }
}

export async function openCatalogTeam(team: Team): Promise<string> {
  let entry: SavedTeam;
  try {
    entry = useCatalogTeam(localStorage, team);
  } catch {
    return SAVE_FAILURE;
  }
  void pushNow();
  try {
    localStorage.setItem(activeTeamKey, entry.id);
  } catch {
    // My Teams reports storage trouble; the explicit ID still opens the team.
  }
  try {
    await goto(resolve(`/my-teams?team=${encodeURIComponent(entry.id)}`));
  } catch {
    return 'Could not open My teams. Your team was saved.';
  }
  return '';
}
