<script lang="ts">
  import { tick, type ComponentProps } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { DropdownMenu } from 'bits-ui';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Plus from '@lucide/svelte/icons/plus';
  import AtlasIcon from '#lib/components/AtlasIcon.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import TeamActionsMenu from '#lib/components/TeamActionsMenu.svelte';

  let {
    collection,
    teamActions,
  }: {
    collection: 'my-teams' | 'wishlist';
    teamActions: ComponentProps<typeof TeamActionsMenu> | null;
  } = $props();
  let openImportAfterClose = false;

  function focusAfterClose(event: Event) {
    if (!openImportAfterClose) return;
    event.preventDefault();
    openImportAfterClose = false;
    void goto(resolve('wishlist#import-pokepaste'), {
      reset: false,
    }).then(async () => {
      await tick();
      document.getElementById('pokepaste-link')?.focus();
    });
  }
</script>

<header class="flex min-w-0 items-center gap-2">
  <nav
    aria-label="Team collections"
    class="grid w-full min-w-0 flex-1 grid-cols-2 items-center rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1"
  >
    <a
      href={resolve('my-teams')}
      aria-label="My Teams collection"
      aria-current={collection === 'my-teams' ? 'page' : undefined}
      class="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11 {collection ===
      'my-teams'
        ? 'bg-info text-info-content'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
    >
      <AtlasIcon />
      <span>My Teams</span>
    </a>
    <a
      href={resolve('wishlist')}
      aria-current={collection === 'wishlist' ? 'page' : undefined}
      class="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11 {collection ===
      'wishlist'
        ? 'bg-info text-info-content'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
    >
      <Bookmark class="size-4" aria-hidden="true" />
      <span>Wishlist</span>
    </a>
  </nav>
  {#if collection === 'wishlist'}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="quiet"
            size="icon-compact"
            class="min-h-11 min-w-11 shrink-0"
            id="wishlist-actions"
            aria-label="Wishlist actions"
          >
            <Ellipsis class="size-4" aria-hidden="true" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          onCloseAutoFocus={focusAfterClose}
          class="picker-popover-enter z-50 min-w-48 rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 text-base-content shadow-lg outline-none"
        >
          <DropdownMenu.Item
            class="option-row cursor-pointer outline-none data-highlighted:bg-info data-highlighted:text-info-content"
            onSelect={() => (openImportAfterClose = true)}
          >
            <Plus class="size-4" aria-hidden="true" />
            Add a Poképaste
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {:else if teamActions}
    <TeamActionsMenu {...teamActions} />
  {:else}
    <div class="size-11 shrink-0" aria-hidden="true"></div>
  {/if}
</header>
