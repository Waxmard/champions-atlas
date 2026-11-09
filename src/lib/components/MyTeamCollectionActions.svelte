<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import Star from '@lucide/svelte/icons/star';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { Member } from '#lib/catalog.js';
  import CurrentSetSaveButton from '#lib/components/CurrentSetSaveButton.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { notify } from '#lib/notifications.js';
  import { pushNow } from '#lib/sync.svelte.js';
  import {
    moveInUseTeamToFavorites,
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
    deleteDisabled: boolean;
    ondelete: () => void;
  }

  let {
    teamId,
    baseline,
    members,
    disabled,
    dirty,
    deleteDisabled,
    ondelete,
  }: Props = $props();
  let pending = $state(false),
    movedId = $state<string | null>(null),
    errorMessage = $state('');
  const moveDisabled = $derived(
    disabled || dirty || pending || movedId === teamId
  );
  const tile =
    'h-auto min-h-11 flex-col justify-start gap-1 px-1 py-2 text-center leading-tight whitespace-normal';

  async function move(target: 'favorites' | 'wishlist') {
    if (disabled || dirty || pending || movedId === teamId) return;
    const id = teamId;
    const label = target === 'favorites' ? 'Favorites' : 'Wishlist';
    pending = true;
    errorMessage = '';
    let previousActiveId: string | null;
    try {
      previousActiveId = localStorage.getItem(activeTeamKey);
      if (target === 'favorites')
        moveInUseTeamToFavorites(localStorage, id, baseline);
      else moveInUseTeamToWishlist(localStorage, id, baseline);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : `Could not move this team to ${label}. Check app storage access and available space. Your team was not changed.`;
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
      errorMessage = `Team moved to ${label}, but the active team could not be remembered.`;
      pending = false;
      notify(`Team moved to ${label}.`);
      return;
    }
    try {
      await goto(resolve(target));
    } catch {
      const navigationError = `Team moved to ${label}, but ${label} could not be opened.`;
      errorMessage = errorMessage
        ? `${errorMessage} ${navigationError}`
        : navigationError;
    } finally {
      pending = false;
    }
    notify(`Team moved to ${label}.`);
  }
</script>

<div
  class="plate mt-3 grid min-w-0 grid-cols-3 gap-1 p-1 [&>div>button]:col-span-full [&>div>button]:h-auto [&>div>button]:min-h-11 [&>div>button]:max-w-full [&>div>button]:whitespace-normal [&>div>p]:col-span-full [&>div>p]:px-2"
>
  <CurrentSetSaveButton {teamId} {baseline} {members} {disabled} />
  <Button
    variant="quiet"
    class={tile}
    data-move-favorites
    disabled={moveDisabled}
    onclick={() => move('favorites')}
  >
    <Star class="size-4" aria-hidden="true" />
    <span>Move to Favorites</span>
  </Button>
  <Button
    variant="quiet"
    class={tile}
    disabled={moveDisabled}
    onclick={() => move('wishlist')}
  >
    <Bookmark class="size-4" aria-hidden="true" />
    <span>Move to Wishlist</span>
  </Button>
  <Button
    variant="quiet"
    class={tile}
    data-preserve-team-name
    disabled={deleteDisabled || pending || movedId === teamId}
    onclick={ondelete}
  >
    <Trash2 class="size-4" aria-hidden="true" />
    <span>Delete team</span>
  </Button>
  <p
    role="alert"
    class="order-last col-span-full px-2 text-sm {errorMessage
      ? 'pb-1'
      : 'sr-only'}"
    style="color: var(--color-error-content)"
  >
    {errorMessage}
  </p>
</div>
