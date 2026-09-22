<script lang="ts">
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import {
    CHAMPIONS_STATS,
    championsSpreadTotal,
    formatChampionsSpread,
    natureEffect,
    parseChampionsSpread,
    type ChampionsSpread,
  } from '$lib/paste';
  import type { CatalogSuggestion } from '$lib/workbench';

  let {
    spread,
    nature,
    spreadSuggestions,
    natureSuggestions,
    onspreadchange,
    onnaturechange,
  }: {
    spread: string;
    nature: string;
    spreadSuggestions: CatalogSuggestion[];
    natureSuggestions: CatalogSuggestion[];
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
  } = $props();

  const values = $derived(
    parseChampionsSpread(spread) ||
      ({
        HP: 0,
        Atk: 0,
        Def: 0,
        SpA: 0,
        SpD: 0,
        Spe: 0,
      } satisfies ChampionsSpread)
  );
  const total = $derived(championsSpreadTotal(values));
  const effect = $derived(natureEffect(nature));

  function update(stat: (typeof CHAMPIONS_STATS)[number], value: number) {
    onspreadchange(
      formatChampionsSpread({
        ...values,
        [stat]: Math.max(0, Math.min(32, value || 0)),
      })
    );
  }
</script>

<div
  class="plate animate-in p-3.5 duration-200 fade-in-0 sm:p-4"
  aria-label="EV editor"
