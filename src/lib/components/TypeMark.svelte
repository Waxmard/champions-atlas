<script lang="ts">
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  let { type, size = 'sm' }: { type: string | null; size?: 'sm' | 'md' } =
    $props();
</script>

{#if type}
  <TypeBadge {type} {size} />
{:else}
  <span
    class="block shrink-0 rounded-full bg-base-300 {size === 'md'
      ? 'size-4'
      : 'size-3.5'}"
    aria-hidden="true"
  ></span>
{/if}
