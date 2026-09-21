<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import {
    CHAMPIONS_STATS,
    championsSpreadTotal,
    formatChampionsSpread,
    parseChampionsSpread,
    type ChampionsSpread,
  } from '$lib/paste';
  import type { CatalogSuggestion } from '$lib/workbench';

  let {
    spread,
    suggestions,
    onspreadchange,
  }: {
    spread: string;
    suggestions: CatalogSuggestion[];
    onspreadchange: (spread: string, nature?: string | null) => void;
  } = $props();

  const STAT_COLORS: Record<(typeof CHAMPIONS_STATS)[number], string> = {
    HP: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    Atk: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    Def: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    SpA: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    SpD: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
    Spe: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30',
  };

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

  function update(stat: (typeof CHAMPIONS_STATS)[number], value: number) {
    onspreadchange(
      formatChampionsSpread({
        ...values,
        [stat]: Math.max(0, Math.min(32, value || 0)),
      })
    );
  }

  function resetEvs() {
    onspreadchange(
      formatChampionsSpread({
        HP: 0,
        Atk: 0,
        Def: 0,
        SpA: 0,
        SpD: 0,
        Spe: 0,
      })
    );
  }
</script>

<div
  class="animate-in rounded-xl border border-base-300 bg-base-100 p-3.5 shadow-2xs duration-200 fade-in-0 sm:p-4"
  aria-label="EV editor"
>
  <!-- Point Budget Progress Header -->
  <div class="mb-4 space-y-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span
          class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
        >
          Point budget
        </span>
        <span class="font-mono text-xs font-semibold text-base-content/90">
          {total}/66 points
        </span>
      </div>
      <div class="flex items-center gap-2">
        {#if total === 66}
          <span class="badge badge-sm font-medium badge-success">Complete</span>
        {:else if total < 66}
          <span class="badge badge-sm font-medium badge-info"
            >{66 - total} remaining</span
          >
        {:else}
          <span class="badge badge-sm font-medium badge-error"
            >{total - 66} over limit</span
          >
        {/if}
        <button
          type="button"
          class="btn h-7 min-h-7 gap-1 btn-ghost px-2 text-[11px] text-base-content/70 btn-xs hover:text-base-content"
          aria-label="Clear all EVs"
          disabled={total === 0}
          onclick={resetEvs}
        >
          <RotateCcw class="size-3" />
          <span>Reset</span>
        </button>
      </div>
    </div>
    <div class="h-2 w-full overflow-hidden rounded-full bg-base-300">
      <div
        class="h-full transition-all duration-200 {total === 66
          ? 'bg-success'
          : total > 66
            ? 'bg-error'
            : 'bg-primary'}"
        style="width: {Math.min(100, Math.round((total / 66) * 100))}%"
      ></div>
    </div>
  </div>

  <!-- Compact Stat Allocation Rows -->
  <div class="grid gap-3">
    {#each CHAMPIONS_STATS as stat (stat)}
      {@const colorClass = STAT_COLORS[stat]}
      <div
        class="space-y-2 rounded-lg border border-base-300/40 bg-base-200/30 p-2 sm:p-2.5"
      >
        <!-- Top Row: Stat Badge, Quick Buttons, Input & Suffix -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span
              class="inline-flex w-12 items-center justify-center rounded-md border py-0.5 text-xs font-semibold {colorClass}"
            >
              {stat}
            </span>
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
              class="input min-h-9 w-14 rounded-lg border border-base-300 px-1 text-center font-mono text-xs font-semibold input-sm"
              oninput={(event) =>
                update(stat, event.currentTarget.valueAsNumber)}
            />
            <span class="font-mono text-xs text-base-content/60">/ 32</span>
          </div>
        </div>

        <!-- Bottom Row: Range Slider -->
        <input
          aria-label={`${stat} EV slider`}
          type="range"
          min="0"
          max="32"
          value={values[stat]}
          class="range w-full range-primary range-xs"
          oninput={(event) => update(stat, event.currentTarget.valueAsNumber)}
        />
      </div>
    {/each}
  </div>
</div>

<!-- Rich Suggestions List (up to 5 options) -->
<div class="mt-4 grid gap-2" aria-label="EV spread suggestions">
  <div class="flex items-center justify-between px-0.5">
    <span
      class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
    >
      Catalog spread suggestions
    </span>
    {#if suggestions.length > 0}
      <span class="badge font-mono badge-sm text-[10px] badge-neutral">
        {Math.min(5, suggestions.length)} available
      </span>
    {/if}
  </div>

  {#each suggestions.slice(0, 5) as option (option.value)}
    {@const isSelected = spread === option.value}
    {@const parts = option.value.split(' / ').filter(Boolean)}
    <button
      type="button"
      class="group flex min-h-11 flex-col gap-2 rounded-xl border p-3 text-left transition-all {isSelected
        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
        : 'border-base-300 bg-base-100 hover:border-primary/40 hover:bg-base-200/30'}"
      onclick={() => onspreadchange(option.value, option.nature)}
    >
      <!-- Header Line -->
      <div class="flex w-full items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          {#if option.nature}
            <span class="badge badge-sm font-semibold badge-primary">
              🌿 {option.nature}
            </span>
          {/if}
          {#if option.totalCount}
            <span class="font-mono text-xs text-base-content/60">
              {option.totalCount}
              {option.totalCount === 1 ? 'team' : 'teams'}
            </span>
          {/if}
        </div>
        {#if isSelected}
          <span class="badge badge-sm text-[10px] font-medium badge-success">
            ✓ Selected
          </span>
        {/if}
      </div>

      <!-- Breakdown Line -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#each parts as part (part)}
          <span
            class="inline-flex items-center rounded-md border border-base-300/60 bg-base-200/80 px-2 py-0.5 font-mono text-xs font-medium"
          >
            {part}
          </span>
        {/each}
      </div>
    </button>
  {:else}
    <p class="py-2 text-center text-xs text-base-content/60">
      No catalog spread suggestions available for this Pokémon.
    </p>
  {/each}
</div>
