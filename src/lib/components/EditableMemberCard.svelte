<script lang="ts">
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { Member } from '$lib/catalog';
  import {
    getCardBackgroundStyle,
    getMoveType,
    getTypeIcon,
    TYPE_COLORS,
  } from '$lib/types';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import FileText from '@lucide/svelte/icons/file-text';

  type EditableSetField =
    'pokemon' | 'item' | 'ability' | 'nature' | 'spread' | 'moves' | 'text';

  let {
    member,
    editing,
    onedit,
  }: {
    member: Member;
    editing: boolean;
    onedit: (field: EditableSetField) => void;
  } = $props();

  const cardStyle = $derived(getCardBackgroundStyle(member.pokemon));
</script>

<div
  class="relative flex flex-col rounded-xl p-3 transition-all duration-300 ease-out sm:p-3.5"
  style={cardStyle}
>
  <!-- Header: Sprite + Name + Change Action -->
  <div class="flex items-center justify-between gap-2">
    <div class="flex min-w-0 items-center gap-2.5">
      <div class="relative shrink-0 drop-shadow-xs filter">
        <PokemonSprite pokemon={member.pokemon} size={48} />
      </div>
      <div class="min-w-0">
        <h2 class="truncate text-base font-semibold tracking-tight">
          {member.pokemon}
        </h2>
        <!-- EV compact badge -->
        <button
          type="button"
          class="mt-0.5 inline-flex items-center font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Edit ${member.pokemon} EVs`}
          data-set-field="spread"
          onclick={() => onedit('spread')}
        >
          {member.spread || 'No EVs'}
        </button>
      </div>
    </div>

    <!-- Change Pokemon quick toggle -->
    <!-- Change Pokemon button -->
    <Button
      variant="outline"
      size="sm"
      class="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs shadow-xs"
      aria-label={`Change ${member.pokemon}`}
      disabled={editing}
      onclick={() => onedit('pokemon')}
    >
      <ArrowLeftRight class="size-3.5" />
      <span>Change</span>
    </Button>
  </div>

  <!-- Pills Row: Item, Ability, Nature -->
  <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
    <!-- Item Chip -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium backdrop-blur-xs transition-colors hover:border-primary/50 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Edit ${member.pokemon} item`}
      data-set-field="item"
      onclick={() => onedit('item')}
    >
      {#if member.item}
        <ItemIcon item={member.item} size={16} />
      {/if}
      <span class="max-w-[120px] truncate">{member.item || 'Unknown'}</span>
    </button>

    <!-- Ability Chip -->
    <button
      type="button"
      class="inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium text-foreground/90 backdrop-blur-xs transition-colors hover:border-primary/50 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Edit ${member.pokemon} ability`}
      data-set-field="ability"
      onclick={() => onedit('ability')}
    >
      <p class="max-w-[150px] truncate">
        {member.ability ? `Ability: ${member.ability}` : 'Ability unknown'}
      </p>
    </button>

    <!-- Nature Chip -->
    <button
      type="button"
      class="inline-flex items-center rounded-md border border-border/60 bg-background/80 px-2 py-1 font-medium text-muted-foreground backdrop-blur-xs transition-colors hover:border-primary/50 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Edit ${member.pokemon} nature`}
      data-set-field="nature"
      onclick={() => onedit('nature')}
    >
      <span>{member.nature || 'Unknown'}</span>
    </button>
  </div>

  <!-- Moves: 2x2 grid of pills with type icon and subtle type tint -->
  <div class="mt-2.5">
    <button
      type="button"
      class="w-full rounded-lg p-0.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Edit ${member.pokemon} moves`}
      data-set-field="moves"
      onclick={() => onedit('moves')}
    >
      {#if member.moves.length}
        <div class="grid grid-cols-2 gap-1.5 text-xs">
          {#each [0, 1, 2, 3] as i (i)}
            {@const currentMove = member.moves[i]}
            {@const type = currentMove ? getMoveType(currentMove) : null}
            {@const typeColor = type ? TYPE_COLORS[type] : null}
            <div
              class="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2 py-1.5 shadow-2xs transition-colors"
              style={typeColor ? `border-left: 3px solid ${typeColor.bg};` : ''}
            >
              {#if type}
                <img
                  src={getTypeIcon(type)}
                  alt={type}
                  class="size-3.5 shrink-0 object-contain"
                />
              {:else}
                <div class="size-3.5 shrink-0 rounded-full bg-muted"></div>
              {/if}
              <span
                class="truncate font-medium {currentMove
                  ? 'text-foreground'
                  : 'text-muted-foreground italic'}"
              >
                {currentMove || 'Empty'}
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <div
          class="rounded-md border border-dashed border-border/60 bg-background/60 py-2.5 text-center text-xs text-muted-foreground italic"
        >
          Moves unknown
        </div>
      {/if}
    </button>
  </div>

  <!-- Footer Actions: Edit set text -->
  <div class="mt-2.5 flex justify-end">
    <Button
      variant="ghost"
      size="sm"
      class="h-7 gap-1 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label={`Edit ${member.pokemon} set text`}
      data-set-field="text"
      onclick={() => onedit('text')}
    >
      <FileText class="size-3" />
      <span>Edit set text</span>
    </Button>
  </div>
</div>
