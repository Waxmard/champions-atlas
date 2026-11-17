<script lang="ts">
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import Check from '@lucide/svelte/icons/check';
  import { DropdownMenu } from 'bits-ui';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    label,
    value,
    options,
    onchange,
    disabled,
  }: {
    label: string;
    value: string;
    options: readonly (readonly [string, string])[];
    onchange: (value: string) => void;
    disabled?: string;
  } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        type="button"
        variant="quiet"
        class="shrink-0 max-sm:h-11 max-sm:min-w-11 max-sm:px-1"
        aria-label={`${label}: ${options.find(([key]) => key === value)?.[1] ?? ''}`}
      >
        <ArrowUpDown class="size-4" aria-hidden="true" />
        <span class="max-sm:sr-only">Sort</span>
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
      <DropdownMenu.RadioGroup {value} onValueChange={onchange}>
        {#each options as [key, text] (key)}
          <DropdownMenu.RadioItem
            value={key}
            disabled={key === disabled}
            class="option-row data-disabled:opacity-50"
          >
            {#snippet children({ checked })}
              <Check
                class="size-4 {checked ? '' : 'invisible'}"
                aria-hidden="true"
              />
              {text}
            {/snippet}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
