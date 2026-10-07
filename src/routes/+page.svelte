<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { Snapshot } from '@sveltejs/kit';
  import { page } from '$app/state';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { onMount, tick, untrack } from 'svelte';
  import Filter from '@lucide/svelte/icons/filter';
  import X from '@lucide/svelte/icons/x';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import SpeciesLabel from '$lib/components/SpeciesLabel.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import TypeFilter from '$lib/components/TypeFilter.svelte';
  import {
    getPokemonTypes,
    getTypeIcon,
    TYPE_COLORS,
    type PokemonType,
  } from '$lib/types';
  import { browseStorageKey } from '$lib/workbench';
  import { Button } from '$lib/components/ui/button';
  import {
    readFilters,
    writeFilters,
    matchesTeam,
    compareTeams,
    getMemberOptions,
    normalize,
    type MemberFilter,
    type Team,
  } from '$lib/catalog';
  import type { PageData } from './$types';

  const browseKeys = ['member', 'regulation', 'sort', 'page', 'type'];
  const ALL_TYPES = Object.keys(TYPE_COLORS) as PokemonType[];
  let { data }: { data: PageData } = $props();
  let storageError = $state(false);
  let typeOpen = $state(false);
  let ready = $state(false);
  let filterPane = $state<HTMLDivElement>();
  let resultsPane = $state<HTMLDivElement>();
  let moreFilters = $state(false);
  let moreTeams = $state(false);

  function applyPendingOffsets() {
    const pending = pendingOffsets;
    if (!pending) return;
    if (filterPane) filterPane.scrollTop = pending.filters;
    if (resultsPane) resultsPane.scrollTop = pending.results;
    if (offsetsReached()) pendingOffsets = null;
  }

  function offsetsReached() {
    const pending = pendingOffsets;
    if (!pending) return true;
    if (!filterPane || !resultsPane) return false;
    return (
      Math.abs(filterPane.scrollTop - pending.filters) <= 1 &&
      Math.abs(resultsPane.scrollTop - pending.results) <= 1
    );
  }

  function overflowCue(node: HTMLDivElement, pane: 'filters' | 'results') {
    const update = () => {
      const below = node.scrollHeight - node.clientHeight - node.scrollTop > 1;
      if (pane === 'filters') moreFilters = below;
      else moreTeams = below;
      if (offsetsReached()) pendingOffsets = null;
    };
    const dropPending = () => {
      pendingOffsets = null;
    };
    const observer = new ResizeObserver(() => {
      update();
      // The header height lands after the first paint and WebKit reports the
      // content box before the scroller's range grows, so a queued offset can
      // be clamped. Re-apply it in the frame that follows the resize.
      if (pendingOffsets)
        requestAnimationFrame(() => {
          update();
          applyPendingOffsets();
        });
    });
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener('scroll', update, { passive: true });
    for (const type of ['pointerdown', 'wheel', 'keydown'])
      node.addEventListener(type, dropPending, { passive: true });
    update();
    return {
      destroy() {
        observer.disconnect();
        node.removeEventListener('scroll', update);
        for (const type of ['pointerdown', 'wheel', 'keydown'])
          node.removeEventListener(type, dropPending);
      },
    };
  }
  const teams: Team[] = $derived(data.catalog.teams);
  const current = $derived(data.catalog.currentRegulation);
  const historicalRegulations = $derived(
    [...new Set(teams.map((team) => team.regulation))]
      .filter((value) => value !== current)
      .sort()
      .reverse()
  );
  const filterState = $derived.by(() => {
    try {
      return { filters: readFilters(page.url.searchParams), error: '' };
    } catch {
      return {
        filters: [],
        error: 'This filter link is invalid. Clear filters to start again.',
      };
    }
  });
  const filters = $derived(filterState.filters);
  const regulation = $derived(
    page.url.searchParams.get('regulation') || current
  );
  const sort = $derived(page.url.searchParams.get('sort') || 'priority');
  const selectedTypes = $derived(
    page.url.searchParams
      .getAll('type')
      .map((value) => value.toLowerCase())
      .filter((value): value is PokemonType =>
        (ALL_TYPES as string[]).includes(value)
      )
  );
  const allPokemon = $derived(
    [
      ...new Set(
        teams.flatMap((team) => team.members.map((member) => member.pokemon))
      ),
    ].sort()
  );
  const availablePokemon = $derived(
    allPokemon.filter(
      (pokemon) =>
        !filters.some(
          (filter) => normalize(filter.pokemon) === normalize(pokemon)
        )
    )
  );
  function matchesTypes(team: Team, types: PokemonType[]) {
    if (!types.length) return true;
    const present = new Set(
      team.members.flatMap((member) => getPokemonTypes(member.pokemon))
    );
    return types.every((type) => present.has(type));
  }
  const results = $derived(
    filterState.error
      ? []
      : teams
          .filter(
            (team) =>
              (regulation === 'all' || team.regulation === regulation) &&
              matchesTeam(team, filters) &&
              matchesTypes(team, selectedTypes)
          )
          .sort((a, b) =>
            sort === 'recent'
              ? b.publishedAt.localeCompare(a.publishedAt) ||
                a.id.localeCompare(b.id)
              : compareTeams(a, b, current)
          )
  );
  const pageCount = $derived(Math.max(1, Math.ceil(results.length / 24)));
  const pageNumber = $derived(
    Math.min(
      pageCount,
      Math.max(
        1,
        Number.parseInt(page.url.searchParams.get('page') || '1') || 1
      )
    )
  );
  const visible = $derived(
    results.slice((pageNumber - 1) * 24, pageNumber * 24)
  );
  let pendingOffsets = $state<{ filters: number; results: number } | null>(
    null
  );
  let reducedMotion = $state(false);
  let displayedCount = $state(0);
  let previousCount = $state<number | null>(null);
  const countDigits = $derived(String(teams.length).length);
  $effect(() => {
    if (!pendingOffsets || !filterPane || !resultsPane) return;
    applyPendingOffsets();
  });
  $effect(() => {
    const next = results.length;
    const prior = untrack(() => displayedCount);
    if (next === prior) return;
    previousCount = reducedMotion || prior === 0 ? null : prior;
    displayedCount = next;
  });
  function clearPreviousCount(event: AnimationEvent) {
    if (
      (event.currentTarget as HTMLElement).dataset.count ===
      String(displayedCount)
    )
      previousCount = null;
  }

  function browseParams(params: URLSearchParams) {
    const result = writeFilters(new URLSearchParams(), readFilters(params));
    for (const value of params.getAll('type')) {
      const type = value.toLowerCase();
      if ((ALL_TYPES as string[]).includes(type)) result.append('type', type);
    }
    result.set('regulation', params.get('regulation') || current);
    result.set('sort', params.get('sort') === 'recent' ? 'recent' : 'priority');
    const pageValue = params.get('page');
    if (pageValue && /^\d+$/.test(pageValue) && Number(pageValue) > 1)
      result.set('page', pageValue);
    return result;
  }

  function rememberBrowse(params: URLSearchParams) {
    try {
      localStorage.setItem(browseStorageKey, params.toString());
    } catch {
      storageError = true;
    }
  }

  function navigate(params: URLSearchParams, noScroll = true) {
    const canonical = browseParams(params);
    rememberBrowse(canonical);
    const query = canonical.toString();
    return goto(resolve(`/?${query}`), {
      replaceState: true,
      noScroll,
      keepFocus: true,
    });
  }

  function restoreBrowse() {
    if (page.url.pathname !== resolve('/')) return;

    if (browseKeys.some((key) => page.url.searchParams.has(key))) {
      try {
        rememberBrowse(browseParams(page.url.searchParams));
      } catch {
        // Invalid explicit links stay visible and do not replace saved filters.
      }
      return;
    }

    try {
      const saved = localStorage.getItem(browseStorageKey);
      if (saved !== null) {
        const params = new URLSearchParams(saved);
        if (!browseKeys.some((key) => params.has(key))) throw new Error();
        navigate(params);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException) storageError = true;
    }
    navigate(new URLSearchParams());
  }

  afterNavigate(restoreBrowse);
  onMount(() => {
    ready = true;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reducedMotion = query.matches;
      if (query.matches) previousCount = null;
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });
  function changeFilters(next: MemberFilter[]) {
    return navigate(writeFilters(page.url.searchParams, next));
  }
  function addPokemon(pokemon: string) {
    if (
      filters.length >= 6 ||
      filters.some((filter) => normalize(filter.pokemon) === normalize(pokemon))
    )
      return;
    const items = /-Mega(?:-[A-Z])?$/i.test(pokemon)
      ? options(pokemon, 'item')
      : [];
    void changeFilters([
      ...filters,
      {
        pokemon,
        item: items.length === 1 ? items[0] : '',
        ability: '',
        move: '',
      },
    ]).then(async () => {
      await tick();
      const heading = filterPane?.querySelectorAll('.browse-constraints h2')[
        filters.length - 1
      ];
      if (filterPane && heading)
        filterPane.scrollTop +=
          heading.getBoundingClientRect().top -
          filterPane.getBoundingClientRect().top -
          8;
    });
  }
  function updateMember(
    index: number,
    field: 'item' | 'ability' | 'move',
    value: string
  ) {
    changeFilters(
      filters.map((filter, i) =>
        i === index ? { ...filter, [field]: value } : filter
      )
    );
  }
  function options(pokemon: string, field: 'item' | 'ability' | 'move') {
    return getMemberOptions(teams, pokemon, field);
  }
  function changeOption(key: string, value: string) {
    const params = new SvelteURLSearchParams(page.url.searchParams);
    params.set(key, value);
    if (key !== 'page') params.delete('page');
    void navigate(params, key !== 'page').then(() => {
      if (!resultsPane) return;
      if (key === 'page') resultsPane.scrollTop = 0;
      else {
        const limit = resultsPane.scrollHeight - resultsPane.clientHeight;
        if (resultsPane.scrollTop > limit)
          resultsPane.scrollTop = Math.max(0, limit);
      }
    });
  }

  export const snapshot: Snapshot<{
    filters: number;
    results: number;
    typeOpen: boolean;
  }> = {
    capture: () => ({
      filters: filterPane?.scrollTop ?? 0,
      results: resultsPane?.scrollTop ?? 0,
      typeOpen,
    }),
    restore: (value) => {
      typeOpen = value.typeOpen;
      pendingOffsets = { filters: value.filters, results: value.results };
    },
  };

  function clearFilters() {
    navigate(new URLSearchParams());
  }

  function setTypes(next: PokemonType[]) {
    const params = new SvelteURLSearchParams(page.url.searchParams);
    params.delete('type');
    for (const type of next) params.append('type', type.toLowerCase());
    params.delete('page');
    navigate(params, true);
  }
