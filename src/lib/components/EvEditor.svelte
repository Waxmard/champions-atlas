<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import {
    balanceChampionsStat,
    CHAMPIONS_STATS,
    championsSpreadTotal,
    formatChampionsSpread,
    NATURES,
    natureEffect,
    parseChampionsSpread,
    type ChampionsSpread,
    type ChampionsStat,
  } from '#lib/paste.js';
  import { normalize, type Member, type Team } from '#lib/catalog.js';
  import Modal from '#lib/components/Modal.svelte';
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
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
    favoriteMembers = [],
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
    favoriteMembers?: Member[];
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
    oningame: (choice: CurrentSetChoice, displayed: Member) => void;
  } = $props();
  let visibleCatalogCount = $state(10);
  let visibleNatureCount = $state(6);
  let natureDraft = $state<string | null>(null);
  let natureQuery = $state('');
  let manualOpen = $state(false);
  const natureValue = $derived(natureDraft ?? member.nature ?? '');
  const natureMatches = $derived(
    natureSuggestions.filter((option) =>
      normalize(option.value).includes(normalize(natureQuery))
    )
  );
  const extraFavoriteNatures = $derived(
    natureMatches.filter((opt) => opt.favorite && !opt.original && !opt.inGame)
      .length
  );
  const visibleNatures = $derived(
    natureMatches.slice(0, visibleNatureCount + extraFavoriteNatures)
  );
  const hasMoreNatures = $derived(
    natureMatches.length > visibleNatureCount + extraFavoriteNatures
  );
  function commitNature(blurOnSuccess = false): boolean {
    if (natureDraft === null) {
      if (blurOnSuccess) (document.activeElement as HTMLElement | null)?.blur();
      return true;
    }
    const raw = natureDraft.trim();
    const matched = !raw
      ? ''
      : normalize(raw) === normalize(member.nature ?? '')
        ? (member.nature ?? '')
        : (natureSuggestions.find(
            (opt) => normalize(opt.value) === normalize(raw)
          )?.value ?? NATURES.find((n) => normalize(n) === normalize(raw)));
    if (matched !== undefined) {
      natureDraft = null;
      natureQuery = '';
      visibleNatureCount = 6;
      onnaturechange(matched);
      if (blurOnSuccess) (document.activeElement as HTMLElement | null)?.blur();
      return true;
    }
    onnaturechange(raw);
    const input = document.getElementById(
      'set-nature-input'
    ) as HTMLElement | null;
    queueMicrotask(() => input?.focus({ preventScroll: true }));
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));
    return false;
  }
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
    for (const favMember of favoriteMembers) {
      const fav = originalSpreadSuggestion(member, favMember);
      if (!fav) continue;
      const key = spreadKey(fav.nature, fav.spread);
      const existing = rows.find(
        (row) => spreadKey(row.nature, row.spread) === key
      );
      if (existing) {
        if (!existing.favorite) {
          existing.favorite = true;
          existing.source += ' · Favorite team';
        }
      } else {
        rows.push({
          ...fav,
          source: 'Favorite team',
          original: undefined,
          favorite: true,
        });
      }
    }
    let catalogCount = 0;
    let hasMore = false;
    // Saved-source duplicates take limit slots without counting as catalog
    // rows; the final +1 proves another eligible spread exists for hasMore.
    for (const option of catalogSpreadSuggestions(
      member,
      teams,
      currentRegulation,
      visibleCatalogCount + rows.length + 1,
      teammates
    )) {
      const key = spreadKey(option.nature, option.spread);
      const source = 'Catalog spread';
      const existing = rows.find(
        (row) => spreadKey(row.nature, row.spread) === key
      );
      if (existing) {
        if (existing.inGame || existing.original || existing.favorite)
          existing.source += ` · ${source}`;
        continue;
      }
      if (catalogCount === visibleCatalogCount) {
        hasMore = true;
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
      catalogCount++;
    }
    return { rows, hasMore };
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
  const allocation = $derived(
    `${formatChampionsSpread(values) || 'No EVs allocated'} · ${total} / 66`
  );
  const effect = $derived(natureEffect(nature));

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
    if (natureDraft !== null) commitNature(false);
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

<section class="plate enter-fade min-w-0 p-3.5 sm:p-4" aria-label="EV editor">
  <!-- Nature modifies the stats below -->
  <fieldset class="mb-4 grid min-w-0 gap-2 border-b pb-4">
    <legend class="sr-only">Nature</legend>
    <label for="set-nature-input" class="term">Nature</label>
    <div class="field">
      <input
        id="set-nature-input"
        class="grow bg-transparent text-sm focus:outline-none"
        placeholder="Nature"
        value={natureValue}
        onfocus={() => {
          if (natureDraft === null) natureQuery = '';
          visibleNatureCount = 6;
        }}
        onclick={() => {
          if (natureDraft === null) natureQuery = '';
          visibleNatureCount = 6;
        }}
        oninput={(event) => {
          natureQuery = event.currentTarget.value;
          natureDraft = event.currentTarget.value;
          visibleNatureCount = 6;
        }}
        onblur={() => commitNature(false)}
        onkeydown={(event) => {
          if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            commitNature(true);
          }
        }}
      />
      {#if natureValue}
        <Button
          variant="quiet"
          size="icon-compact"
          class="-me-2"
          aria-label="Clear nature"
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => {
            natureDraft = null;
            natureQuery = '';
            onnaturechange('');
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <X class="size-4" />
        </Button>
      {/if}
    </div>
    <SuggestionList
      id="set-nature-suggestions"
      label="Nature suggestions"
      count={visibleNatures.length}
      empty="No catalog nature suggestions for this Pokémon."
      hasMore={hasMoreNatures}
      onshowmore={() => (visibleNatureCount += 5)}
    >
      {#each visibleNatures as option (option.value)}
        {@const modifier = natureEffect(option.value)}
        <SuggestionRow
          label={`Use ${option.value} nature${
            option.original
              ? option.inGame
                ? ' (original and in-game)'
                : ' (original)'
              : option.inGame
                ? ' (in-game)'
                : option.favorite
                  ? ' (favorite)'
                  : ''
          }`}
          primary={option.value}
          secondary={[
            modifier ? `+${modifier.raised} / −${modifier.lowered}` : 'Neutral',
            option.original ? 'Original' : '',
            option.inGame ? 'In-game' : '',
            option.favorite ? 'Favorite' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          selected={normalize(option.value) === normalize(nature)}
          onclick={() => {
            if (normalize(option.value) !== normalize(member.nature ?? '')) {
              visibleCatalogCount = 10;
              visibleNatureCount = 6;
            }
            natureDraft = null;
            natureQuery = '';
            if (option.inGame) {
              if (inGameMember) oningame({ kind: 'nature' }, inGameMember);
            } else onnaturechange(option.value);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        />
      {/each}
    </SuggestionList>
  </fieldset>
  <p class="provenance mb-2 px-0.5">{allocation}</p>
  <Button
    variant="quiet"
    class="-ms-3"
    aria-haspopup="dialog"
    data-ev-toggle
    onclick={() => (manualOpen = true)}>Adjust EVs manually</Button
  >
  {#if manualOpen}
    <Modal title="Adjust EVs manually" onclose={() => (manualOpen = false)}>
      <p class="provenance mb-2">{allocation}</p>
      <div class="grid divide-y">
        {#each CHAMPIONS_STATS as stat (stat)}
          {@const currentVal = values[stat]}
          {@const target = balanceChampionsStat(values, stat)[stat]}
          {@const delta = target - currentVal}
          <div class="space-y-2 py-2.5 first:pt-0 last:pb-0">
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
                    {delta > 0
                      ? `+${delta}`
                      : delta < 0
                        ? `−${-delta}`
                        : 'Fill'}
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
    </Modal>
  {/if}
</section>
<SuggestionList
  id="set-spread-suggestions"
  label="EV spread suggestions"
  count={spreadSuggestions.rows.length}
  class="mt-4"
  empty="No recorded spreads match this Nature. Try another Nature or adjust EVs manually."
  hasMore={spreadSuggestions.hasMore}
  onshowmore={() => (visibleCatalogCount += 5)}
>
  {#each spreadSuggestions.rows as option (option.spread + option.nature)}
    <SuggestionRow
      label={'Use ' +
        option.nature +
        ' spread ' +
        option.spread +
        (option.inGame
          ? option.original
            ? ' (original team and in-game set)'
            : ' (in-game set)'
          : option.favorite
            ? ' (favorite team)'
            : '')}
      prefix={option.nature}
      primary={option.spread}
      secondary={[
        option.source,
        `${option.movedPoints} points moved`,
        option.speed !== null ? `Speed ${option.speed}` : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      selected={spread === option.spread}
      onclick={() => {
        if (option.inGame) {
          if (inGameMember) oningame({ kind: 'spread' }, inGameMember);
        } else onspreadchange(option.spread, option.nature);
      }}
    />
  {/each}
</SuggestionList>

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
