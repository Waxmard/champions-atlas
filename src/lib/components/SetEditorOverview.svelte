<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileText from '@lucide/svelte/icons/file-text';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import MovePill from '$lib/components/MovePill.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    pokemon: string;
    item: string;
    ability: string;
    nature: string;
    spread: string;
    moves: string[];
    currentSpreadTotal: number;
    error?: string;
    onnavigate: (
      view: 'pokemon' | 'details' | 'moves' | 'spread' | 'text'
    ) => void;
  }

  let {
    pokemon,
    item,
    ability,
    nature,
    spread,
    moves,
    currentSpreadTotal,
    error,
    onnavigate,
  }: Props = $props();

  const MOVE_SLOTS = [0, 1, 2, 3];
</script>

<div class="grid gap-3.5 pr-1 sm:pr-1.5">
  <!-- Species Tile -->
  <div
    class="plate flex items-center justify-between gap-3 p-3.5 pr-4.5 sm:p-4 sm:pr-5"
    data-editor-section="pokemon"
  >
    <div class="flex min-w-0 items-center gap-3">
      <PokemonSprite {pokemon} size={36} />
      <div class="min-w-0">
        <div class="term">Species</div>
        <div class="truncate text-[1.0625rem] leading-tight font-semibold">
          {pokemon}
        </div>
      </div>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="h-11 min-h-11 px-3"
      aria-label="Change Pokémon"
      onclick={() => onnavigate('pokemon')}
    >
      Change
    </Button>
  </div>

  <!-- Item, Ability & Nature Tile -->
  <button
    type="button"
    class="plate group flex min-h-11 flex-col p-3.5 pr-4.5 text-left hover:bg-base-200/70 sm:p-4 sm:pr-5"
    aria-label="Edit item, ability, and nature"
    onclick={() => onnavigate('details')}
    data-editor-section="item"
  >
    <div class="mb-2 flex w-full items-center justify-between gap-2">
      <span class="term">Item, ability, and nature</span>
      <ChevronRight
        class="size-4 text-base-content/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </div>
    <div class="grid w-full gap-1">
      <div class="flex min-w-0 items-baseline gap-3 border-b px-0.5 pb-0.5">
        <span class="term shrink-0">Held item</span>
        {#if item}
          <span class="value flex min-w-0 items-center gap-1.5">
            <ItemIcon {item} size={18} />
            <span class="truncate">{item}</span>
          </span>
        {:else}
          <span class="unknown rounded-xs px-1.5 py-px">Unknown</span>
        {/if}
      </div>
      <div class="flex min-w-0 items-baseline gap-3 border-b px-0.5 pb-0.5">
        <span class="term shrink-0">Ability</span>
        {#if ability}
          <span class="value flex min-w-0 items-center gap-1.5">
            <Sparkles class="size-3.5 shrink-0 text-base-content/50" />
            <span class="truncate">{ability}</span>
          </span>
        {:else}
          <span class="unknown rounded-xs px-1.5 py-px">Unknown</span>
        {/if}
      </div>
      <div class="flex min-w-0 items-baseline gap-3 px-0.5">
        <span class="term shrink-0">Nature</span>
        {#if nature}
          <span class="value flex min-w-0 items-center gap-1.5">
            <SlidersHorizontal class="size-3.5 shrink-0 text-base-content/50" />
            <span class="truncate">{nature}</span>
          </span>
        {:else}
          <span class="unknown rounded-xs px-1.5 py-px">Unknown</span>
        {/if}
      </div>
    </div>
  </button>

  <!-- Moves Tile (2x2 Grid) -->
  <button
    type="button"
    class="plate group flex min-h-11 flex-col p-3.5 pr-4.5 text-left hover:bg-base-200/70 sm:p-4 sm:pr-5"
    aria-label="Edit moves"
    onclick={() => onnavigate('moves')}
    data-editor-section="moves"
  >
    <div class="mb-2.5 flex w-full items-center justify-between gap-2">
      <div class="flex items-baseline gap-3">
        <span class="term">Moves</span>
        <span class="provenance"
          >{moves.filter((m) => m.trim()).length}/4 moves</span
        >
      </div>
      <ChevronRight
        class="size-4 text-base-content/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </div>
    <div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      {#each MOVE_SLOTS as index (index)}
        {@const move = moves[index]?.trim()}
        {#if move}
          <MovePill {move} size="md" interactive={false} class="w-full" />
        {:else}
          <div
            class="flex min-w-0 items-center gap-1.5 border-l-2 py-1 pl-1.5 text-base-content/50"
          >
            <div class="size-3.5 shrink-0 rounded-full bg-base-300"></div>
            <span class="term">Empty slot {index + 1}</span>
          </div>
        {/if}
      {/each}
    </div>
  </button>

  <!-- EV Spread Tile -->
  <button
    type="button"
    class="plate group flex min-h-11 flex-col p-3.5 pr-4.5 text-left hover:bg-base-200/70 sm:p-4 sm:pr-5"
    aria-label="Edit EV spread"
    onclick={() => onnavigate('spread')}
    data-editor-section="spread"
  >
    <div class="mb-2 flex w-full items-center justify-between gap-2">
      <div class="flex items-baseline gap-3">
        <span class="term">EV spread</span>
        <span
          class="value"
          style={currentSpreadTotal > 66
            ? 'color: var(--color-error-content)'
            : ''}>{currentSpreadTotal}/66 points</span
        >
      </div>
      <ChevronRight
        class="size-4 text-base-content/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </div>
    <div class="flex w-full items-center justify-between gap-3">
      {#if spread}
        <span class="value truncate">{spread}</span>
      {:else}
        <span class="unknown rounded-xs px-1.5 py-px">Unknown</span>
      {/if}
      <div class="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-base-300">
        <div
          class="h-full bg-primary transition-all"
          style="width: {Math.min(
            100,
            Math.round((currentSpreadTotal / 66) * 100)
          )}%"
        ></div>
      </div>
    </div>
  </button>

  <!-- Showdown Text Link -->
  <div class="pt-1 text-center">
    <Button
      variant="ghost"
      size="sm"
      class="min-h-11 text-xs text-base-content/70 hover:text-base-content"
      aria-label="Edit Showdown text"
      onclick={() => onnavigate('text')}
    >
      <FileText class="mr-1.5 size-3.5" />
      <span>Advanced: Showdown set text</span>
    </Button>
  </div>

  {#if error}
    <p
      role="alert"
      class="text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {error}
    </p>
  {/if}
</div>
