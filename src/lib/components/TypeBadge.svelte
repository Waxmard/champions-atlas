<script lang="ts">
  import { getTypeIcon, TYPE_COLORS, type PokemonType } from '$lib/types';

  interface Props {
    type: string;
    size?: 'sm' | 'md';
    showLabel?: boolean;
    class?: string;
  }

  let {
    type,
    size = 'sm',
    showLabel = false,
    class: className = '',
  }: Props = $props();

  const normalizedType = $derived(type.toLowerCase() as PokemonType);
  const color = $derived(
    TYPE_COLORS[normalizedType] || { bg: '#A8A878', text: '#fff' }
  );
  const label = $derived(
    type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  );
</script>

{#if showLabel}
  <span
    class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-none font-semibold shadow-2xs {className}"
    style="background-color: {color.bg}; color: {color.text};"
  >
    <img
      src={getTypeIcon(type)}
      alt=""
      aria-hidden="true"
      class="shrink-0 object-contain {size === 'md' ? 'size-4' : 'size-3.5'}"
    />
    <span>{label}</span>
  </span>
{:else}
  <img
    src={getTypeIcon(type)}
    alt={type}
    class="shrink-0 object-contain {size === 'md'
      ? 'size-4'
      : 'size-3.5'} {className}"
  />
{/if}
