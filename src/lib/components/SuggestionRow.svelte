<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getContext } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import TypeMark from '#lib/components/TypeMark.svelte';
  import { handleSuggestionKeydown } from '#lib/suggestion-keyboard.js';
  import { getMoveType, typeRowWash } from '#lib/types.js';

  type Glyph = { kind: 'pokemon' | 'item' | 'move' | 'none'; value?: string };

  interface Props {
    label: string;
    primary?: string;
    secondary?: string;
    prefix?: string;
    glyph?: Glyph;
    selected?: boolean;
    disabled?: boolean;
    onclick: () => void;
    children?: Snippet;
  }

  let {
    label,
    primary = '',
    secondary = '',
    prefix = '',
    glyph,
    selected = false,
    disabled = false,
    onclick,
    children,
  }: Props = $props();
  const inputId = getContext<() => string>('suggestion-input-id') ?? (() => '');
  const wash = $derived(
    glyph?.kind === 'move' && glyph.value
      ? typeRowWash(getMoveType(glyph.value))
      : ''
  );
  function keydown(
    event: KeyboardEvent & { currentTarget: HTMLButtonElement }
  ) {
    handleSuggestionKeydown(
      event,
      event.currentTarget.closest('ul'),
      inputId()
    );
  }
</script>

<li>
  <button
    type="button"
    class="option-row w-full"
    data-suggestion
    data-selected={selected}
    style:background-image={wash}
    aria-label={label}
    {disabled}
    onpointerdown={(event) => event.preventDefault()}
    onkeydown={keydown}
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
          <span class="provenance mt-0.5 block">{secondary}</span>
        {/if}
      </span>
      {#if selected}
        <Check class="size-4 shrink-0 text-primary" aria-hidden="true" />
      {/if}
    {/if}
  </button>
</li>
