<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let {
    label,
    status,
    class: className,
    children,
  }: {
    label: string;
    status?: string;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<details class={['group', className]}>
  <summary
    class="option-row -mx-3 cursor-pointer list-none rounded-field font-semibold [&::-webkit-details-marker]:hidden"
  >
    <span class="flex-1">{label}</span>
    {#if status}
      <span class="provenance font-normal">{status}</span>
    {/if}
    <ChevronDown
      class="size-4 transition-transform group-open:rotate-180"
      aria-hidden="true"
    />
  </summary>
  {@render children()}
</details>
