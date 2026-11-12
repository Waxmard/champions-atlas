<script lang="ts">
  import type { Snippet } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import TypeMark from '#lib/components/TypeMark.svelte';
  import { getMoveType, typeRowWash } from '#lib/types.js';

  type Glyph = { kind: 'pokemon' | 'item' | 'move' | 'none'; value?: string };

  interface Props {
    label: string;
    primary?: string;
    secondary?: string;
    tertiary?: string;
    prefix?: string;
    glyph?: Glyph;
    selected?: boolean;
    disabled?: boolean;
    onclick: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    label,
    primary = '',
    secondary = '',
    tertiary = '',
    prefix = '',
    glyph,
    selected = false,
    disabled = false,
    onclick,
    children,
  }: Props = $props();
  const wash = $derived(
    glyph?.kind === 'move' && glyph.value
      ? typeRowWash(getMoveType(glyph.value))
      : ''
  );
</script>

<li>
  <button
    type="button"
    class="option-row w-full {tertiary ? 'py-1.5' : ''}"
    data-selected={selected}
    style:background-image={wash}
    aria-label={label}
    {disabled}
    onpointerdown={(event) => event.preventDefault()}
    {onclick}
  >
    {#if children}
      {@render children()}
    {:else}
      {#if glyph}
        <span
          class="grid size-7 shrink-0 place-items-center"
          aria-hidden="true"
        >
          {#if glyph.kind === 'pokemon' && glyph.value}
            <PokemonSprite pokemon={glyph.value} size={28} />
          {:else if glyph.kind === 'item' && glyph.value}
            <ItemIcon item={glyph.value} size={20} />
          {:else if glyph.kind === 'move' && glyph.value}
            <TypeMark type={getMoveType(glyph.value)} size="md" />
          {/if}
        </span>
      {/if}
      <span class="min-w-0 flex-1">
        <span class="block truncate font-semibold">
          {#if prefix}<span class="term me-1.5">{prefix}</span>{/if}{primary}
        </span>
        {#if secondary}
          <span class="provenance mt-0.5 block {tertiary ? 'truncate' : ''}"
            >{secondary}</span
          >
        {/if}
        {#if tertiary}
          <span class="provenance block truncate">{tertiary}</span>
        {/if}
      </span>
      {#if selected}
        <Check class="size-4 shrink-0 text-primary" aria-hidden="true" />
      {/if}
    {/if}
  </button>
</li>
