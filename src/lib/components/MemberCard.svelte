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
  import { getMoveType, getPokemonTypes, TYPE_COLORS } from '#lib/types.js';

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
    onopen: () => void;
    actions?: Snippet;
    disabled?: boolean;
    openButton?: HTMLButtonElement | null;
  }

  let {
    member,
    onopen,
    actions,
    disabled = false,
    openButton = $bindable(null),
  }: Props = $props();

  const types = $derived(getPokemonTypes(member.pokemon));
  const effect = $derived(natureEffect(member.nature));
  const spread = $derived(
    member.spread?.trim() ? parseChampionsSpread(member.spread) : null
  );
  const itemSrc = $derived(
    member.item?.trim() ? localImageSrc('items', member.item) : ''
  );
  const band = $derived(
    `linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[types[0]]} 24%, var(--color-base-100)), color-mix(in oklab, ${TYPE_COLORS[types[types.length - 1]]} 24%, var(--color-base-100)))`
  );
</script>

<div
  class="plate flex h-[24rem] min-h-max min-w-0 flex-col leading-[1.4] text-base-content"
>
  <div
    class="grid min-w-0 gap-1 rounded-t-[var(--radius-box)] px-2.5 py-2"
    style:background={band}
  >
    <div class="flex min-h-[3.5rem] min-w-0 items-start gap-1">
      <button
        bind:this={openButton}
        type="button"
        class="grid min-h-11 min-w-0 flex-1 content-start rounded-[var(--radius-field)] px-1 text-start text-base leading-[1.25] font-bold text-base-content hover:bg-base-100/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:pointer-events-none disabled:opacity-50"
        aria-label={`View full set for ${member.pokemon}`}
        data-set-field="set"
        {disabled}
        onclick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          onopen();
        }}
      >
        <span
          class="line-clamp-2 min-w-0 wrap-break-word"
          title={member.pokemon}
        >
          {member.pokemon}
        </span>
        <span class="text-xs leading-[1.25] font-semibold">View full set</span>
      </button>
      <div class="grid min-h-11 w-11 shrink-0 place-items-start">
        {@render actions?.()}
      </div>
    </div>

    <div
      class="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_1.75rem] items-center gap-2"
    >
      <span aria-hidden="true" class="grid size-14 place-items-center">
        <PokemonSprite pokemon={member.pokemon} size={56} />
      </span>
      {#if member.ability?.trim()}
        <span
          class="line-clamp-2 min-w-0 text-sm wrap-break-word"
          title={member.ability}
        >
          <span class="sr-only">Ability: </span>{member.ability}
        </span>
      {:else}
        <span class="unknown justify-self-start px-1 text-xs"
          >Unknown ability</span
        >
      {/if}
      <span
        class="grid size-7 place-items-center"
        title={member.item?.trim() || 'Unknown item'}
      >
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
      </span>
    </div>
  </div>

  <div class="flex min-w-0 flex-1 flex-col gap-2 px-2.5 py-2">
    <div class="flex min-h-14 min-w-0 flex-col justify-center gap-1">
      {#if !member.spread?.trim()}
        <span class="unknown self-start px-1 text-xs">Unknown EVs</span>
      {:else if spread === null}
        <p
          class="line-clamp-2 text-[0.8125rem] wrap-anywhere tabular-nums"
          title={member.spread}
        >
          {member.spread}
        </p>
      {:else}
        <dl
          class="grid grid-cols-6 text-center"
          title={member.nature ? `${member.nature} nature` : undefined}
        >
          {#each CHAMPIONS_STATS as stat (stat)}
            {@const tone =
              effect?.raised === stat
                ? 'raised'
                : effect?.lowered === stat
                  ? 'lowered'
                  : ''}
            <div class="min-w-0">
              <dt
                class="text-[0.6875rem] leading-[1.4] font-bold {tone ===
                'raised'
                  ? 'text-[color:var(--color-error-content)]'
                  : tone === 'lowered'
                    ? 'text-[color:var(--color-info-content)]'
                    : 'text-[color:var(--color-muted)]'}"
              >
                {stat}{#if tone}<span class="sr-only">, {tone} by nature</span
                  >{/if}
              </dt>
              <dd class="text-[0.8125rem] tabular-nums">
                {#if spread[stat]}{spread[stat]}{:else}<span
                    aria-hidden="true"
                    class="text-[color:var(--color-muted)]">·</span
                  ><span class="sr-only">0</span>{/if}{#if tone}<span
                    aria-hidden="true"
                    class="text-[0.625rem] font-bold {tone === 'raised'
                      ? 'text-[color:var(--color-error-content)]'
                      : 'text-[color:var(--color-info-content)]'}"
                    >{tone === 'raised' ? '↑' : '↓'}</span
                  >{/if}
              </dd>
              <div
                aria-hidden="true"
                class="mx-auto mt-0.5 h-1 w-full rounded-full bg-base-200"
              >
                <div
                  class="h-full rounded-full {tone === 'raised'
                    ? 'bg-[var(--color-error-content)]'
                    : tone === 'lowered'
                      ? 'bg-[var(--color-info-content)]'
                      : 'bg-[var(--color-muted)]'}"
                  style:width="{(spread[stat] / 32) * 100}%"
                ></div>
              </div>
            </div>
          {/each}
        </dl>
      {/if}
      {#if !member.nature?.trim()}
        <span class="unknown self-start px-1 text-xs">Unknown nature</span>
      {:else}
        <span class="sr-only">Nature: {member.nature}</span>
      {/if}
    </div>

    <ol role="list" class="mt-auto grid min-w-0 gap-1 text-sm leading-[1.2]">
      {#each [0, 1, 2, 3] as index (index)}
        {@const move = member.moves[index]?.trim() ?? ''}
        {@const type = move ? getMoveType(move) : null}
        <li
          class="flex min-h-9 min-w-0 rounded-[var(--radius-field)] bg-base-200 text-base-content"
        >
          <span
            class="flex w-7 shrink-0 items-center justify-center rounded-s-[var(--radius-field)]"
            title={type ?? undefined}
            style:background-color={type
              ? TYPE_COLORS[type]
              : 'var(--color-base-300)'}
          >
            {#if type}<TypeBadge {type} size="md" />{/if}
          </span>
          <span class="flex min-w-0 flex-1 items-center px-1.5">
            <span
              class="line-clamp-2 min-w-0 wrap-anywhere"
              title={move || undefined}
            >
              {move || (member.moves.length ? 'Empty' : 'Unknown')}
            </span>
          </span>
        </li>
      {/each}
    </ol>
  </div>
</div>
