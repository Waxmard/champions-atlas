<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { SvelteSet } from 'svelte/reactivity';
  import { onMount } from 'svelte';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import BookmarkCheck from '@lucide/svelte/icons/bookmark-check';
  import Filter from '@lucide/svelte/icons/filter';
  import X from '@lucide/svelte/icons/x';
  import PokemonPicker from '#lib/components/PokemonPicker.svelte';
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import TeamCard from '#lib/components/TeamCard.svelte';
  import TypeFilter from '#lib/components/TypeFilter.svelte';
  import {
    getPokemonTypes,
    getTypeIcon,
    TYPE_COLORS,
    type PokemonType,
  } from '#lib/types.js';
  import {
    browseStorageKey,
    storageKey,
    type SavedTeam,
  } from '#lib/workbench.js';
  import {
    openCatalogTeam,
    readSavedTeamsState,
    toggleCatalogWishlist,
  } from '#lib/saved-team-actions.js';
  import { wishlistedCatalogEntries } from '#lib/team-collections.js';
  import { sync } from '#lib/sync.svelte.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    readFilters,
    writeFilters,
    matchesTeam,
    compareBrowseTeams,
    getMemberOptions,
    isCustomRulesTeam,
    browsePokemon,
    pokemonId,
    type MemberFilter,
    type Team,
  } from '#lib/catalog.js';
  import type { PageData } from './$types';

  const browseKeys = ['member', 'regulation', 'sort', 'page', 'type', 'custom'];
  const ALL_TYPES = Object.keys(TYPE_COLORS) as PokemonType[];
  let { data }: { data: PageData } = $props();
  let storageError = $state(false);
  let typeOpen = $state(false);
  let ready = $state(false);
  let saved = $state.raw<SavedTeam[]>([]);
  let savedError = $state('');
  let actionError = $state('');
  let status = $state('');
  const pending = new SvelteSet<string>();
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
  const sort = $derived(page.url.searchParams.get('sort') || 'priority');
  const includeCustomRules = $derived(
    page.url.searchParams.get('custom') === '1'
  );
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
        teams.flatMap((team) =>
          team.members.map((member) => browsePokemon(member.pokemon))
        )
      ),
    ].sort()
  );
  const availablePokemon = $derived(
    allPokemon.filter(
      (pokemon) =>
        !filters.some(
          (filter) => pokemonId(filter.pokemon) === pokemonId(pokemon)
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
              (!isCustomRulesTeam(team) || includeCustomRules) &&
              matchesTeam(team, filters) &&
              matchesTypes(team, selectedTypes)
          )
          .sort((a, b) =>
            sort === 'recent'
              ? b.publishedAt.localeCompare(a.publishedAt) ||
                a.id.localeCompare(b.id)
              : compareBrowseTeams(a, b, current)
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

  function browseParams(params: URLSearchParams) {
    const result = writeFilters(new URLSearchParams(), readFilters(params));
    for (const value of params.getAll('type')) {
      const type = value.toLowerCase();
      if ((ALL_TYPES as string[]).includes(type)) result.append('type', type);
    }
    result.set('regulation', params.get('regulation') || current);
    result.set('sort', params.get('sort') === 'recent' ? 'recent' : 'priority');
    if (params.get('custom') === '1') result.set('custom', '1');
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

  function navigate(params: URLSearchParams, preservePosition = true) {
    const canonical = browseParams(params);
    rememberBrowse(canonical);
    const query = canonical.toString();

    void goto(resolve(`?${query}`), {
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
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey) refreshSaved();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
    status = actionError = '';
    const result = toggleCatalogWishlist(team);
    refreshSaved();
    actionError = result.error;
    status = result.status;
    pending.delete(team.id);
  }
  async function use(team: Team) {
    if (pending.has(team.id)) return;
    pending.add(team.id);
    status = actionError = '';
    const error = await openCatalogTeam(team);
    if (error) actionError = error;
    else refreshSaved();
    pending.delete(team.id);
  }
  function changeFilters(next: MemberFilter[]) {
    navigate(writeFilters(new URL(page.url.href).searchParams, next));
  }
  function addPokemon(pokemon: string) {
    pokemon = browsePokemon(pokemon);
    if (
      filters.length >= 6 ||
      filters.some((filter) => pokemonId(filter.pokemon) === pokemonId(pokemon))
    )
      return;
    changeFilters([
      ...filters,
      {
        pokemon,
        item: '',
        ability: '',
        move: '',
      },
    ]);
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
    const params = new URL(page.url.href).searchParams;
    params.set(key, value);
    if (key !== 'page') params.delete('page');
    navigate(params, key !== 'page');
  }

  function clearFilters() {
    navigate(new URLSearchParams());
  }

  function setTypes(next: PokemonType[]) {
    const params = new URL(page.url.href).searchParams;
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

<main id="main" class="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
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
  <p role="status" aria-live="polite" class="sr-only">{status}</p>

  <div class="mt-4">
    <Button
      type="button"
      variant="secondary"
      aria-expanded={typeOpen}
      onclick={() => (typeOpen = !typeOpen)}
    >
      <Filter class="size-4 text-base-content/60" aria-hidden="true" />
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
            class="inline-flex items-center gap-1.5 border border-s-[3px] border-base-300 bg-base-100 py-1 ps-2 pe-1 text-[0.8125rem]"
            style="border-inline-start-color: {TYPE_COLORS[type]}"
          >
            <img src={getTypeIcon(type)} alt="" class="size-3.5" /><span
              class="font-medium">{type}</span
            >
            <Button
              variant="quiet"
              size="icon-compact"
              aria-label={`Remove ${type} type filter`}
              onclick={() => setTypes(selectedTypes.filter((t) => t !== type))}
              ><X class="size-3.5" aria-hidden="true" /></Button
            >
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="mt-4">
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
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      {#each filters as filter, index (filter.pokemon)}
        <section
          class="plate min-w-0 px-4 pt-3 pb-4"
          style="border-inline-start: 3px solid {TYPE_COLORS[
            getPokemonTypes(filter.pokemon)[0]
          ]}"
          aria-label={`${filter.pokemon} constraints`}
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <h2
                class="min-w-0 text-lg leading-tight font-extrabold wrap-break-word"
              >
                <SpeciesLabel pokemon={filter.pokemon} spriteSize={36} />
              </h2>
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon-compact"
              class="shrink-0"
              aria-label={`Remove ${filter.pokemon}`}
              onclick={() =>
                changeFilters(filters.filter((_, i) => i !== index))}
              ><X class="size-4" aria-hidden="true" /></Button
            >
          </div>

          <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label for={`item-${index}`} class="term min-w-0"
              >Held item
              <select
                id={`item-${index}`}
                class="select mt-1 min-h-11 w-full text-base sm:text-sm"
                value={filter.item}
                onchange={(event) =>
                  updateMember(index, 'item', event.currentTarget.value)}
              >
                <option value="">Any item</option>
                {#each options(filter.pokemon, 'item') as item (item)}<option
                    value={item}>{item}</option
                  >{/each}
                {#if filter.item && !options(filter.pokemon, 'item').includes(filter.item)}<option
                    value={filter.item}>{filter.item}</option
                  >{/if}
              </select>
            </label>

            <label for={`ability-${index}`} class="term min-w-0"
              >Ability
              <select
                id={`ability-${index}`}
                class="select mt-1 min-h-11 w-full text-base sm:text-sm"
                value={filter.ability}
                onchange={(event) =>
                  updateMember(index, 'ability', event.currentTarget.value)}
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

            <label
              for={`move-${index}`}
              class="term col-span-2 min-w-0 sm:col-span-1"
              >Move
              <select
                id={`move-${index}`}
                class="select mt-1 min-h-11 w-full text-base sm:text-sm"
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

  <div class="mt-4 grid grid-cols-2 gap-3">
    <label for="regulation" class="term min-w-0"
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

    <label for="sort" class="term min-w-0"
      >Sort
      <select
        id="sort"
        aria-label="Sort teams"
        class="select mt-1 min-h-11 w-full text-base sm:text-sm"
        value={sort}
        onchange={(event) => changeOption('sort', event.currentTarget.value)}
      >
        <option value="priority">Recommended</option>
        <option value="recent">Newest shared</option>
      </select>
    </label>
  </div>

  <div class="mt-4">
    <label
      for="include-custom-rules"
      class="term inline-flex min-h-11 cursor-pointer items-center gap-2.5"
    >
      <input
        id="include-custom-rules"
        type="checkbox"
        name="custom"
        value="1"
        autocomplete="off"
        class="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
        checked={includeCustomRules}
        disabled={!ready}
        onchange={(event) =>
          changeOption('custom', event.currentTarget.checked ? '1' : '')}
      />
      Include custom-rule teams
    </label>
  </div>

  <section aria-label="Matching teams" class="mt-5 min-w-0">
    <div class="flex items-baseline justify-between gap-3 border-b pb-1.5">
      <p
        aria-live="polite"
        aria-atomic="true"
        class="value font-semibold tracking-wide"
      >
        {results.length} teams
      </p>
      {#if filters.length || selectedTypes.length || regulation !== current || sort !== 'priority' || includeCustomRules || filterState.error}<Button
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
            currentRegulation={current}
            showRegulation={regulation === 'all'}
            query={page.url.search}
          >
            {#snippet actions()}
              {@const busy =
                !ready || savedError !== '' || pending.has(team.id)}
              {@const isWishlisted =
                wishlistedCatalogEntries(saved, team).length > 0}
              <Button
                type="button"
                variant="quiet"
                size="icon-compact"
                class={isWishlisted
                  ? 'text-primary disabled:text-primary/80'
                  : ''}
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
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onclick={() => use(team)}>Use this team</Button
              >
            {/snippet}
          </TeamCard>{/each}
      </div>
      {#if pageCount > 1}
        <nav
          aria-label="Team result pages"
          class="mt-8 flex items-center justify-center gap-4"
        >
          <Button
            variant="secondary"
            disabled={pageNumber === 1}
            onclick={() => changeOption('page', String(pageNumber - 1))}
            >Previous</Button
          >
          <span class="value text-base-content/70"
            >Page {pageNumber} of {pageCount}</span
          >
          <Button
            variant="secondary"
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
          variant="secondary"
          class="mt-5"
          disabled={!ready}
          onclick={clearFilters}>Clear filters</Button
        >
      </div>
    {/if}
    <p class="provenance mt-8 max-w-3xl">
      Catalog snapshot: {data.catalog.updatedAt.slice(0, 10)}. Teams and result
      claims via {#each data.catalog.sources as source, index (source.url)}<a
          class="underline underline-offset-2"
          href={source.url}
          target="_blank"
          rel="external noreferrer">{source.name}</a
        >{index < data.catalog.sources.length - 1 ? ', ' : ''}{/each}. Published
      set details available for {teams.filter((team) => team.paste).length}
      teams.
    </p>
  </section>
</main>
