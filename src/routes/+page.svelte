<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { SvelteSet } from 'svelte/reactivity';
  import { onMount } from 'svelte';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import BookmarkCheck from '@lucide/svelte/icons/bookmark-check';
  import Filter from '@lucide/svelte/icons/filter';
  import PokemonFilters from '#lib/components/PokemonFilters.svelte';
  import TeamCard from '#lib/components/TeamCard.svelte';
  import { browseStorageKey, type SavedTeam } from '#lib/workbench.js';
  import { notify } from '#lib/notifications.js';
  import {
    readSavedTeamsState,
    toggleCatalogWishlist,
  } from '#lib/saved-team-actions.js';
  import { wishlistedCatalogEntries } from '#lib/team-collections.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { sync } from '#lib/sync.svelte.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    readFilters,
    writeFilters,
    matchesTeam,
    compareBrowseTeams,
    type MemberFilter,
    type Team,
  } from '#lib/catalog.js';
  const browseKeys = ['member', 'regulation', 'page'];
  let storageError = $state(false);
  let filtersOpen = $state(false);
  let ready = $state(false);
  let saved = $state.raw<SavedTeam[]>([]);
  let savedError = $state('');
  let actionError = $state('');
  const pending = new SvelteSet<string>();
  const catalog = $derived(catalogState.catalog);
  const teams: Team[] = $derived(catalog.teams);
  const current = $derived(catalog.currentRegulation);
  const historicalRegulations = $derived(
    [...new Set(teams.map((team) => team.regulation))]
      .filter((value) => value !== current)
      .sort()
      .reverse()
  );
  const filterState = $derived.by(() => {
    try {
      return {
        filters: readFilters(new URL(page.url.href).searchParams),
        error: '',
      };
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
  const filterCount = $derived(
    filters.reduce(
      (count, { item, ability, move }) =>
        count +
        Number(!!item.trim()) +
        Number(!!ability.trim()) +
        Number(!!move.trim()),
      0
    ) + Number(regulation !== current)
  );
  const results = $derived(
    filterState.error
      ? []
      : teams
          .filter(
            (team) =>
              (regulation === 'all' || team.regulation === regulation) &&
              matchesTeam(team, filters)
          )
          .sort((a, b) => compareBrowseTeams(a, b, current))
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

  function browseParams(params: URLSearchParams) {
    const result = writeFilters(new URLSearchParams(), readFilters(params));
    result.set('regulation', params.get('regulation') || current);
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

  function navigate(
    params: URLSearchParams,
    preservePosition = true,
    hash = ''
  ) {
    const canonical = browseParams(params);
    rememberBrowse(canonical);
    const query = canonical.toString();

    void goto(resolve(`?${query}${hash}`), {
      replace: true,
      reset: false,
    }).then(() => {
      if (!preservePosition) window.scrollTo(0, 0);
    });
  }

  function restoreBrowse() {
    if (page.url.pathname !== resolve('/')) return;

    if (browseKeys.some((key) => page.url.searchParams.has(key))) {
      try {
        rememberBrowse(browseParams(new URL(page.url.href).searchParams));
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
        navigate(params, true, page.url.hash);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException) storageError = true;
    }
    navigate(new URLSearchParams(), true, page.url.hash);
  }

  afterNavigate(restoreBrowse);
  onMount(() => {
    ready = true;
  });
  $effect(() => {
    void sync.revision;
    if (ready) refreshSaved();
  });
  function refreshSaved() {
    const state = readSavedTeamsState();
    saved = state.saved;
    savedError = state.error;
  }
  function wishlist(team: Team) {
    if (pending.has(team.id)) return;
    pending.add(team.id);
    actionError = '';
    const result = toggleCatalogWishlist(team);
    refreshSaved();
    actionError = result.error;
    if (result.status) notify(result.status);
    pending.delete(team.id);
  }
  function changeFilters(next: MemberFilter[]) {
    navigate(writeFilters(new URL(page.url.href).searchParams, next));
  }
  function changeOption(key: string, value: string) {
    const params = new URL(page.url.href).searchParams;
    params.set(key, value);
    if (key !== 'page') params.delete('page');
    navigate(params, key !== 'page');
  }

  function clearFilters() {
    navigate(new URLSearchParams());
  }
</script>

<svelte:head>
  <title>Champion's Atlas — Find your next team</title>
</svelte:head>

<main id="main" class="app-container py-6 sm:py-8">
  <header>
    <h1
      class="text-[1.75rem] leading-tight font-extrabold wrap-break-word sm:text-4xl"
    >
      Explore teams
    </h1>
    <p
      class="mt-1.5 max-w-[58ch] text-[0.9375rem] leading-relaxed text-base-content/70"
    >
      Find a team for the Pokémon you want to use.
    </p>
  </header>

  {#if storageError}<p role="status" aria-live="polite" class="provenance mt-2">
      Filters can't be remembered on this device.
    </p>{/if}
  {#if savedError || actionError}<p
      role="alert"
      class="mt-2 text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {savedError || actionError}
    </p>{/if}

  <PokemonFilters
    {teams}
    {filters}
    onchange={changeFilters}
    expanded={filtersOpen}
    controlsId="browse-filters"
  >
    {#snippet actions()}
      <Button
        type="button"
        variant="quiet"
        class="shrink-0 max-sm:h-11 max-sm:min-w-11 max-sm:px-1"
        aria-expanded={filtersOpen}
        aria-controls="browse-filters"
        onclick={() => (filtersOpen = !filtersOpen)}
      >
        <Filter class="size-4" aria-hidden="true" />
        <span class="max-sm:sr-only">Filters</span>
        {#if filterCount}<span class="badge badge-primary">{filterCount}</span
          >{/if}
      </Button>
    {/snippet}
    {#snippet controls()}
      <label for="regulation" class="term block w-full sm:max-w-64"
        >Regulation
        <select
          id="regulation"
          class="select mt-1 min-h-11 w-full text-base sm:text-sm"
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
    {/snippet}
  </PokemonFilters>

  {#if !filtersOpen && regulation !== current}
    <p class="mt-2 text-sm wrap-break-word text-base-content/70">
      Regulation: {regulation === 'all' ? 'All regulations' : regulation}
    </p>
  {/if}

  <section aria-label="Matching teams" class="mt-5 min-w-0">
    <div class="flex items-baseline justify-between gap-3 border-b pb-1.5">
      <p
        aria-live="polite"
        aria-atomic="true"
        class="value font-semibold tracking-wide"
      >
        {results.length} teams
      </p>
      {#if filters.length || regulation !== current || filterState.error}<Button
          type="button"
          variant="quiet"
          disabled={!ready}
          onclick={clearFilters}>Clear filters</Button
        >{/if}
    </div>
    {#if results.length}
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {#each visible as team (team.id)}
          <TeamCard
            {team}
            showRegulation={regulation === 'all'}
            query={page.url.search}
          >
            {#snippet trailingActions()}
              {@const busy =
                !ready || savedError !== '' || pending.has(team.id)}
              {@const isWishlisted =
                wishlistedCatalogEntries(saved, team).length > 0}
              <Button
                type="button"
                variant="quiet"
                size="icon-compact"
                class="catalog-wishlist-button size-11"
                aria-label="Wishlist"
                aria-pressed={isWishlisted}
                title={isWishlisted
                  ? 'Remove from Wishlist'
                  : 'Add to Wishlist'}
                disabled={busy}
                onclick={() => wishlist(team)}
              >
                {#if isWishlisted}
                  <BookmarkCheck class="size-4" aria-hidden="true" />
                {:else}
                  <Bookmark class="size-4" aria-hidden="true" />
                {/if}
              </Button>
            {/snippet}
          </TeamCard>{/each}
      </div>
      {#if pageCount > 1}
        <nav
          aria-label="Team result pages"
          class="mt-8 flex items-center justify-center gap-4"
        >
          <Button
            variant="quiet"
            disabled={pageNumber === 1}
            onclick={() => changeOption('page', String(pageNumber - 1))}
            >Previous</Button
          >
          <span class="value text-base-content/70"
            >Page {pageNumber} of {pageCount}</span
          >
          <Button
            variant="quiet"
            disabled={pageNumber === pageCount}
            onclick={() => changeOption('page', String(pageNumber + 1))}
            >Next</Button
          >
        </nav>
      {/if}
    {:else}
      <div class="plate px-6 py-10">
        <h2 class="text-lg leading-tight font-extrabold">
          {filterState.error ? 'Invalid filter link' : 'No matching teams'}
        </h2>
        <p class="mt-2 max-w-[46ch] text-[0.9375rem] leading-relaxed">
          {filterState.error ||
            'Try removing an item constraint or a Pokémon. Filters are never silently relaxed.'}
        </p>
        <Button
          type="button"
          variant="quiet"
          class="mt-5"
          disabled={!ready}
          onclick={clearFilters}>Clear filters</Button
        >
      </div>
    {/if}
    <p class="provenance mt-8 max-w-3xl">
      Catalog snapshot: {catalog.updatedAt.slice(0, 10)}. Teams and result
      claims via {#each catalog.sources as source, index (source.url)}<a
          class="underline underline-offset-2"
          href={source.url}
          target="_blank"
          rel="external noreferrer">{source.name}</a
        >{index < catalog.sources.length - 1 ? ', ' : ''}{/each}. Published set
      details available for {teams.filter((team) => team.paste).length}
      teams.
    </p>
  </section>
</main>
