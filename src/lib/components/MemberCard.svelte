<script lang="ts">
  import type { Snippet } from 'svelte';
  import { localImageSrc } from '#lib/assets.js';
  import type { Member } from '#lib/catalog.js';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import TypeBadge from '#lib/components/TypeBadge.svelte';
  import {
    CHAMPIONS_STATS,
    natureEffect,
    parseChampionsSpread,
  } from '#lib/paste.js';
  import {
    getMoveType,
    getPokemonTypes,
    TYPE_COLORS,
    type PokemonType,
  } from '#lib/types.js';

  export type EditableSetField =
    'set' | 'pokemon' | 'item' | 'ability' | 'nature' | 'spread' | 'moves';

  const ZERO_SPREAD = {
    HP: 0,
    Atk: 0,
    Def: 0,
    SpA: 0,
    SpD: 0,
    Spe: 0,
  } as const;
  interface Props {
    member: Member;
    onopen?: () => void;
    onedit?: (field: EditableSetField, moveIndex?: number) => void;
    actions?: Snippet;
    disabled?: boolean;
    openButton?: HTMLButtonElement | null;
  }

  let {
    member,
    onopen,
    onedit,
    actions,
    disabled = false,
    openButton = $bindable(null),
  }: Props = $props();
  const types = $derived(getPokemonTypes(member.pokemon));
  const effect = $derived(natureEffect(member.nature));
  const spread = $derived(
    member.spread?.trim() ? parseChampionsSpread(member.spread) : ZERO_SPREAD
  );
  const itemSrc = $derived(
    member.item?.trim() ? localImageSrc('items', member.item) : ''
  );
  const band = $derived(
    `linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[types[0]]} 24%, var(--color-base-100)), color-mix(in oklab, ${TYPE_COLORS[types[types.length - 1]]} 24%, var(--color-base-100)))`
  );
  function moveBarStyle(type: PokemonType | null): string {
    return type
      ? `background: linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[type]} 28%, var(--color-base-100)) 0%, color-mix(in oklab, ${TYPE_COLORS[type]} 16%, var(--color-base-100)) 100%); border: 1px solid color-mix(in oklab, ${TYPE_COLORS[type]} 38%, var(--color-base-300));`
      : 'background: var(--color-base-200); border: 1px solid var(--color-base-300);';
  }
  function clickablePlate(node: HTMLElement) {
    const handleClick = () => {
      if (!onedit && onopen && !disabled) {
        openButton?.focus({ preventScroll: true });
        onopen();
      }
    };
    node.addEventListener('click', handleClick);
    return {
      destroy() {
        node.removeEventListener('click', handleClick);
      },
    };
  }
</script>

