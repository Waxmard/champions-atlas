<script lang="ts">
  import type { Snippet } from 'svelte';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import MovePill from '#lib/components/MovePill.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import TypeBadge from '#lib/components/TypeBadge.svelte';
  import UnknownValue from '#lib/components/UnknownValue.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { Member } from '#lib/catalog.js';
  import { getPokemonTypes, TYPE_COLORS } from '#lib/types.js';
  import { activeSpreadSource } from '#lib/spread-provenance.js';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

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
    onrevert?: () => void;
    revertDisabled?: boolean;
    revertReason?: string;
    actions?: Snippet;
  }

  let {
    member,
    slot,
    editable = false,
    editing = false,
    class: className = '',
    onedit,
    onrevert,
    revertDisabled = false,
    revertReason = '',
    actions,
  }: Props = $props();

  const types = $derived(getPokemonTypes(member.pokemon));
  const spreadSource = $derived(activeSpreadSource(member));
  const rowClass =
    'flex min-h-11 w-full items-baseline justify-between gap-3 rounded-[var(--radius-field)] px-1.5 py-1 text-start';
</script>

<div
  class="relative flex min-w-0 flex-col {editable
    ? 'px-2.5 pt-2 pb-1.5'
    : 'px-4 pt-3 pb-4'} {className}"
  style="--type-color: {TYPE_COLORS[types[0]]}"
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
        variant="quiet"
        class="shrink-0"
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
  {#if spreadSource}
    <div class="mt-1 flex flex-col">
      <a
        class="inline-flex min-h-11 link items-center focus-visible:ring-2 focus-visible:ring-primary"
        href={spreadSource.pasteUrl}
        target="_blank"
        rel="external noreferrer"
      >
        {spreadSource.borrowedNature
          ? 'EVs and Nature from linked creator paste'
          : 'EVs from linked creator paste'}
      </a>
      {#each spreadSource.videoUrls as videoUrl, index (videoUrl)}
        <a
          class="inline-flex min-h-11 link items-center text-sm focus-visible:ring-2 focus-visible:ring-primary"
          href={videoUrl}
          target="_blank"
          rel="external noreferrer"
          aria-label={`Video provenance ${index + 1} for ${member.pokemon}'s linked creator paste`}
          >Video provenance {index + 1}</a
        >
      {/each}
    </div>
  {/if}

  <!-- Moves -->
  <div class="mt-2 border-t pt-2">
    <div class="flex items-baseline justify-between gap-3 px-1.5">
      <span class="term">Moves</span>
    </div>
    <div class="mt-1">
      {#if editable}
        <button
          type="button"
          class="w-full rounded-sm p-0.5 text-start focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
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
    <div
      data-slot="card-actions"
      class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-1"
    >
      {@render actions?.()}
      {#if onrevert && !revertDisabled}<Button
          variant="quiet"
          aria-label={`Revert changes for ${member.pokemon}`}
          onclick={() => onrevert?.()}
        >
          <RotateCcw class="size-3" />
          <span>Revert changes</span>
        </Button>{/if}
      <Button
        variant="quiet"
        aria-label={`Edit set for ${member.pokemon}`}
        data-set-field="set"
        disabled={editing}
        onclick={() => onedit?.('set')}
      >
        <span>Edit set</span>
      </Button>
    </div>
    {#if revertReason}<p class="provenance mt-1">
        {revertReason}
      </p>{/if}
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
      <UnknownValue />
    {:else if item !== undefined}
      <span class="value inline-flex min-w-0 items-center gap-1.5">
        <ItemIcon {item} size={16} />
        <span class="min-w-0 wrap-anywhere">{value}</span>
      </span>
    {:else}
      <span
        class="value min-w-0 {field === 'spread'
          ? 'text-end wrap-break-word'
          : field === 'ability' || field === 'nature'
            ? 'text-end wrap-anywhere'
            : 'truncate'}">{value}</span
      >
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
    <p class="unknown py-3 text-center text-[0.8125rem]">Unknown</p>
  {/if}
{/snippet}
