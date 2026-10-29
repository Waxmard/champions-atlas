<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import type { Member } from '#lib/catalog.js';
  import CurrentSetSaveButton from '#lib/components/CurrentSetSaveButton.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { notify } from '#lib/notifications.js';
  import { pushNow } from '#lib/sync.svelte.js';
  import {
    moveInUseTeamToWishlist,
    resolveSavedTeamId,
    SavedTeamError,
  } from '#lib/team-collections.js';
  import { activeTeamKey, readSavedTeams } from '#lib/workbench.js';

  interface Props {
    teamId: string;
    baseline: string;
    members: Member[];
    disabled: boolean;
    dirty: boolean;
  }

  let { teamId, baseline, members, disabled, dirty }: Props = $props();
  let pending = $state(false),
    movedId = $state<string | null>(null),
    errorMessage = $state('');

  async function move() {
    if (disabled || dirty || pending || movedId === teamId) return;
    const id = teamId;
    pending = true;
    errorMessage = '';
    let previousActiveId: string | null;
    try {
      previousActiveId = localStorage.getItem(activeTeamKey);
      moveInUseTeamToWishlist(localStorage, id, baseline);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not move this team to Wishlist. Check app storage access and available space. Your team was not changed.';
      pending = false;
      return;
    }

    movedId = id;
    void pushNow();
    try {
      const replacement = resolveSavedTeamId(
        readSavedTeams(localStorage),
        null,
        previousActiveId
      );
      if (replacement) localStorage.setItem(activeTeamKey, replacement);
      else localStorage.removeItem(activeTeamKey);
    } catch {
      errorMessage =
        'Team moved to Wishlist, but the active team could not be remembered.';
      pending = false;
      notify('Team moved to Wishlist.');
      return;
    }
    try {
      await goto(resolve('wishlist'));
    } catch {
      const navigationError =
        'Team moved to Wishlist, but Wishlist could not be opened.';
      errorMessage = errorMessage
        ? `${errorMessage} ${navigationError}`
        : navigationError;
    } finally {
      pending = false;
    }
    notify('Team moved to Wishlist.');
  }
</script>

<CurrentSetSaveButton {teamId} {baseline} {members} {disabled} />
<Button
  variant="secondary"
  size="touch"
  disabled={disabled || dirty || pending || movedId === teamId}
  onclick={move}
>
  <Bookmark class="size-4" aria-hidden="true" />
  Move to Wishlist
</Button>
<p
  role="alert"
  class="order-last basis-full text-sm {errorMessage ? '' : 'sr-only'}"
  style="color: var(--color-error-content)"
>
  {errorMessage}
</p>