{#snippet abilityContent()}
  {#if member.ability?.trim()}
    <span
      class="line-clamp-2 min-w-0 text-sm wrap-break-word"
      title={member.ability}
    >
      <span class="sr-only">Ability: </span>{member.ability}
    </span>
  {:else}
    <span class="text-xs text-[color:var(--color-muted)]">Unknown ability</span>
  {/if}
{/snippet}

{#snippet itemContent()}
  {#if itemSrc}
    <ItemIcon item={member.item ?? ''} size={28} />
  {:else}
    <span
      aria-hidden="true"
      class="grid size-7 place-items-center rounded-[var(--radius-field)] bg-base-200 text-sm font-bold text-[color:var(--color-muted)]"
      >?</span
    >
  {/if}
  <span class="sr-only"
    >{member.item?.trim() ? `Item: ${member.item}` : 'Unknown item'}</span
  >
{/snippet}

{#snippet spreadContent()}
  {#if spread === null}
    <span
      class="line-clamp-2 text-[0.8125rem] wrap-anywhere tabular-nums"
      title={member.spread}
    >
      {member.spread}
    </span>
  {:else}
    <span
      class="grid w-full grid-cols-6 text-center"
      title={member.nature ? `${member.nature} nature` : undefined}
    >
      {#each CHAMPIONS_STATS as stat (stat)}
        {@const tone =
          effect?.raised === stat
            ? 'raised'
            : effect?.lowered === stat
              ? 'lowered'
              : ''}
        <span class="min-w-0">
          <span
            class="block text-[0.6875rem] leading-[1.4] font-bold {tone ===
            'raised'
              ? 'text-[color:var(--color-error-content)]'
              : tone === 'lowered'
                ? 'text-[color:var(--color-info-content)]'
                : 'text-[color:var(--color-muted)]'}"
          >
            {stat}{#if tone}<span class="sr-only">, {tone} by nature</span>{/if}
          </span>
          <span class="block text-[0.8125rem] tabular-nums">
            <span class={spread[stat] ? '' : 'text-[color:var(--color-muted)]'}
              >{spread[stat]}</span
            >{#if tone}<span
                aria-hidden="true"
                class="text-[0.625rem] font-bold {tone === 'raised'
                  ? 'text-[color:var(--color-error-content)]'
                  : 'text-[color:var(--color-info-content)]'}"
                >{tone === 'raised' ? '↑' : '↓'}</span
              >{/if}
          </span>
          <span
            aria-hidden="true"
            class="mx-auto mt-0.5 block h-1 w-full rounded-full bg-base-200"
          >
            <span
              class="block h-full rounded-full {tone === 'raised'
                ? 'bg-[var(--color-error-content)]'
                : tone === 'lowered'
                  ? 'bg-[var(--color-info-content)]'
                  : 'bg-[var(--color-muted)]'}"
              style:width="{(spread[stat] / 32) * 100}%"
            ></span>
          </span>
        </span>
      {/each}
    </span>
  {/if}
  <span class="sr-only"
    >{member.nature?.trim()
      ? `Nature: ${member.nature}`
      : 'Unknown nature'}</span
  >
{/snippet}

{#snippet moveContent(move: string, type: PokemonType | null)}
  {#if type}<TypeBadge {type} size="md" />{/if}
  <span
    class="line-clamp-2 min-w-0 flex-1 font-medium wrap-anywhere"
    title={move || undefined}
  >
    {move || (member.moves.length ? 'Empty' : 'Unknown')}
  </span>
{/snippet}

<div class="flex min-w-0 flex-col gap-1 leading-[1.4] text-base-content">
  <div class="flex min-h-7 min-w-0 items-center justify-between gap-1.5 px-1">
    {#if onedit}
      <button
        bind:this={openButton}
        type="button"
        class="min-w-0 flex-1 truncate rounded-[var(--radius-field)] py-0.5 text-start text-xs font-bold text-[color:var(--color-muted)] hover:text-base-content focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
        aria-label={`Change ${member.pokemon}`}
        data-set-field="pokemon"
        title={member.pokemon}
        {disabled}
        onclick={() => onedit('pokemon')}
      >
        {member.pokemon}
      </button>
    {:else if onopen}
      <button
        bind:this={openButton}
        type="button"
        class="min-w-0 flex-1 truncate rounded-[var(--radius-field)] py-0.5 text-start text-xs font-bold text-[color:var(--color-muted)] hover:text-base-content focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
        aria-label={`View full set for ${member.pokemon}`}
        data-set-field="set"
        title={member.pokemon}
        {disabled}
        onclick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          onopen();
        }}
      >
        {member.pokemon}
      </button>
    {:else}
      <p
        class="min-w-0 flex-1 truncate text-xs font-bold text-[color:var(--color-muted)]"
        title={member.pokemon}
      >
        {member.pokemon}
      </p>
    {/if}
    {#if actions}
      <div class="shrink-0">
        {@render actions()}
      </div>
    {/if}
  </div>

  <div
    use:clickablePlate
    class="plate flex h-[19.5rem] min-h-max min-w-0 flex-col leading-[1.4] text-base-content {!onedit &&
    onopen &&
    !disabled
      ? 'cursor-pointer'
      : ''}"
  >
    <div
      class="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_1.75rem] items-center gap-2 rounded-t-[var(--radius-box)] px-2.5 py-2"
      style:background={band}
    >
      {#if onedit}
        <button
          type="button"
          class="grid size-14 place-items-center rounded-[var(--radius-field)] hover:bg-base-100/60 focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Change ${member.pokemon}`}
          {disabled}
          onclick={() => onedit('pokemon')}
        >
          <PokemonSprite pokemon={member.pokemon} size={56} />
        </button>
        <button
          type="button"
          data-set-field="ability"
          class="flex min-h-11 min-w-0 items-center rounded-[var(--radius-field)] px-1 text-start hover:bg-base-100/60 focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Edit ${member.pokemon} ability`}
          {disabled}
          onclick={() => onedit('ability')}
        >
          {@render abilityContent()}
        </button>
        <button
          type="button"
          data-set-field="item"
          class="grid size-9 place-items-center rounded-[var(--radius-field)] hover:bg-base-100/60 focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Edit ${member.pokemon} item`}
          title={member.item?.trim() || 'Unknown item'}
          {disabled}
          onclick={() => onedit('item')}
        >
          {@render itemContent()}
        </button>
      {:else}
        <span aria-hidden="true" class="grid size-14 place-items-center">
          <PokemonSprite pokemon={member.pokemon} size={56} />
        </span>
        {@render abilityContent()}
        <span
          class="grid size-7 place-items-center"
          title={member.item?.trim() || 'Unknown item'}
        >
          {@render itemContent()}
        </span>
      {/if}
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1.5 px-2.5 py-2">
      {#if onedit}
        <button
          type="button"
          data-set-field="spread"
          class="flex min-h-9 w-full min-w-0 flex-col justify-center gap-0.5 rounded-[var(--radius-field)] px-1 py-1 text-start hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Edit ${member.pokemon} EV spread and nature`}
          {disabled}
          onclick={() => onedit('spread')}
        >
          {@render spreadContent()}
        </button>
      {:else}
        <div class="flex min-h-9 min-w-0 flex-col justify-center gap-0.5 py-1">
          {@render spreadContent()}
        </div>
      {/if}

      <ol role="list" class="mt-auto grid min-w-0 gap-1 text-sm leading-[1.2]">
        {#each [0, 1, 2, 3] as index (index)}
          {@const move = member.moves[index]?.trim() ?? ''}
          {@const type = move ? getMoveType(move) : null}
          <li class="min-w-0">
            {#if onedit}
              <button
                type="button"
                data-set-field={index === 0 ? 'moves' : undefined}
                data-move-slot={index}
                class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-[var(--radius-field)] px-2.5 py-1 text-start text-base-content focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
                style={moveBarStyle(type)}
                aria-label={`Edit ${member.pokemon} move ${index + 1}: ${move || (member.moves.length ? 'Empty' : 'Unknown')}`}
                {disabled}
                onclick={() => onedit('moves', index)}
              >
                {@render moveContent(move, type)}
              </button>
            {:else}
              <div
                class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-[var(--radius-field)] px-2.5 py-1 text-start text-base-content"
                style={moveBarStyle(type)}
              >
                {@render moveContent(move, type)}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </div>
  </div>
</div>
