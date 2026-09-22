<script lang="ts">
  import TypeMark from '$lib/components/TypeMark.svelte';
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
  const shared = $derived(
    'flex min-w-0 items-center gap-1.5 py-1 text-left ' +
      (size === 'md' ? 'text-sm' : 'text-[0.8125rem]')
  );
</script>

{#snippet content()}
  <TypeMark {type} size={size === 'md' ? 'md' : 'sm'} />
  <span class="truncate {trimmedMove ? '' : 'text-[color:var(--color-muted)]'}">
    {trimmedMove || 'Empty'}
  </span>
{/snippet}

{#if interactive}
  <button
    type="button"
    {onclick}
    class="{shared} rounded-sm border-l-2 pl-1.5 hover:bg-base-200/70 {className}"
    style={typeColor ? `border-left-color: ${typeColor};` : ''}
  >
    {@render content()}
  </button>
{:else}
  <div
    class="{shared} border-l-2 pl-1.5 {className}"
    style={typeColor ? `border-left-color: ${typeColor};` : ''}
  >
    {@render content()}
  </div>
{/if}
