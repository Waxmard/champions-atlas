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
    WISHLIST_EDITED_ERROR,
  } from '#lib/team-collections.js';
  import { activeTeamKey, readSavedTeams } from '#lib/workbench.js';

  interface Props {
    teamId: string;
    name: string;
    baseline: string;
    members: Member[];
    disabled: boolean;
    dirty: boolean;
    edited: boolean;
    deleteDisabled: boolean;
    ondelete: () => void;
  }

  let {
    teamId,
    name,
    baseline,
    members,
    disabled,
    dirty,
    edited,
    deleteDisabled,
    ondelete,
  }: Props = $props();
  let pending = $state(false),
    movedId = $state<string | null>(null),
    errorMessage = $state('');
  const moveDisabled = $derived(
    disabled || dirty || pending || movedId === teamId
  );
  const action = 'gap-1 px-2 landscape:md:justify-start';

  async function move(target: 'favorites' | 'wishlist') {
    if (moveDisabled) return;
    if (target === 'wishlist' && edited) {
      errorMessage = WISHLIST_EDITED_ERROR;
      return;
    }
    const id = teamId;
    const label = target === 'favorites' ? 'Favorites' : 'Wishlist';
    if (!confirm(`Move “${name}” to ${label}?`)) return;
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
  class="flex min-w-0 flex-wrap items-center gap-x-1 landscape:md:flex-col landscape:md:items-stretch [&>div>button]:order-1 [&>div>button]:h-auto [&>div>button]:min-h-11 [&>div>button]:w-full [&>div>button]:max-w-full [&>div>button]:justify-start [&>div>button]:gap-1 [&>div>button]:px-2 [&>div>button]:text-start [&>div>button]:whitespace-normal [&>div>p]:px-2"
>
  <span class="provenance ps-2" aria-hidden="true">Move to</span>
  <Button
    variant="quiet"
    class={action}
    aria-label="Move to Favorites"
    data-move-favorites
    disabled={moveDisabled}
    onclick={() => move('favorites')}
  >
    <Star class="size-4" aria-hidden="true" />
    <span>Favorites</span>
  </Button>
  <Button
    variant="quiet"
    class={action}
    aria-label="Move to Wishlist"
    disabled={moveDisabled}
    onclick={() => move('wishlist')}
  >
    <Bookmark class="size-4" aria-hidden="true" />
    <span>Wishlist</span>
  </Button>
  <Button
    variant="danger-quiet"
    class="{action} ms-auto landscape:md:ms-0"
    aria-label="Delete team"
    data-preserve-team-name
    disabled={deleteDisabled || pending || movedId === teamId}
    onclick={ondelete}
  >
    <Trash2 class="size-4" aria-hidden="true" />
    <span>Delete</span>
  </Button>
  <CurrentSetSaveButton {teamId} {baseline} {members} {disabled} />
  <p
    role="alert"
    class="order-last basis-full px-2 text-sm {errorMessage
      ? 'pb-1'
      : 'sr-only'}"
    style="color: var(--color-error-content)"
  >
    {errorMessage}
  </p>
</div>
