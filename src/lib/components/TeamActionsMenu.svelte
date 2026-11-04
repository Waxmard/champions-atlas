<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { DropdownMenu } from 'bits-ui';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Copy from '@lucide/svelte/icons/copy';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import Plus from '@lucide/svelte/icons/plus';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    oncopy: () => void;
    onmanage: () => void;
    onswap: () => void;
    swapDisabled: boolean;
    disabled: boolean;
  }

  let { oncopy, onmanage, onswap, swapDisabled, disabled }: Props = $props();
  let actionAfterClose: (() => void) | undefined;

  function focusAfterClose(event: Event) {
    if (!actionAfterClose) return;
    event.preventDefault();
    const action = actionAfterClose;
    actionAfterClose = undefined;
    action();
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger {disabled}>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="quiet"
        size="icon-compact"
        class="min-h-11 min-w-11"
        id="team-actions"
        aria-label="Team actions"
        data-team-action="menu"
        {disabled}
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
      class="picker-popover-enter z-50 min-w-48 rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 text-base-content shadow-lg"
    >
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-highlighted:bg-info data-highlighted:text-info-content"
        onSelect={oncopy}
      >
        <Copy class="size-4" aria-hidden="true" />
        Copy team text
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-highlighted:bg-info data-highlighted:text-info-content"
        onSelect={() => (actionAfterClose = onmanage)}
      >
        <Settings2 class="size-4" aria-hidden="true" />
        Manage team
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-highlighted:bg-info data-highlighted:text-info-content"
        onSelect={() => void goto(resolve('my-teams/new'))}
      >
        <Plus class="size-4" aria-hidden="true" />
        Add custom team
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="option-row cursor-pointer outline-none data-disabled:opacity-50 data-highlighted:bg-info data-highlighted:text-info-content"
        disabled={swapDisabled}
        onSelect={() => (actionAfterClose = onswap)}
      >
        <ArrowLeftRight class="size-4" aria-hidden="true" />
        Change a Pokémon
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
