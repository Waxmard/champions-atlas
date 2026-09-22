<script lang="ts">
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import MovePill from '$lib/components/MovePill.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { Member } from '$lib/catalog';
  import { getPokemonTypes, TYPE_COLORS } from '$lib/types';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import FileText from '@lucide/svelte/icons/file-text';

  export type EditableSetField =
    | 'set'
    | 'pokemon'
    | 'item'
    | 'ability'
    | 'nature'
    | 'spread'
    | 'moves'
    | 'text';

  interface Props {
    member: Member;
    slot?: number;
    editable?: boolean;
    editing?: boolean;
    class?: string;
    onedit?: (field: EditableSetField) => void;
  }

  let {
    member,
    slot,
    editable = false,
    editing = false,
    class: className = '',
    onedit,
  }: Props = $props();

  const types = $derived(getPokemonTypes(member.pokemon));
  const rowClass =
    'flex min-h-11 w-full items-baseline justify-between gap-3 rounded-[var(--radius-field)] px-1.5 py-1 text-left';
</script>

<div
  class="relative flex min-w-0 flex-col {editable
    ? 'px-2.5 pt-2 pb-1.5'
    : 'px-4 pt-3 pb-4'} {className}"
  style="--type-color: {TYPE_COLORS[getPokemonTypes(member.pokemon)[0]]}"
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex min-w-0 items-start gap-2.5">
      <div class="roster-sprite shrink-0">
        <PokemonSprite pokemon={member.pokemon} size={editable ? 44 : 52} />
      </div>
      <div class="min-w-0 pt-0.5">
        {#if slot !== undefined}
          <p class="term leading-none">Slot {slot}</p>
        {/if}
        <p class="mt-1 text-lg leading-tight font-extrabold wrap-break-word">
          {member.pokemon}
        </p>
        <div class="mt-1 flex items-center gap-1.5">
          {#each types as type (type)}
            <span aria-hidden="true"><TypeBadge {type} size="sm" /></span>
            <span class="term leading-none">{type}</span>
          {/each}
        </div>
      </div>
    </div>

    {#if editable}
      <Button
        variant="outline"
        size="sm"
        class="min-h-11 shrink-0 gap-1.5 px-2.5 text-xs"
        aria-label={`Change ${member.pokemon}`}
        data-set-field="pokemon"
        disabled={editing}
        onclick={() => onedit?.('pokemon')}
      >
        <ArrowLeftRight class="size-3.5" />
        <span>Change</span>
      </Button>
    {/if}
  </div>

  {@render row(
    'Held item',
    member.item,
    'item',
    `Edit ${member.pokemon} item`,
    member.item ?? undefined
  )}
  {@render row(
    'Ability',
    member.ability,
    'ability',
    `Edit ${member.pokemon} ability`
  )}
  {@render row(
    'Nature',
    member.nature,
    'nature',
    `Edit ${member.pokemon} nature`
  )}
  {@render row('Spread', member.spread, 'spread', `Edit ${member.pokemon} EVs`)}

  <!-- Moves -->
  <div class="mt-2 border-t pt-2">
    <div class="flex items-baseline justify-between gap-3 px-1.5">
      <span class="term">Moves</span>
      {#if !editable && member.moves.length === 0}<span class="term"
          >not published</span
        >{/if}
    </div>
    <div class="mt-1">
      {#if editable}
        <button
          type="button"
          class="w-full rounded-sm p-0.5 text-left focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Edit ${member.pokemon} moves`}
          data-set-field="moves"
          disabled={editing}
          onclick={() => onedit?.('moves')}
        >
          {@render moves()}
        </button>
      {:else}
        {@render moves()}
      {/if}
    </div>
  </div>

  {#if editable}
    <div class="mt-2 flex flex-wrap justify-end gap-1 border-t pt-1.5">
      <Button
        variant="ghost"
        size="sm"
        class="min-h-11 gap-1 px-2 text-xs"
        aria-label={`Edit ${member.pokemon} set`}
        data-set-field="set"
        disabled={editing}
        onclick={() => onedit?.('set')}
      >
        <span>Edit set</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="min-h-11 gap-1 px-2 text-xs text-base-content/70 hover:text-base-content"
        aria-label={`Edit ${member.pokemon} set text`}
        data-set-field="text"
        disabled={editing}
        onclick={() => onedit?.('text')}
      >
        <FileText class="size-3" />
        <span>Edit set text</span>
      </Button>
    </div>
  {/if}
</div>

{#snippet row(
  term: string,
  value: string | null,
  field: EditableSetField,
  label: string,
  item?: string
)}
  {#snippet valueView()}
    {#if value === null}
      <span class="unknown rounded-xs px-1.5 py-px">Unknown</span>
    {:else if item !== undefined}
      <span class="value inline-flex min-w-0 items-center gap-1.5">
        <ItemIcon {item} size={16} />
        <span class="truncate">{value}</span>
      </span>
    {:else}
      <span class="value min-w-0 truncate">{value}</span>
    {/if}
  {/snippet}
  {#if editable}
    <button
      type="button"
      class="{rowClass} hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
      aria-label={label}
      data-set-field={field}
      disabled={editing}
      onclick={() => onedit?.(field)}
    >
      <span class="term shrink-0">{term}</span>
      {@render valueView()}
    </button>
  {:else}
    <div class={rowClass}>
      <span class="term shrink-0">{term}</span>
      {@render valueView()}
    </div>
  {/if}
{/snippet}

{#snippet moves()}
  {#if member.moves.length}
    <div class="grid grid-cols-2 gap-x-2 gap-y-1">
      {#each [0, 1, 2, 3] as i (i)}
        <MovePill move={member.moves[i] || ''} />
      {/each}
    </div>
  {:else}
    <p class="unknown rounded-xs py-3 text-center text-[0.8125rem]">
      Moves unknown
    </p>
  {/if}
{/snippet}
