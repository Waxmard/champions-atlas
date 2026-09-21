<script lang="ts">
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { getMoveType, TYPE_COLORS } from '$lib/types';

  interface Props {
    move: string;
    size?: 'sm' | 'md';
    interactive?: boolean;
    onclick?: () => void;
    class?: string;
  }

  let {
    move,
    size = 'sm',
    interactive = false,
    onclick,
    class: className = '',
  }: Props = $props();

  const trimmedMove = $derived(move?.trim() ?? '');
  const type = $derived(trimmedMove ? getMoveType(trimmedMove) : null);
  const typeColor = $derived(type ? TYPE_COLORS[type] : null);
</script>

{#if interactive}
  <button
    type="button"
    {onclick}
    class="flex min-w-0 items-center gap-1.5 rounded-md border border-base-300/50 bg-base-200/90 text-left shadow-2xs transition-colors hover:border-primary/50 hover:bg-base-200 {size ===
    'md'
      ? 'px-2.5 py-2 text-sm'
      : 'px-2 py-1.5 text-xs'} {className}"
    style={typeColor ? `border-left: 3px solid ${typeColor};` : ''}
  >
    {@render content()}
  </button>
{:else}
  <div
    class="flex min-w-0 items-center gap-1.5 rounded-md border border-base-300/50 bg-base-200/90 shadow-2xs transition-colors {size ===
    'md'
      ? 'px-2.5 py-2 text-sm'
      : 'px-2 py-1.5 text-xs'} {className}"
    style={typeColor ? `border-left: 3px solid ${typeColor};` : ''}
  >
    {@render content()}
  </div>
{/if}

{#snippet content()}
  {#if type}
    <TypeBadge {type} size={size === 'md' ? 'md' : 'sm'} />
  {:else}
    <div
      class="{size === 'md'
        ? 'size-4'
        : 'size-3.5'} shrink-0 rounded-full bg-base-200"
    ></div>
  {/if}
  <span
    class="truncate font-medium {trimmedMove
      ? 'text-base-content'
      : 'text-base-content/70 italic'}"
  >
    {trimmedMove || 'Empty'}
  </span>
{/snippet}
