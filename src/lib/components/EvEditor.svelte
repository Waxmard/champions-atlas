<script lang="ts">
  import {
    CHAMPIONS_STATS,
    championsSpreadTotal,
    formatChampionsSpread,
    formatSpreadDelta,
    natureEffect,
    parseChampionsSpread,
    NATURES,
    type ChampionsSpread,
  } from '$lib/paste';
  import { resolveBattleForm } from '$lib/battle-forms';
  import type { BenchmarkIndex } from '$lib/benchmarks';
  import type { Member, Team } from '$lib/catalog';
  import { speedBenchmark, speedFor, speedTiers } from '$lib/stats';
  import EvBenchmarkPanel from '$lib/components/EvBenchmarkPanel.svelte';
  import type { CatalogSuggestion, OwnSpreadSuggestion } from '$lib/workbench';

  let {
    member,
    spread,
    nature,
    index,
    ownSpreads,
    currentRegulation,
    teams,
    natureSuggestions,
    onspreadchange,
    onnaturechange,
  }: {
    member: Member;
    spread: string;
    nature: string;
    index: BenchmarkIndex;
    ownSpreads: OwnSpreadSuggestion[];
    currentRegulation: string;
    teams: Team[];
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
  const resolvedForm = $derived(resolveBattleForm(member));
  const parsedSpread = $derived(parseChampionsSpread(spread));
  const validNature = $derived(
    NATURES.includes(nature as (typeof NATURES)[number])
  );
  const currentSpeed = $derived(
    parsedSpread && total === 66 && validNature && !resolvedForm.error
      ? speedFor(resolvedForm.pokemon, parsedSpread, nature)
      : null
  );
  const tiers = $derived(speedTiers(teams));

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
          : 'Unknown'}
      </span>
    </div>
    {#if natureSuggestions.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each natureSuggestions.slice(0, 5) as option (option.value)}
          {@const isSelected = nature === option.value}
          <button
            type="button"
            class="min-h-11 rounded-[var(--radius-selector)] border px-3 text-[0.8125rem] transition-colors {isSelected
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
                class="value text-base-content/70"
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
{#snippet chips(value: string)}
  <div class="flex flex-wrap items-center gap-1.5">
    {#each value.split(' / ').filter(Boolean) as part (part)}
      <span
        class="value inline-flex items-center rounded-[var(--radius-selector)] border border-base-300 px-2 py-0.5 font-mono"
        >{part}</span
      >
    {/each}
  </div>
{/snippet}

<section class="plate mt-4 grid divide-y" aria-label="EV spread suggestions">
  <div class="px-3 py-2.5">
    <h3 class="term">Suggested spreads</h3>
    <p class="provenance mt-1">
      Spreads your own teams already run on this Pokémon.
    </p>
  </div>
  {#each ownSpreads.slice(0, 4) as option, i (option.teamName + option.spread)}
    {@const speed = speedBenchmark(
      resolvedForm.pokemon,
      parseChampionsSpread(option.spread),
      option.nature,
      teams
    )}
    <button
      type="button"
      class="group flex min-h-11 flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary {spread ===
      option.spread
        ? 'font-semibold'
        : ''}"
      aria-label={'Use ' + option.nature + ' spread ' + option.spread}
      aria-describedby={'ev-suggestion-details-' + i}
      onclick={() => onspreadchange(option.spread, option.nature)}
    >
      <span id={'ev-suggestion-details-' + i} class="sr-only"
        >{option.teamName} · {option.regulation} · {option.movedPoints} points moved</span
      >
      {@render chips(option.spread)}
      <span class="value"
        >{option.nature} · {formatSpreadDelta(option.deltas)}</span
      >
      <span class="provenance"
        >{option.teamName} · {option.regulation} · {option.movedPoints} points moved</span
      >
      {#if option.speed !== null}
        <span class="provenance"
          >Unmodified Speed {option.speed}{speed
            ? ` · ${speed.beatPercent}% raw-Speed catalog percentile`
            : ''}</span
        >
      {/if}
    </button>
  {:else}
    <p class="provenance px-3 py-2.5">No saved team runs this Pokémon yet.</p>
  {/each}
  {#if tiers.length && currentSpeed !== null}
    <details class="px-3 py-2.5">
      <summary class="term min-h-11 cursor-pointer content-center"
        >Speed tiers</summary
      >
      <p class="provenance">Unmodified Speed</p>
      <ul class="mt-2 grid gap-1">
        {#each tiers as tier (tier.pokemon)}
          <li class="flex items-baseline justify-between gap-3">
            <span class="value">{tier.pokemon} · {tier.medianSpeed}</span>
            {#if currentSpeed > tier.medianSpeed}<span
                class="term"
                title="Unmodified Speed outspeeds this tier">✓</span
              >{/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<EvBenchmarkPanel {member} {index} {currentRegulation} {onspreadchange} />
