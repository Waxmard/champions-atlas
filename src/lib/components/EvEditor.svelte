<script lang="ts">
  import { Button } from '$lib/components/ui/button';
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
    ondone,
  }: {
    spread: string;
    suggestions: CatalogSuggestion[];
    onspreadchange: (spread: string) => void;
    ondone: () => void;
  } = $props();
  let expanded = $state(false);
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
</script>

<div
  class="mt-2 animate-in rounded-xl border p-3 duration-200 fade-in-0"
  aria-label="EV editor"
>
  <div class="grid gap-3">
    {#each CHAMPIONS_STATS as stat (stat)}
      <div class="grid grid-cols-[3rem_4.5rem_1fr] items-center gap-2">
        <label for={`set-${stat}-ev`} class="text-sm font-medium">{stat}</label
        ><input
          id={`set-${stat}-ev`}
          aria-label={`${stat} EV`}
          type="number"
          min="0"
          max="32"
          value={values[stat]}
          class="min-h-11 w-full rounded-lg border bg-background px-2 text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          oninput={(event) => update(stat, event.currentTarget.valueAsNumber)}
        /><input
          aria-label={`${stat} EV slider`}
          type="range"
          min="0"
          max="32"
          value={values[stat]}
          class="min-h-11 w-full accent-primary"
          oninput={(event) => update(stat, event.currentTarget.valueAsNumber)}
        />
      </div>
    {/each}
  </div>
  <div class="mt-3 flex min-h-11 items-center justify-between gap-3">
    <p class:text-destructive={total !== 66} class="text-sm font-medium">
      {total}/66 · {total < 66
        ? `${66 - total} remaining`
        : total > 66
          ? `${total - 66} over`
          : 'complete'}
    </p>
    <Button variant="outline" class="min-h-11" onclick={ondone}>Done</Button>
  </div>
</div>
<div class="mt-2 grid gap-2" aria-label="EV spread suggestions">
  {#each suggestions.slice(0, expanded ? undefined : 3) as option (option.value)}
    <Button
      variant={spread === option.value ? 'default' : 'outline'}
      class="h-auto min-h-11 w-full justify-between text-left whitespace-normal"
      onclick={() => onspreadchange(option.value)}
      ><span class="wrap-break-word">{option.value}</span><span
        class="shrink-0 text-xs opacity-70"
        >{option.currentCount}/{option.totalCount}</span
      ></Button
    >
  {/each}
</div>
{#if suggestions.length > 3}<Button
    variant="ghost"
    class="mt-1 min-h-11"
    onclick={() => (expanded = !expanded)}
    >{expanded
      ? 'Show fewer spreads'
      : `Show ${suggestions.length - 3} more spreads`}</Button
  >{/if}
