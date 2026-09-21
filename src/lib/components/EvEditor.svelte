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
  }: {
    spread: string;
    suggestions: CatalogSuggestion[];
    onspreadchange: (spread: string, nature?: string | null) => void;
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
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs">
          <label for={`set-${stat}-ev`} class="font-medium text-base-content"
            >{stat}</label
          >
          <div class="flex items-center gap-1.5">
            <input
              id={`set-${stat}-ev`}
              aria-label={`${stat} EV`}
              type="number"
              min="0"
              max="32"
              value={values[stat]}
              class="input min-h-11 w-16 px-1 text-center font-mono text-xs font-semibold"
              oninput={(event) =>
                update(stat, event.currentTarget.valueAsNumber)}
            />
            <span class="text-base-content/70">/ 32</span>
          </div>
        </div>
        <input
          aria-label={`${stat} EV slider`}
          type="range"
          min="0"
          max="32"
          value={values[stat]}
          class="range min-h-11 w-full range-primary"
          oninput={(event) => update(stat, event.currentTarget.valueAsNumber)}
        />
      </div>
    {/each}
  </div>
  <div class="mt-3 flex min-h-11 items-center gap-3">
    <p class:text-error={total !== 66} class="text-sm font-medium">
      {total}/66 · {total < 66
        ? `${66 - total} remaining`
        : total > 66
          ? `${total - 66} over`
          : 'complete'}
    </p>
  </div>
</div>
<div class="mt-2 grid gap-2" aria-label="EV spread suggestions">
  {#each suggestions.slice(0, 3) as option (option.value)}
    <Button
      variant={spread === option.value ? 'default' : 'outline'}
      class="h-auto min-h-11 w-full justify-between text-left whitespace-normal"
      onclick={() => onspreadchange(option.value, option.nature)}
    >
      <span class="wrap-break-word">
        {#if option.nature}
          <span class="font-semibold text-primary">{option.nature}</span> ·
        {/if}
        {option.value}
      </span>
    </Button>
  {/each}
</div>
