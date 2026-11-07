<script lang="ts">
  import type { Member } from '#lib/catalog.js';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import TypeBadge from '#lib/components/TypeBadge.svelte';
  import {
    CHAMPIONS_STATS,
    natureEffect,
    parseChampionsSpread,
  } from '#lib/paste.js';
  import { activeSpreadSource } from '#lib/spread-provenance.js';
  import {
    getMoveType,
    getPokemonTypes,
    typeBand,
    typeFill,
  } from '#lib/types.js';

  const ZERO_SPREAD = {
    HP: 0,
    Atk: 0,
    Def: 0,
    SpA: 0,
    SpD: 0,
    Spe: 0,
  } as const;

  let { member }: { member: Member } = $props();

  const types = $derived(getPokemonTypes(member.pokemon));
  const band = $derived(typeBand(types));
  const effect = $derived(natureEffect(member.nature));
  const spread = $derived(
    member.spread?.trim() ? parseChampionsSpread(member.spread) : ZERO_SPREAD
  );
  const spreadSource = $derived(activeSpreadSource(member));
</script>

<div class="grid min-w-0 gap-3.5">
  <section class="plate min-w-0 overflow-hidden">
    <div
      class="flex min-w-0 flex-wrap items-center gap-3 p-3.5"
      style:background={band}
    >
      <PokemonSprite pokemon={member.pokemon} size={56} />
      <div class="min-w-[min(6rem,100%)] flex-1">
        <h3 class="term">Pokémon</h3>
        <p
          class="text-lg leading-tight font-extrabold wrap-anywhere whitespace-pre-wrap"
        >
          {member.pokemon || 'Unknown'}
        </p>
      </div>
    </div>
  </section>

  <section class="plate min-w-0 p-3.5 sm:p-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 class="term">Item, ability, and nature</h3>
    </div>
    <dl class="grid gap-2 text-sm">
      <div class="min-w-0">
        <dt class="term">Held item</dt>
        <dd
          class="flex min-w-0 items-center gap-1.5 wrap-anywhere whitespace-pre-wrap"
        >
          {#if member.item?.trim()}<ItemIcon
              item={member.item}
              size={20}
            />{/if}
          <span class="min-w-0">{member.item?.trim() || 'Unknown'}</span>
        </dd>
      </div>
      <div class="min-w-0">
        <dt class="term">Ability</dt>
        <dd class="wrap-anywhere whitespace-pre-wrap">
          {member.ability?.trim() || 'Unknown'}
        </dd>
      </div>
      <div class="min-w-0">
        <dt class="term">Nature</dt>
        <dd class="wrap-anywhere whitespace-pre-wrap">
          {member.nature?.trim() || 'Unknown'}
        </dd>
      </div>
    </dl>
  </section>

  <section class="plate min-w-0 p-3.5 sm:p-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 class="term">EV spread</h3>
    </div>
    {#if spread === null}
      <p class="text-sm wrap-anywhere whitespace-pre-wrap tabular-nums">
        {member.spread}
      </p>
    {:else}
      <dl
        class="grid grid-cols-[repeat(auto-fit,minmax(2.5rem,1fr))] gap-y-2 text-center"
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
              class="text-[0.6875rem] leading-[1.4] font-bold {tone === 'raised'
                ? 'text-[color:var(--color-error-content)]'
                : tone === 'lowered'
                  ? 'text-[color:var(--color-info-content)]'
                  : 'text-[color:var(--color-muted)]'}"
            >
              {stat}{#if tone}<span class="sr-only">, {tone} by nature</span
                >{/if}
            </dt>
            <dd class="text-sm tabular-nums">
              <span
                class={spread[stat] ? '' : 'text-[color:var(--color-muted)]'}
                >{spread[stat]}</span
              >{#if tone}<span
                  aria-hidden="true"
                  class="text-[0.6875rem] font-bold {tone === 'raised'
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
    {#if spreadSource}
      <div class="mt-3 flex min-w-0 flex-col">
        <a
          class="inline-flex min-h-11 link items-center text-sm wrap-anywhere"
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
            class="inline-flex min-h-11 link items-center text-sm wrap-anywhere"
            href={videoUrl}
            target="_blank"
            rel="external noreferrer"
            aria-label={`Video provenance ${index + 1} for ${member.pokemon}'s linked creator paste`}
          >
            Video provenance {index + 1}
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <section class="plate min-w-0 p-3.5 sm:p-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 class="term">Moves</h3>
    </div>
    <ol role="list" class="grid min-w-0 gap-1 text-sm sm:grid-cols-2">
      {#each [0, 1, 2, 3] as index (index)}
        {@const move = member.moves[index]?.trim() ?? ''}
        {@const type = move ? getMoveType(move) : null}
        <li
          class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-[var(--radius-field)] px-2.5 py-1 text-start text-base-content"
          style={typeFill(type)}
        >
          {#if type}<TypeBadge {type} size="md" />{/if}
          <span
            class="line-clamp-2 min-w-0 flex-1 font-medium wrap-anywhere"
            title={move || undefined}
          >
            {move || (member.moves.length ? 'Empty' : 'Unknown')}
          </span>
        </li>
      {/each}
    </ol>
  </section>

  {#if member.set?.trim()}
    <details class="plate min-w-0 px-3.5 py-2 sm:px-4">
      <summary class="min-h-11 cursor-pointer pt-3 text-sm font-semibold">
        Set text
      </summary>
      <pre
        class="pb-2 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">{member.set}</pre>
    </details>
  {/if}
</div>
