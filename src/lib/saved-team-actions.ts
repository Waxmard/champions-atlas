import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { Team } from './catalog';
import { pushNow } from './sync.svelte';
import {
  addCatalogToWishlist,
  removeWishlistedTeam,
  SavedTeamError,
  useCatalogTeam,
  wishlistedCatalogEntries,
} from './team-collections';
import { activeTeamKey, readSavedTeams, type SavedTeam } from './workbench';

const SAVE_FAILURE =
  'Could not save this team. Check app storage access and available space. Existing saved teams were not replaced.';

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
        'Saved teams could not be read, so Wishlist and Use are unavailable. Check app storage access.',
    };
  }
}

export function toggleCatalogWishlist(team: Team): {
  error: string;
  status: string;
} {
  try {
    const matches = wishlistedCatalogEntries(
      readSavedTeams(localStorage),
      team
    );
    if (matches.length > 1) {
      return {
        error:
          'Multiple copies are in Wishlist. Remove them from Wishlist individually.',
        status: '',
      };
    }
    const entry = matches[0];
    if (!entry) {
      addCatalogToWishlist(localStorage, team);
      void pushNow();
      return { error: '', status: 'Added to Wishlist.' };
    }
    removeWishlistedTeam(localStorage, entry.id);
    void pushNow();
    return { error: '', status: 'Removed from Wishlist.' };
  } catch (error) {
    return {
      error: error instanceof SavedTeamError ? error.message : SAVE_FAILURE,
      status: '',
    };
  }
}

export async function openCatalogTeam(team: Team): Promise<string> {
  let entry: SavedTeam;
  try {
    entry = useCatalogTeam(localStorage, team);
  } catch (error) {
    return error instanceof SavedTeamError ? error.message : SAVE_FAILURE;
  }
  void pushNow();
  try {
    localStorage.setItem(activeTeamKey, entry.id);
  } catch {
    // My Teams reports storage trouble; the explicit ID still opens the team.
  }
  try {
    await goto(resolve(`my-teams?team=${encodeURIComponent(entry.id)}`));
  } catch {
    return 'Could not open My teams. Your team was saved.';
  }
  return '';
}
