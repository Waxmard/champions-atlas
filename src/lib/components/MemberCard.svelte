<script lang="ts">
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import MovePill from '$lib/components/MovePill.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { Member } from '$lib/catalog';
  import { getCardBackgroundStyle, getPokemonTypes } from '$lib/types';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import FileText from '@lucide/svelte/icons/file-text';

  export type EditableSetField =
    'pokemon' | 'item' | 'ability' | 'nature' | 'spread' | 'moves' | 'text';

  interface Props {
    member: Member;
    slot?: number;
    editable?: boolean;
    editing?: boolean;
    pending?: boolean;
    class?: string;
    onedit?: (field: EditableSetField) => void;
  }

  let {
    member,
    slot,
    editable = false,
    editing = false,
    pending = false,
    class: className = '',
    onedit,
  }: Props = $props();

  const cardStyle = $derived(getCardBackgroundStyle(member.pokemon, pending));
  const types = $derived(getPokemonTypes(member.pokemon));
</script>

<div
  class="relative flex min-w-0 flex-col transition-all duration-300 ease-out {editable
    ? 'rounded-xl p-3 sm:p-3.5'
    : 'rounded-2xl border bg-card p-4 shadow-2xs sm:p-5'} {className}"
  style={cardStyle}
>
  <!-- Header: Sprite + Name/Types + Slot + EV Spread + (optional) Change Action -->
  <div class="flex items-center justify-between gap-2">
    <div class="flex min-w-0 items-center gap-2.5">
      <div class="relative shrink-0 drop-shadow-xs filter">
        <PokemonSprite pokemon={member.pokemon} size={48} />
      </div>
      <div class="min-w-0">
        {#if slot !== undefined}
          <div class="mb-0.5 text-[11px] font-medium text-muted-foreground">
            Slot {slot}
          </div>
        {/if}
        <div class="flex flex-wrap items-center gap-1.5">
          <h2 class="truncate text-base font-semibold tracking-tight">
            {member.pokemon}
          </h2>
          <div class="flex items-center gap-1">
            {#each types as type (type)}
              <TypeBadge {type} size="sm" />
            {/each}
          </div>
        </div>
        <!-- EV compact badge -->
        {#if editable}
          <button
            type="button"
            class="mt-0.5 inline-flex items-center font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Edit ${member.pokemon} EVs`}
            data-set-field="spread"
            onclick={() => onedit?.('spread')}
          >
            {member.spread || 'No EVs'}
          </button>
        {:else}
          <span
            class="mt-0.5 inline-flex items-center font-mono text-xs text-muted-foreground"
          >
            {member.spread || 'No EVs'}
          </span>
        {/if}
      </div>
    </div>

    {#if editable}
      <!-- Change Pokemon button -->
      <Button
        variant="outline"
        size="sm"
        class="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs shadow-xs"
        aria-label={`Change ${member.pokemon}`}
        disabled={editing}
        onclick={() => onedit?.('pokemon')}
      >
        <ArrowLeftRight class="size-3.5" />
        <span>Change</span>
      </Button>
    {/if}
  </div>

  <!-- Pills Row: Item, Ability, Nature -->
  <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
    {#if editable}
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium backdrop-blur-xs transition-colors hover:border-primary/50 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Edit ${member.pokemon} item`}
        data-set-field="item"
        onclick={() => onedit?.('item')}
      >
        {@render itemContent()}
      </button>

      <button
        type="button"
        class="inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium text-foreground/90 backdrop-blur-xs transition-colors hover:border-primary/50 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Edit ${member.pokemon} ability`}
        data-set-field="ability"
        onclick={() => onedit?.('ability')}
      >
        {@render abilityContent()}
      </button>

      <button
        type="button"
        class="inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium text-muted-foreground backdrop-blur-xs transition-colors hover:border-primary/50 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Edit ${member.pokemon} nature`}
        data-set-field="nature"
        onclick={() => onedit?.('nature')}
      >
        {@render natureContent()}
      </button>
    {:else}
      <div
        class="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium backdrop-blur-xs"
      >
        {@render itemContent()}
      </div>

      <div
        class="inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium text-foreground/90 backdrop-blur-xs"
      >
        {@render abilityContent()}
      </div>

      <div
        class="inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium text-muted-foreground backdrop-blur-xs"
      >
        {@render natureContent()}
      </div>
    {/if}
  </div>

  <!-- Moves: 2x2 grid of MovePills -->
  <div class="mt-2.5">
    {#if editable}
      <button
        type="button"
        class="w-full rounded-lg p-0.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Edit ${member.pokemon} moves`}
        data-set-field="moves"
        onclick={() => onedit?.('moves')}
      >
        {@render movesContent()}
      </button>
    {:else}
      {@render movesContent()}
    {/if}
  </div>

  {#snippet itemContent()}
    {#if member.item}
      <ItemIcon item={member.item} size={16} />
    {/if}
    <span class="max-w-[120px] truncate"
      >{member.item || (editable ? 'Unknown' : 'Item unknown')}</span
    >
  {/snippet}

  {#snippet abilityContent()}
    <p class="max-w-[150px] truncate">
      {member.ability ? `Ability: ${member.ability}` : 'Ability unknown'}
    </p>
  {/snippet}

  {#snippet natureContent()}
    <span>{member.nature || (editable ? 'Unknown' : 'Nature unknown')}</span>
  {/snippet}

  {#snippet movesContent()}
    {#if member.moves.length}
      <div class="grid grid-cols-2 gap-1.5 text-xs">
        {#each [0, 1, 2, 3] as i (i)}
          <MovePill move={member.moves[i] || ''} />
        {/each}
      </div>
    {:else}
      <div
        class="rounded-md border border-dashed border-border/60 bg-background/60 py-2.5 text-center text-xs text-muted-foreground italic"
      >
        Moves unknown
      </div>
    {/if}
  {/snippet}

  <!-- Footer Actions: Edit set text -->
  {#if editable}
    <div class="mt-2.5 flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Edit ${member.pokemon} set text`}
        data-set-field="text"
        onclick={() => onedit?.('text')}
      >
        <FileText class="size-3" />
        <span>Edit set text</span>
      </Button>
    </div>
  {/if}
</div>
