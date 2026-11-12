<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { DropdownMenu } from 'bits-ui';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Copy from '@lucide/svelte/icons/copy';
  import Plus from '@lucide/svelte/icons/plus';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    oncopy: () => void;
    disabled: boolean;
  }

  let { oncopy, disabled }: Props = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger {disabled}>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="quiet"
        size="icon-compact"
        class="min-h-11 min-w-11"
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
      class="surface popover-motion z-50 min-w-48 p-1 text-base-content shadow-lg outline-none"
    >
      <DropdownMenu.Item class="option-row" onSelect={oncopy}>
        <Copy class="size-4" aria-hidden="true" />
        Copy team text
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="option-row"
        onSelect={() => void goto(resolve('my-teams/new'))}
      >
        <Plus class="size-4" aria-hidden="true" />
        Add custom team
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
