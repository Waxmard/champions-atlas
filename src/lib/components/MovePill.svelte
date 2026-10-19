<script lang="ts">
  import TypeMark from '$lib/components/TypeMark.svelte';
  import { getMoveType, TYPE_COLORS } from '$lib/types';

  interface Props {
    move: string;
    size?: 'sm' | 'md';
    class?: string;
  }

  let { move, size = 'sm', class: className = '' }: Props = $props();

  const trimmedMove = $derived(move?.trim() ?? '');
  const type = $derived(trimmedMove ? getMoveType(trimmedMove) : null);
  const typeColor = $derived(type ? TYPE_COLORS[type] : null);
  const shared = $derived(
    'flex min-w-0 items-center gap-1.5 py-1 text-start ' +
      (size === 'md' ? 'text-sm' : 'text-[0.8125rem]')
  );
</script>

<div
  class="{shared} border-s-2 ps-1.5 {className}"
  style={typeColor ? `border-inline-start-color: ${typeColor};` : ''}
>
  <TypeMark {type} size={size === 'md' ? 'md' : 'sm'} />
  <span class="truncate {trimmedMove ? '' : 'text-[color:var(--color-muted)]'}">
    {trimmedMove || 'Empty'}
  </span>
</div>