</script>

<svelte:head>
  <title>Champion's Atlas — Find your next team</title>
  <meta
    name="description"
    content="Find Pokémon Champions teams with persistent Pokémon and item filters, result evidence, and regulation-aware ordering."
  />
</svelte:head>

<main id="main" class="browse-layout">
  <div class="browse-controls">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling requires a focusable pane.) -->
    <div
      class="browse-filter-scroll"
      bind:this={filterPane}
      use:overflowCue={'filters'}
      tabindex="0"
      role="region"
      aria-label="Team filters"
    >
      <div class="browse-filter-content">
        <header>
          <h1
            class="browse-heading font-bold tracking-[-0.02em] wrap-break-word"
          >
            Explore teams
          </h1>
          <p
            class="mt-1.5 max-w-[58ch] text-[0.9375rem] leading-relaxed text-secondary-text"
          >
            Find a team for the Pokémon you want to use.
          </p>
        </header>

        {#if storageError}<p
            role="status"
            aria-live="polite"
            class="provenance mt-2"
          >
            Filters can't be remembered on this device.
          </p>{/if}

        <div>
          <Button
            type="button"
            variant="outline"
            aria-expanded={typeOpen}
            onclick={() => (typeOpen = !typeOpen)}
            class="min-h-11 gap-2"
          >
            <Filter class="size-4 text-muted" aria-hidden="true" />
            Filter by type
            {#if selectedTypes.length}<span class="badge badge-primary"
                >{selectedTypes.length}</span
              >{/if}
          </Button>
          {#if typeOpen}
            <div class="mt-2">
              <TypeFilter
                options={ALL_TYPES}
                selected={selectedTypes}
                onselect={setTypes}
              />
            </div>
          {/if}
          {#if selectedTypes.length}
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each selectedTypes as type (type)}
                <span
                  class="inline-flex items-center gap-1.5 rounded-field border border-l-[3px] border-border bg-base-100 py-1 pr-1 pl-2 text-[0.8125rem]"
                  style="border-left-color: {TYPE_COLORS[type]}"
                >
                  <img src={getTypeIcon(type)} alt="" class="size-3.5" /><span
                    class="font-medium">{type}</span
                  >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${type} type filter`}
                    onclick={() =>
                      setTypes(selectedTypes.filter((t) => t !== type))}
                    class="size-11 rounded-full text-muted hover:text-base-content"
                    ><X class="size-3.5" aria-hidden="true" /></Button
                  >
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <div>
          <span class="sr-only" aria-live="polite"
            >{filters.length} of 6 Pokémon selected</span
          >
          <PokemonPicker
            options={availablePokemon}
            onselect={addPokemon}
            disabled={filters.length >= 6}
          />
        </div>

        {#if filters.length}
          <div class="browse-constraints grid gap-3">
            {#each filters as filter, index (filter.pokemon)}
              <section
                class="plate min-w-0 px-4 pt-3 pb-4"
                style="border-left: 3px solid {TYPE_COLORS[
                  getPokemonTypes(filter.pokemon)[0]
                ]}"
                aria-label={`${filter.pokemon} constraints`}
                data-constraint={index}
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <h2
                      class="min-w-0 text-lg leading-tight font-bold tracking-[-0.02em] wrap-break-word"
                    >
                      <SpeciesLabel pokemon={filter.pokemon} spriteSize={36} />
                    </h2>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-11 shrink-0"
                    aria-label={`Remove ${filter.pokemon}`}
                    onclick={() =>
                      changeFilters(filters.filter((_, i) => i !== index))}
                    ><X class="size-4" aria-hidden="true" /></Button
                  >
                </div>

                <div class="browse-fields mt-3 grid gap-3">
                  <label for={`item-${index}`} class="term min-w-0"
                    >Held item
                    <select
                      id={`item-${index}`}
                      class="atlas-select mt-1 min-h-11 w-full text-base sm:text-sm"
                      value={filter.item}
                      onchange={(event) =>
                        updateMember(index, 'item', event.currentTarget.value)}
                    >
                      <option value="">Any item</option>
                      {#if filter.item && !options(filter.pokemon, 'item').includes(filter.item)}<option
                          value={filter.item}>{filter.item}</option
                        >{/if}
                      {#each options(filter.pokemon, 'item') as item (item)}<option
                          value={item}>{item}</option
                        >{/each}
                    </select>
                  </label>

                  <label for={`ability-${index}`} class="term min-w-0"
                    >Ability
                    <select
                      id={`ability-${index}`}
                      class="atlas-select mt-1 min-h-11 w-full text-base sm:text-sm"
                      value={filter.ability}
                      onchange={(event) =>
                        updateMember(
                          index,
                          'ability',
                          event.currentTarget.value
                        )}
                    >
                      <option value="">Any ability</option>
                      {#if filter.ability && !options(filter.pokemon, 'ability').includes(filter.ability)}<option
                          value={filter.ability}>{filter.ability}</option
                        >{/if}
                      {#each options(filter.pokemon, 'ability') as ability (ability)}<option
                          value={ability}>{ability}</option
                        >{/each}
                    </select>
                  </label>

                  <label for={`move-${index}`} class="browse-move term min-w-0"
                    >Move
                    <select
                      id={`move-${index}`}
                      class="atlas-select mt-1 min-h-11 w-full text-base sm:text-sm"
                      value={filter.move}
                      onchange={(event) =>
                        updateMember(index, 'move', event.currentTarget.value)}
                    >
                      <option value="">Any move</option>
                      {#if filter.move && !options(filter.pokemon, 'move').includes(filter.move)}<option
                          value={filter.move}>{filter.move}</option
                        >{/if}
                      {#each options(filter.pokemon, 'move') as move (move)}<option
                          value={move}>{move}</option
                        >{/each}
                    </select>
                  </label>
                </div>
              </section>
            {/each}
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-3">
          <label for="regulation" class="term min-w-0"
            >Regulation
            <select
              id="regulation"
              class="atlas-filter-select mt-1 min-h-11 w-full text-base sm:text-sm"
              value={regulation}
              onchange={(event) =>
                changeOption('regulation', event.currentTarget.value)}
            >
              <option value={current}>{current} (current)</option>
              <option value="all">All regulations</option>
              {#if regulation !== current && regulation !== 'all' && !historicalRegulations.includes(regulation)}<option
                  value={regulation}
                  >{regulation === 'Unknown'
                    ? 'Unknown regulation'
                    : regulation}</option
                >{/if}
              {#each historicalRegulations as reg (reg)}<option value={reg}
                  >{reg === 'Unknown' ? 'Unknown regulation' : reg}</option
                >{/each}
            </select>
          </label>

          <label for="sort" class="term min-w-0"
            >Sort
            <select
              id="sort"
              aria-label="Sort teams"
              class="atlas-filter-select mt-1 min-h-11 w-full text-base sm:text-sm"
              value={sort}
              onchange={(event) =>
                changeOption('sort', event.currentTarget.value)}
            >
              <option value="priority">Recommended</option>
              <option value="recent">Newest shared</option>
            </select>
          </label>
        </div>
      </div>
    </div>
    <div class="browse-scroll-cue" aria-hidden="true">
      {#if moreFilters}More filters below <ChevronDown class="size-3" />{/if}
    </div>
  </div>

  <section aria-label="Matching teams" class="browse-results">
    <div
      class="browse-results-header flex items-center justify-between gap-3 border-b"
    >
      <p class="value font-semibold tracking-wide">
        <span class="sr-only" aria-live="polite" aria-atomic="true"
          >{results.length}
          {results.length === 1 ? 'team' : 'teams'}</span
        >
        <span class="browse-count" aria-hidden="true">
          {#key displayedCount}
            <span
              class="browse-count-number"
              style="min-width: {countDigits}ch"
            >
              <span
                class:browse-count-incoming={previousCount !== null}
                data-count={displayedCount}
                onanimationend={clearPreviousCount}>{displayedCount}</span
              >
              {#if previousCount !== null}<span
                  class="browse-count-outgoing"
                  data-count={previousCount}>{previousCount}</span
                >{/if}
            </span>
          {/key}
          <span class="browse-count-suffix"
            >{results.length === 1 ? 'team' : 'teams'}</span
          >
        </span>
      </p>
      {#if filters.length || selectedTypes.length || regulation !== current || sort !== 'priority' || filterState.error}<Button
          type="button"
          variant="ghost"
          class="min-h-11 px-2"
          disabled={!ready}
          onclick={clearFilters}>Clear filters</Button
        >{/if}
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling requires a focusable pane.) -->
    <div
      class="browse-results-scroll"
      bind:this={resultsPane}
      use:overflowCue={'results'}
      tabindex="0"
      role="region"
      aria-label="Team results"
    >
      <div class="browse-results-content">
        {#if results.length}
          <div class="browse-card-grid">
            {#each visible as team (team.id)}<TeamCard
                {team}
                currentRegulation={current}
                showRegulation={regulation === 'all'}
                query={page.url.search}
              />{/each}
          </div>
          {#if pageCount > 1}
            <nav
              aria-label="Team result pages"
              class="mt-8 flex items-center justify-center gap-4"
            >
              <Button
                variant="outline"
                class="min-h-11"
                disabled={pageNumber === 1}
                onclick={() => changeOption('page', String(pageNumber - 1))}
                >Previous</Button
              >
              <span
                aria-live="polite"
                aria-atomic="true"
                class="value text-secondary-text"
                >Page {pageNumber} of {pageCount}</span
              >
              <Button
                variant="outline"
                class="min-h-11"
                disabled={pageNumber === pageCount}
                onclick={() => changeOption('page', String(pageNumber + 1))}
                >Next</Button
              >
            </nav>
          {/if}
        {:else}
          <div class="plate px-6 py-10">
            <h2 class="text-lg leading-tight font-bold tracking-[-0.02em]">
              {filterState.error ? 'Invalid filter link' : 'No matching teams'}
            </h2>
            <p class="mt-2 max-w-[46ch] text-[0.9375rem] leading-relaxed">
              {filterState.error ||
                'Try changing your Pokémon, set, type, or regulation filters. Filters are never silently relaxed.'}
            </p>
            <Button
              type="button"
              variant="outline"
              class="mt-5 min-h-11"
              disabled={!ready}
              onclick={clearFilters}>Clear filters</Button
            >
          </div>
        {/if}
        <p class="provenance mt-8 max-w-3xl">
          Catalog snapshot: {data.catalog.updatedAt.slice(0, 10)}. Teams and
          result claims via {#each data.catalog.sources as source, index (source.url)}<a
              class="underline underline-offset-2"
              href={source.url}
              target="_blank"
              rel="external noreferrer">{source.name}</a
            >{index < data.catalog.sources.length - 1 ? ', ' : ''}{/each}.
          Published set details available for {teams.filter(
            (team) => team.paste
          ).length}
          teams.
        </p>
      </div>
    </div>
    <div class="browse-scroll-cue" aria-hidden="true">
      {#if moreTeams}More teams below <ChevronDown class="size-3" />{/if}
    </div>
  </section>
</main>
