<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileText from '@lucide/svelte/icons/file-text';
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

<div class="grid gap-3.5">
  <!-- Species Tile -->
  <div
    class="flex items-center justify-between rounded-xl border border-base-300 bg-base-100 p-3.5 shadow-2xs transition-colors hover:border-primary/40"
    data-editor-section="pokemon"
  >
    <div class="flex min-w-0 items-center gap-3">
      <PokemonSprite {pokemon} size={36} />
      <div class="min-w-0">
        <div
          class="text-xs font-semibold tracking-wider text-base-content/60 uppercase"
        >
          Species
        </div>
        <div class="truncate text-base font-semibold">{pokemon}</div>
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
    class="group flex min-h-11 flex-col rounded-xl border border-base-300 bg-base-100 p-3.5 text-left shadow-2xs transition-all hover:border-primary/50 hover:bg-base-200/40"
    aria-label="Edit item, ability, and nature"
    onclick={() => onnavigate('details')}
    data-editor-section="item"
  >
    <div class="mb-2 flex w-full items-center justify-between gap-2">
      <span
        class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
      >
        Item, ability, and nature
      </span>
      <ChevronRight
        class="size-4 text-base-content/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <div
        class="flex items-center gap-1.5 rounded-lg border border-base-300/60 bg-base-200/80 px-2.5 py-1 text-xs font-medium"
      >
        <ItemIcon {item} size={18} />
        <span class="max-w-[130px] truncate">{item || 'Item unknown'}</span>
      </div>
      <div
        class="flex items-center gap-1.5 rounded-lg border border-base-300/60 bg-base-200/80 px-2.5 py-1 text-xs font-medium"
      >
        <span class="text-base-content/50">✨</span>
        <span class="max-w-[130px] truncate"
          >{ability || 'Ability unknown'}</span
        >
      </div>
      <div
        class="flex items-center gap-1.5 rounded-lg border border-base-300/60 bg-base-200/80 px-2.5 py-1 text-xs font-medium"
      >
        <span class="text-base-content/50">🌿</span>
        <span class="max-w-[130px] truncate">{nature || 'Nature unknown'}</span>
      </div>
    </div>
  </button>

  <!-- Moves Tile (2x2 Grid) -->
  <button
    type="button"
    class="group flex min-h-11 flex-col rounded-xl border border-base-300 bg-base-100 p-3.5 text-left shadow-2xs transition-all hover:border-primary/50 hover:bg-base-200/40"
    aria-label="Edit moves"
    onclick={() => onnavigate('moves')}
    data-editor-section="moves"
  >
    <div class="mb-2.5 flex w-full items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span
          class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
        >
          Moves
        </span>
        <span class="badge font-mono badge-sm text-[10px] badge-neutral">
          {moves.filter((m) => m.trim()).length}/4 moves
        </span>
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
            class="flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-base-300 bg-base-200/40 px-2.5 py-2 text-sm text-base-content/50"
          >
            <div class="size-4 shrink-0 rounded-full bg-base-300/60"></div>
            <span class="text-xs italic">Empty slot {index + 1}</span>
          </div>
        {/if}
      {/each}
    </div>
  </button>

  <!-- EV Spread Tile -->
  <button
    type="button"
    class="group flex min-h-11 flex-col rounded-xl border border-base-300 bg-base-100 p-3.5 text-left shadow-2xs transition-all hover:border-primary/50 hover:bg-base-200/40"
    aria-label="Edit EV spread"
    onclick={() => onnavigate('spread')}
    data-editor-section="spread"
  >
    <div class="mb-2 flex w-full items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span
          class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
        >
          EV spread
        </span>
        <span
          class="badge font-mono badge-sm text-[10px] {currentSpreadTotal === 66
            ? 'badge-success'
            : 'badge-warning'}"
        >
          {currentSpreadTotal}/66 EVs
        </span>
      </div>
      <ChevronRight
        class="size-4 text-base-content/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </div>
    <div class="flex w-full items-center justify-between gap-3">
      <span class="truncate font-mono text-xs font-medium text-base-content/90">
        {spread || 'No EVs'}
      </span>
      <div class="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-base-300">
        <div
          class="h-full transition-all {currentSpreadTotal === 66
            ? 'bg-success'
            : 'bg-warning'}"
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
    <p role="alert" class="mt-2 text-sm font-medium text-error">
      {error}
    </p>
  {/if}
</div>
