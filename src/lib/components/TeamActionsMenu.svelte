<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { DropdownMenu } from 'bits-ui';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Plus from '@lucide/svelte/icons/plus';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    onswap: () => void;
    swapDisabled: boolean;
    moveDisabled: boolean;
    onmove: () => void;
    pending: boolean;
  }

  let { onswap, swapDisabled, moveDisabled, onmove, pending }: Props = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="quiet"
        size="icon-compact"
        aria-label="More team actions"
      >
        <Ellipsis class="size-4" aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      side="right"
      align="start"
      sideOffset={8}
      class="picker-popover-enter z-50 min-w-48 rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 text-base-content shadow-lg"
    >
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-highlighted:bg-info data-highlighted:text-info-content"
        onSelect={() => void goto(resolve('my-teams/new'))}
      >
        <Plus class="size-4" aria-hidden="true" />
        Add custom team
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-disabled:opacity-50 data-highlighted:bg-info data-highlighted:text-info-content"
        disabled={moveDisabled || pending}
        onSelect={onmove}
      >
        <Bookmark class="size-4" aria-hidden="true" />
        Move to Wishlist
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-disabled:opacity-50 data-highlighted:bg-info data-highlighted:text-info-content"
        disabled={swapDisabled}
        onSelect={onswap}
      >
        <ArrowLeftRight class="size-4" aria-hidden="true" />
        Change a Pokémon
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
