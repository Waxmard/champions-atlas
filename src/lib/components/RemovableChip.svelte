<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    label,
    onremove,
    disabled = false,
    children,
  }: {
    label: string;
    onremove: () => void;
    disabled?: boolean;
    children: Snippet;
  } = $props();
</script>

<span
  class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-base-300 bg-base-100 ps-3 text-sm font-semibold"
>
  <span class="flex min-w-0 items-center gap-1.5">{@render children()}</span>
  <Button
    type="button"
    variant="quiet"
    size="icon-compact"
    class="shrink-0 rounded-full"
    aria-label={`Remove ${label}`}
    {disabled}
    onclick={onremove}><X class="size-4" aria-hidden="true" /></Button
  >
</span>
