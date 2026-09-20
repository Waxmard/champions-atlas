<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { onMount } from 'svelte';
  import Filter from '@lucide/svelte/icons/filter';
  import X from '@lucide/svelte/icons/x';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import TypeFilter from '$lib/components/TypeFilter.svelte';
  import {
    getCardBackgroundStyle,
    getPokemonTypes,
    getTypeIcon,
    TYPE_COLORS,
    type PokemonType,
  } from '$lib/types';
  import {
    activeTeamKey,
    browseStorageKey,
    readSavedTeams,
    resolveSavedTeamId,
  } from '$lib/workbench';
  import { pushNow } from '$lib/sync.svelte';
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
      void pushNow();
    } catch {
      storageError = true;
    }
  }

  function navigate(params: URLSearchParams, noScroll = true) {
    const canonical = browseParams(params);
    rememberBrowse(canonical);
    const query = canonical.toString();
    void goto(resolve(`/?${query}`), {
      replaceState: true,
      noScroll,
      keepFocus: true,
    });
  }

  function restoreBrowse() {
    if (page.url.pathname !== resolve('/')) return;

    if (page.url.searchParams.size === 0) {
      try {
        const saved = readSavedTeams(localStorage);
        const targetId = resolveSavedTeamId(
          saved,
          null,
          localStorage.getItem(activeTeamKey)
        );
        if (targetId) {
          void goto(resolve(`/my-teams?team=${targetId}`), {
            replaceState: true,
          });
          return;
        }
      } catch {
        storageError = true;
      }
    }

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
  });
  function changeFilters(next: MemberFilter[]) {
    navigate(writeFilters(page.url.searchParams, next));
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
    changeFilters([
      ...filters,
      {
        pokemon,
        item: items.length === 1 ? items[0] : '',
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
    const params = new SvelteURLSearchParams(page.url.searchParams);
    params.set(key, value);
    if (key !== 'page') params.delete('page');
    navigate(params, key !== 'page');
  }

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
    content="Find Pokémon Champions doubles teams with persistent Pokémon and item filters, result evidence, and regulation-aware ordering."
  />
</svelte:head>

<main id="main" class="mx-auto max-w-7xl px-4 pt-4 pb-8 sm:px-8 sm:pt-6">
  <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
    Explore teams
  </h1>

  {#if storageError}<p
      role="status"
      aria-live="polite"
      class="mt-2 text-xs text-base-content/70"
    >
      Filters can't be remembered on this device.
    </p>{/if}

  <div class="mt-4">
    <button
      type="button"
      aria-expanded={typeOpen}
      onclick={() => (typeOpen = !typeOpen)}
      class="btn min-h-11 gap-2 btn-outline"
    >
      <Filter class="size-4 text-base-content/70" aria-hidden="true" />
      Filter by type
      {#if selectedTypes.length}<span class="badge badge-primary"
          >{selectedTypes.length}</span
        >{/if}
    </button>
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
            class="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            <img src={getTypeIcon(type)} alt="" class="size-3.5" />{type}
            <button
              type="button"
              aria-label={`Remove ${type} type filter`}
              onclick={() => setTypes(selectedTypes.filter((t) => t !== type))}
              class="-mr-1 rounded-full p-0.5 hover:bg-primary/15"
              ><X class="size-3" aria-hidden="true" /></button
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
    <div class="mt-2 divide-y border-y">
      {#each filters as filter, index (filter.pokemon)}
        <section class="py-4" aria-label={`${filter.pokemon} constraints`}>
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-lg"
                style={getCardBackgroundStyle(filter.pokemon, true)}
              >
                <PokemonSprite pokemon={filter.pokemon} size={32} />
              </div>
              <h2 class="min-w-0 text-sm font-semibold wrap-break-word">
                {filter.pokemon}
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

          <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label for={`item-${index}`} class="min-w-0 text-xs font-medium"
              >Held item
              <select
                id={`item-${index}`}
                class="select mt-1 min-h-11 w-full text-base sm:text-sm"
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

            <label for={`ability-${index}`} class="min-w-0 text-xs font-medium"
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
              class="col-span-2 min-w-0 text-xs font-medium sm:col-span-1"
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
    <label for="regulation" class="min-w-0 text-xs font-semibold"
      >Regulation
      <select
        id="regulation"
        class="select mt-1 min-h-11 w-full text-base sm:text-sm"
        value={regulation}
        onchange={(event) =>
          changeOption('regulation', event.currentTarget.value)}
      >
        <option value={current}>{current} · current</option>
        <option value="all">All regulations</option>
        {#if regulation !== current && regulation !== 'all' && !historicalRegulations.includes(regulation)}<option
            value={regulation}>{regulation}</option
          >{/if}
        {#each historicalRegulations as reg (reg)}<option value={reg}
            >{reg}</option
          >{/each}
      </select>
    </label>

    <label for="sort" class="min-w-0 text-xs font-semibold"
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

  <section aria-label="Matching teams" class="mt-4 min-w-0">
    <div class="mb-1 flex items-center justify-between gap-3">
      <p aria-live="polite" aria-atomic="true" class="text-sm font-semibold">
        {results.length} teams
      </p>
      {#if filters.length || selectedTypes.length || regulation !== current || sort !== 'priority' || filterState.error}<Button
          type="button"
          variant="ghost"
          class="min-h-11 px-2"
          disabled={!ready}
          onclick={clearFilters}>Clear filters</Button
        >{/if}
    </div>
    <p class="mb-4 text-xs leading-5 text-base-content/70">
      Legality in {current} is not yet verified.
    </p>

    {#if results.length}
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {#each visible as team (team.id)}<TeamCard
            {team}
            currentRegulation={current}
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
          <span class="text-sm text-base-content/70"
            >{pageNumber} / {pageCount}</span
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
      <div class="rounded-2xl border border-dashed p-10 text-center">
        <h2 class="font-semibold">
          {filterState.error ? 'Invalid filter link' : 'No matching teams'}
        </h2>
        <p class="mt-2 text-sm text-base-content/70">
          {filterState.error ||
            'Try removing an item constraint or a Pokémon. Filters are never silently relaxed.'}
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
    <p class="mt-8 text-xs leading-5 text-base-content/70">
      Catalog snapshot: {data.catalog.updatedAt.slice(0, 10)}.
      <a
        class="underline underline-offset-2"
        href={data.catalog.sources[0].url}
        target="_blank"
        rel="external noreferrer">Teams and result claims via VGCPastes</a
      >. Detailed sets available for {teams.filter((team) => team.paste).length}
      teams.
    </p>
  </section>
</main>
