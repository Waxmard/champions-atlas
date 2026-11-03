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
  import { getMoveType, getPokemonTypes, TYPE_COLORS } from '#lib/types.js';

  let { member }: { member: Member } = $props();

  const types = $derived(getPokemonTypes(member.pokemon));
  const band = $derived(
    `linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[types[0]]} 24%, var(--color-base-100)), color-mix(in oklab, ${TYPE_COLORS[types[types.length - 1]]} 24%, var(--color-base-100)))`
  );
  const effect = $derived(natureEffect(member.nature));
  const spread = $derived(
    member.spread?.trim() ? parseChampionsSpread(member.spread) : null
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
    {#if !member.spread?.trim()}
      <p class="text-xs text-[color:var(--color-muted)]">Unknown EVs</p>
    {:else if spread === null}
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
              {#if spread[stat]}{spread[stat]}{:else}<span
                  aria-hidden="true"
                  class="text-[color:var(--color-muted)]">·</span
                ><span class="sr-only">0</span>{/if}{#if tone}<span
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
          class="inline-flex min-h-11 link items-center text-sm wrap-anywhere focus-visible:ring-2 focus-visible:ring-primary"
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
            class="inline-flex min-h-11 link items-center text-sm wrap-anywhere focus-visible:ring-2 focus-visible:ring-primary"
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
          class="flex min-h-9 min-w-0 rounded-[var(--radius-field)] bg-base-200"
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
          <span
            class="min-w-0 flex-1 px-1.5 py-1 wrap-anywhere whitespace-pre-wrap"
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
