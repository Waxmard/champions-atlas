<script lang="ts">
  import {
    balanceChampionsStat,
    CHAMPIONS_STATS,
    championsSpreadTotal,
    formatChampionsSpread,
    formatSpreadDelta,
    natureEffect,
    parseChampionsSpread,
    type ChampionsSpread,
    type ChampionsStat,
  } from '#lib/paste.js';
  import { resolveBattleForm } from '#lib/battle-forms.js';
  import { buildBenchmarkIndex } from '#lib/benchmarks.js';
  import { normalize, type Member, type Team } from '#lib/catalog.js';
  import { speedBenchmark } from '#lib/stats.js';
  import EvBenchmarkPanel from '#lib/components/EvBenchmarkPanel.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    catalogSpreadSuggestions,
    originalSpreadSuggestion,
    type CatalogSuggestion,
    type SpreadSuggestion,
  } from '#lib/workbench.js';
  import type { CurrentSetChoice } from '#lib/current-sets.js';

  let {
    member,
    currentRegulation,
    teams,
    teammates,
    natureSuggestions,
    originalMember,
    inGameMember,
    onspreadchange,
    onnaturechange,
    oningame,
  }: {
    member: Member;
    currentRegulation: string;
    teams: Team[];
    teammates: Member[];
    natureSuggestions: CatalogSuggestion[];
    originalMember?: Member;
    inGameMember?: Member;
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
    oningame: (choice: CurrentSetChoice, displayed: Member) => void;
  } = $props();
  const index = $derived(buildBenchmarkIndex(teams, currentRegulation));
  const regulationTeams = $derived(
    teams.filter((team) => team.regulation === currentRegulation)
  );
  const spreadKey = (candidateNature: string, candidateSpread: string) =>
    `${normalize(candidateNature)}|${normalize(candidateSpread)}`;

  const spreadSuggestions = $derived.by(() => {
    const rows: SpreadSuggestion[] = [];
    const original =
      originalMember && originalSpreadSuggestion(member, originalMember);
    if (original) rows.push(original);
    const inGame =
      inGameMember && originalSpreadSuggestion(member, inGameMember);
    if (inGame) {
      const key = spreadKey(inGame.nature, inGame.spread);
      const existing = rows.find(
        (row) => spreadKey(row.nature, row.spread) === key
      );
      if (existing) {
        existing.inGame = true;
        existing.source = 'Original team · My in-game set';
      } else {
        rows.push({
          ...inGame,
          source: 'My in-game set',
          original: undefined,
          inGame: true,
        });
      }
    }
    for (const option of catalogSpreadSuggestions(
      member,
      teams,
      currentRegulation,
      5,
      teammates
    )) {
      const key = spreadKey(option.nature, option.spread);
      const source =
        `${option.totalCount} catalog team${option.totalCount === 1 ? '' : 's'}` +
        (option.currentCount
          ? ` · ${option.currentCount} in ${currentRegulation}`
          : '');
      const existing = rows.find(
        (row) => spreadKey(row.nature, row.spread) === key
      );
      if (existing) {
        if (existing.inGame) existing.source += ` · ${source}`;
        continue;
      }
      rows.push({
        spread: option.spread,
        nature: option.nature,
        source,
        deltas: option.deltas,
        movedPoints: option.movedPoints,
        speed: option.speed,
      });
    }
    return rows.slice(0, 5);
  });
  const spread = $derived(member.spread || '');
  const nature = $derived(member.nature || '');

  let draft = $state<ChampionsSpread | null>(null);
  const values = $derived(
    draft ||
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

  const clampEv = (value: number) => Math.max(0, Math.min(32, value || 0));
  function update(stat: (typeof CHAMPIONS_STATS)[number], value: number) {
    const next = { ...values, [stat]: clampEv(value) };
    draft = null;
    onspreadchange(formatChampionsSpread(next));
  }
  function setStat(stat: (typeof CHAMPIONS_STATS)[number], value: number) {
    draft = { ...values, [stat]: clampEv(value) };
  }
  function commitDraft() {
    if (!draft) return;
    const next = formatChampionsSpread(draft);
    draft = null;
    onspreadchange(next);
  }
  export function flush(): void {
    commitDraft();
  }
  function setFromPointer(
    event: PointerEvent,
    input: HTMLInputElement,
    stat: ChampionsStat
  ) {
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const configuredThumb = Number.parseFloat(
      style.getPropertyValue('--range-thumb-size')
    );
    const thumbSize = Number.isFinite(configuredThumb) ? configuredThumb : 16;
    const travel = rect.width - thumbSize;
    if (travel <= 0) return;
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left - thumbSize / 2) / travel)
    );
    setStat(
      stat,
      Math.round(32 * (style.direction === 'rtl' ? 1 - fraction : fraction))
    );
  }
  function startPointer(event: PointerEvent, stat: ChampionsStat) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const input = event.currentTarget as HTMLInputElement;
    input.focus();
    input.setPointerCapture(event.pointerId);
    setFromPointer(event, input, stat);
  }
  function movePointer(event: PointerEvent, stat: ChampionsStat) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.hasPointerCapture(event.pointerId))
      setFromPointer(event, input, stat);
  }
  function finishPointer(event: PointerEvent) {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.hasPointerCapture(event.pointerId)) return;
    commitDraft();
    input.releasePointerCapture(event.pointerId);
  }
</script>