>
  <!-- Point Budget Progress Header -->
  <div class="mb-4 space-y-2">
    <div class="flex items-baseline justify-between gap-3">
      <div class="flex items-baseline gap-3">
        <span class="term">Point budget</span>
        <span class="value font-mono font-semibold">{total}/66 points</span>
      </div>
      <div class="flex items-baseline gap-3">
        {#if total === 66}
          <span class="value font-semibold">Complete</span>
        {:else if total < 66}
          <span class="value">{66 - total} remaining</span>
        {:else}
          <span
            class="value font-semibold"
            style="color: var(--color-error-content)"
            >{total - 66} over limit</span
          >
        {/if}
      </div>
    </div>
    <div class="h-2 w-full overflow-hidden rounded-full bg-base-300">
      <div
        class="h-full bg-primary transition-all duration-200"
        style="width: {Math.min(100, Math.round((total / 66) * 100))}%"
      ></div>
    </div>
  </div>

  <!-- Nature modifies the stats below -->
  <div class="mb-4 grid gap-2 border-b pb-4" aria-label="Nature suggestions">
    <div class="flex flex-wrap items-baseline justify-between gap-3 px-0.5">
      <span class="term">Nature</span>
      <span class="value text-base-content/70">
        {nature
          ? `Current: ${nature}${effect ? ` (+${effect.raised} / -${effect.lowered})` : ''}`
          : 'No nature'}
      </span>
    </div>
    {#if natureSuggestions.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each natureSuggestions.slice(0, 5) as option (option.value)}
          {@const isSelected = nature === option.value}
          <button
            type="button"
            class="min-h-11 border px-3 text-[0.8125rem] transition-colors {isSelected
              ? 'border-primary font-semibold'
              : 'border-base-300 hover:bg-base-200/70'}"
            aria-label={`Use ${option.value} nature`}
            onclick={() => onnaturechange(option.value)}
          >
            {option.value}
          </button>
        {/each}
      </div>
    {:else}
      <p class="provenance py-2 text-center">
        No catalog nature suggestions for this Pokémon.
      </p>
    {/if}
  </div>

  <!-- Compact Stat Allocation Rows -->
  <div class="grid divide-y">
    {#each CHAMPIONS_STATS as stat (stat)}
      {@const currentVal = values[stat]}
      {@const remaining = Math.max(0, 66 - total)}
      {@const canAdd = Math.min(32 - currentVal, remaining)}
      <div class="space-y-2 py-2.5 first:pt-0 last:pb-0">
        <!-- Top Row: Stat Badge, Quick Buttons, Input & Suffix -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="term inline-flex w-12 justify-center">{stat}</span>
            {#if effect && effect.raised === stat}
              <span
                class="value font-semibold"
                aria-hidden="true"
                title={`${nature} raises ${stat} by 10%`}
              >
                +10%
              </span>
            {:else if effect && effect.lowered === stat}
              <span
                class="value text-base-content/60"
                aria-hidden="true"
                title={`${nature} lowers ${stat} by 10%`}
              >
                -10%
              </span>
            {/if}
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="btn h-7 min-h-7 btn-ghost px-2 font-mono text-[11px] btn-xs"
                disabled={values[stat] === 0}
                onclick={() => update(stat, 0)}
              >
                0
              </button>
              <button
                type="button"
                class="btn h-7 min-h-7 btn-ghost px-2 font-mono text-[11px] btn-xs"
                disabled={values[stat] === 32}
                onclick={() => update(stat, 32)}
              >
                32
              </button>
              <button
                type="button"
                class="btn h-7 min-h-7 btn-ghost px-2 font-mono text-[11px] btn-xs"
                disabled={canAdd <= 0}
                aria-label={`Fill remaining EVs into ${stat}`}
                title={canAdd > 0
                  ? `Add remaining ${canAdd} EVs to ${stat}`
                  : 'No remaining budget'}
                onclick={() => update(stat, currentVal + canAdd)}
              >
                {canAdd > 0 ? `+${canAdd}` : 'Fill'}
              </button>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <input
              id={`set-${stat}-ev`}
              aria-label={`${stat} EV`}
              type="number"
              min="0"
              max="32"
              value={values[stat]}
              class="input min-h-9 w-14 px-1 text-center font-mono text-xs font-semibold input-sm"
              oninput={(event) =>
                update(stat, event.currentTarget.valueAsNumber)}
            />
            <span class="term">/ 32</span>
          </div>
        </div>

        <!-- Bottom Row: Range Slider -->
        <input
          aria-label={`${stat} EV slider`}
          type="range"
          min="0"
          max="32"
          value={values[stat]}
          class="range w-full range-xs"
          oninput={(event) => update(stat, event.currentTarget.valueAsNumber)}
        />
      </div>
    {/each}
  </div>
</div>

<!-- Rich Suggestions List (up to 5 options) -->
<div class="plate mt-4 grid divide-y" aria-label="EV spread suggestions">
  <div class="flex items-baseline justify-between gap-3 px-3 py-2.5">
    <span class="term">Catalog spread suggestions</span>
    {#if spreadSuggestions.length > 0}
      <span class="provenance"
        >{Math.min(5, spreadSuggestions.length)} available</span
      >
    {/if}
  </div>

  {#each spreadSuggestions.slice(0, 5) as option (option.value)}
    {@const isSelected = spread === option.value}
    {@const parts = option.value.split(' / ').filter(Boolean)}
    <button
      type="button"
      class="group flex min-h-11 flex-col gap-2 px-3 py-2.5 text-left transition-colors hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary {isSelected
        ? 'font-semibold'
        : ''}"
      onclick={() => onspreadchange(option.value, option.nature)}
    >
      <!-- Header Line -->
      <div class="flex w-full items-baseline justify-between gap-3">
        <div class="flex items-baseline gap-3">
          {#if option.nature}
            <span class="term inline-flex items-center gap-1">
              <SlidersHorizontal class="size-3" />
              <span>{option.nature}</span>
            </span>
          {/if}
          {#if option.totalCount}
            <span class="value text-base-content/70">
              {option.totalCount}
              {option.totalCount === 1 ? 'team' : 'teams'}
            </span>
          {/if}
        </div>
        {#if isSelected}
          <span class="term">✓ Selected</span>
        {/if}
      </div>

      <!-- Breakdown Line -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#each parts as part (part)}
          <span
            class="value inline-flex items-center border border-base-300 px-2 py-0.5 font-mono"
          >
            {part}
          </span>
        {/each}
      </div>
    </button>
  {:else}
    <p class="provenance px-3 py-2.5 text-center">
      No catalog spread suggestions available for this Pokémon.
    </p>
  {/each}
</div>