<div class="plate ev-editor-enter min-w-0 p-3.5 sm:p-4" aria-label="EV editor">
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
        {#each natureSuggestions.slice(0, 4) as option (option.value)}
          {@const isSelected = nature === option.value}
          <button
            type="button"
            class="min-h-11 rounded-[var(--radius-selector)] border px-3 text-[0.8125rem] transition-colors {isSelected
              ? 'border-primary font-semibold'
              : 'border-base-300 hover:bg-base-200/70'}"
            aria-label={`Use ${option.value} nature${
              option.original
                ? option.inGame
                  ? ' (original and in-game)'
                  : ' (original)'
                : option.inGame
                  ? ' (in-game)'
                  : ''
            }`}
            onclick={() => {
              if (option.inGame) {
                if (inGameMember) oningame({ kind: 'nature' }, inGameMember);
              } else onnaturechange(option.value);
            }}
          >
            {option.value}
            {#if option.original || option.inGame}<span
                class="provenance ms-2"
                aria-hidden="true"
                >{option.original
                  ? option.inGame
                    ? 'Original · In-game'
                    : 'Original'
                  : 'In-game'}</span
              >{/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="provenance py-2 text-center">
        No catalog nature suggestions for this Pokémon.
      </p>
    {/if}
  </div>
  <p class="provenance mb-2 px-0.5">
    {formatChampionsSpread(values) || 'No EVs allocated'} · {total} / 66
  </p>
  <details>
    <summary class="term min-h-11 cursor-pointer content-center" data-ev-toggle>
      Adjust EVs manually
    </summary>

    <!-- Compact Stat Allocation Rows -->
    <div class="grid divide-y">
      {#each CHAMPIONS_STATS as stat (stat)}
        {@const currentVal = values[stat]}
        {@const target = balanceChampionsStat(values, stat)[stat]}
        {@const delta = target - currentVal}
        <div class="space-y-2 py-2.5 first:pt-0 last:pb-0">
          <!-- Top Row: Stat Badge, Quick Buttons, Input & Suffix -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
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
                <Button
                  variant="quiet"
                  size="dense"
                  class="font-mono text-[11px]"
                  disabled={values[stat] === 0}
                  onclick={() => update(stat, 0)}
                >
                  0
                </Button>
                <Button
                  variant="quiet"
                  size="dense"
                  class="font-mono text-[11px]"
                  disabled={values[stat] === 32}
                  onclick={() => update(stat, 32)}
                >
                  32
                </Button>
                <Button
                  variant="quiet"
                  size="dense"
                  class="font-mono text-[11px]"
                  disabled={delta === 0}
                  aria-label={`Fill remaining EVs into ${stat}`}
                  title={delta === 0
                    ? undefined
                    : delta > 0
                      ? `Add ${delta} EVs to ${stat}`
                      : `Remove ${-delta} EVs from ${stat}`}
                  onclick={() => update(stat, target)}
                >
                  {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : 'Fill'}
                </Button>
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
                data-ev-stat={stat}
                class="input min-h-9 w-14 px-1 text-center font-mono text-xs font-semibold input-sm"
                oninput={(event) =>
                  setStat(stat, event.currentTarget.valueAsNumber)}
                onchange={commitDraft}
                onblur={commitDraft}
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
            step="1"
            value={values[stat]}
            class="range h-11 w-full touch-pan-y [--range-thumb-size:16px] range-xs"
            style:--ev-progress={currentVal / 32}
            oninput={(event) =>
              setStat(stat, event.currentTarget.valueAsNumber)}
            onchange={commitDraft}
            onblur={commitDraft}
            onpointerdown={(event) => startPointer(event, stat)}
            onpointermove={(event) => movePointer(event, stat)}
            onpointerup={finishPointer}
            onpointercancel={finishPointer}
          />
        </div>
      {/each}
    </div>
  </details>
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
      Matching Nature; original and in-game sets first, then catalog spreads
      ranked by team fit and results.
    </p>
  </div>
  {#each spreadSuggestions as option, i (option.spread + option.nature)}
    {@const speed = speedBenchmark(
      resolvedForm.pokemon,
      parseChampionsSpread(option.spread),
      option.nature,
      regulationTeams
    )}
    <button
      type="button"
      class="group flex min-h-11 flex-col gap-1.5 px-3 py-2.5 text-start transition-colors hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary {spread ===
      option.spread
        ? 'font-semibold'
        : ''}"
      aria-label={'Use ' +
        option.nature +
        ' spread ' +
        option.spread +
        (option.inGame
          ? option.original
            ? ' (original team and in-game set)'
            : ' (in-game set)'
          : '')}
      aria-describedby={'ev-suggestion-details-' + i}
      onclick={() => {
        if (option.inGame) {
          if (inGameMember) oningame({ kind: 'spread' }, inGameMember);
        } else onspreadchange(option.spread, option.nature);
      }}
    >
      <span id={'ev-suggestion-details-' + i} class="sr-only"
        >{option.source} · {option.movedPoints} points moved</span
      >
      {@render chips(option.spread)}
      <span class="value"
        >{option.nature} · {formatSpreadDelta(option.deltas)}</span
      >
      <span class="provenance"
        >{option.source} · {option.movedPoints} points moved</span
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
    <p class="provenance px-3 py-2.5">
      No recorded spreads match this Nature. Try another Nature or adjust EVs
      manually.
    </p>
  {/each}
</section>

<EvBenchmarkPanel {member} {index} {currentRegulation} {onspreadchange} />

<style>
  .range {
    --range-fill: 0;
    --ev-rail: linear-gradient(
      calc(90deg * var(--range-dir, 1)),
      var(--range-progress)
        calc(
          var(--range-thumb-size) / 2 + (100% - var(--range-thumb-size)) *
            var(--ev-progress)
        ),
      var(--range-bg) 0
    );
  }
  .range::-webkit-slider-runnable-track {
    background: var(--ev-rail);
  }
  .range::-moz-range-track {
    background: var(--ev-rail);
  }
</style>
