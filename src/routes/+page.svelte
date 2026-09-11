<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import X from '@lucide/svelte/icons/x';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    readFilters,
    writeFilters,
    matchesTeam,
    compareTeams,
    normalize,
    type MemberFilter,
    type Team,
  } from '$lib/catalog';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const teams: Team[] = $derived(data.catalog.teams);
  const current = $derived(data.catalog.currentRegulation);
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
  const regulation = $derived(page.url.searchParams.get('regulation') || 'all');
  const sort = $derived(page.url.searchParams.get('sort') || 'priority');
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
  const results = $derived(
    filterState.error
      ? []
      : teams
          .filter(
            (team) =>
              (regulation === 'all' || team.regulation === regulation) &&
              matchesTeam(team, filters)
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

  function navigate(params: URLSearchParams, noScroll = true) {
    void goto(resolve(`/?${params}`), {
      replaceState: true,
      noScroll,
      keepFocus: true,
    });
  }
  function changeFilters(next: MemberFilter[]) {
    navigate(writeFilters(page.url.searchParams, next));
  }
  function addPokemon(pokemon: string) {
    if (
      filters.length >= 6 ||
      filters.some((filter) => normalize(filter.pokemon) === normalize(pokemon))
    )
      return;
    changeFilters([...filters, { pokemon, item: '', ability: '', move: '' }]);
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
    return [
      ...new Set(
        teams.flatMap((team) =>
          team.members
            .filter(
              (member) => normalize(member.pokemon) === normalize(pokemon)
            )
            .flatMap((member) =>
              field === 'move'
                ? member.moves
                : member[field]
                  ? [member[field]]
                  : []
            )
        )
      ),
    ].sort();
  }
  function changeOption(key: string, value: string) {
    const params = new SvelteURLSearchParams(page.url.searchParams);
    params.set(key, value);
    if (key !== 'page') params.delete('page');
    navigate(params, key !== 'page');
  }
</script>

<svelte:head>
  <title>Champion's Atlas — Find your next team</title>
  <meta
    name="description"
    content="Find Pokémon Champions doubles teams with persistent Pokémon and item filters, result evidence, and regulation-aware ordering."
  />
</svelte:head>

<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  <div class="mb-8 flex flex-wrap items-end justify-between gap-5">
    <div>
      <p
        class="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase"
      >
        Your next six start here
      </p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Explore teams
      </h1>
      <p class="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Find a core you love. Compare the teams around it.
      </p>
    </div>
    <span
      class="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground"
      >Doubles · {current} + older regulations</span
    >
  </div>

  <div class="grid items-start gap-7 lg:grid-cols-[280px_1fr]">
    <aside class="rounded-2xl border bg-card p-5 lg:sticky lg:top-6">
      <details open>
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold"
          ><SlidersHorizontal class="size-4" aria-hidden="true" />Filters
          <span class="ml-auto text-sm font-normal text-muted-foreground"
            >{filters.length}/6</span
          ></summary
        >
        <p class="mt-1 mb-4 text-xs leading-5 text-muted-foreground">
          Teams must include every Pokémon you select. Forms and Megas match
          exactly.
        </p>
        <PokemonPicker
          options={availablePokemon}
          onselect={addPokemon}
          disabled={filters.length >= 6}
        />
        <div class="mt-4 space-y-3">
          {#each filters as filter, index (filter.pokemon)}
            <section
              class="rounded-xl border bg-background p-3"
              aria-label={`${filter.pokemon} constraints`}
            >
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">{filter.pokemon}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${filter.pokemon}`}
                  onclick={() =>
                    changeFilters(filters.filter((_, i) => i !== index))}
                  ><X class="size-4" aria-hidden="true" /></Button
                >
              </div>
              <label
                for={`item-${index}`}
                class="mt-1 block text-xs text-muted-foreground"
                >Held item</label
              >
              <select
                id={`item-${index}`}
                class="filter-select mt-1"
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
              <details
                class="mt-3"
                open={Boolean(filter.ability || filter.move)}
              >
                <summary
                  class="cursor-pointer py-1 text-xs text-muted-foreground"
                  >Move & ability</summary
                >
                {#each ['move', 'ability'] as field (field)}
                  <label
                    for={`${field}-${index}`}
                    class="mt-2 block text-xs text-muted-foreground capitalize"
                    >{field}</label
                  >
                  <select
                    id={`${field}-${index}`}
                    class="filter-select mt-1"
                    value={filter[field as 'move' | 'ability']}
                    onchange={(event) =>
                      updateMember(
                        index,
                        field as 'move' | 'ability',
                        event.currentTarget.value
                      )}
                  >
                    <option value="">Any {field}</option>
                    {#if filter[field as 'move' | 'ability'] && !options(filter.pokemon, field as 'move' | 'ability').includes(filter[field as 'move' | 'ability'])}
                      <option value={filter[field as 'move' | 'ability']}
                        >{filter[field as 'move' | 'ability']}</option
                      >
                    {/if}
                    {#each options(filter.pokemon, field as 'move' | 'ability') as option (option)}<option
                        value={option}>{option}</option
                      >{/each}
                  </select>
                {/each}
                <p class="mt-2 text-[11px] leading-4 text-muted-foreground">
                  Matches published sets only. Many teams have no set details
                  yet.
                </p>
              </details>
            </section>
          {/each}
        </div>
        <label for="regulation" class="mt-6 block text-xs font-semibold"
          >Regulation</label
        >
        <select
          id="regulation"
          class="filter-select mt-2"
          value={regulation}
          onchange={(event) =>
            changeOption('regulation', event.currentTarget.value)}
        >
          <option value="all">All regulations</option>
          {#each [...new Set(teams.map((team) => team.regulation))]
            .sort()
            .reverse() as reg (reg)}<option value={reg}
              >{reg}{reg === current ? ' · current' : ''}</option
            >{/each}
        </select>
        {#if filters.length || regulation !== 'all' || filterState.error}
          <Button
            variant="ghost"
            class="mt-3 min-h-11 w-full"
            onclick={() => navigate(new URLSearchParams())}
            >Clear filters</Button
          >
        {/if}
      </details>
    </aside>

    <section aria-label="Matching teams" class="min-w-0">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" aria-atomic="true" class="text-sm">
          <strong>{results.length}</strong> teams
          <span class="text-muted-foreground"
            >{filters.length || regulation !== 'all'
              ? 'matching filters'
              : 'in this catalog'}</span
          >
        </p>
        <label class="flex items-center gap-2 text-xs text-muted-foreground"
          >Sort
          <select
            aria-label="Sort teams"
            class="filter-select w-auto"
            value={sort}
            onchange={(event) =>
              changeOption('sort', event.currentTarget.value)}
            ><option value="priority">Recommended</option><option value="recent"
              >Newest shared</option
            ></select
          >
        </label>
      </div>
      <p class="mb-5 text-xs leading-5 text-muted-foreground">
        {sort === 'recent'
          ? 'Most recently shared teams first.'
          : 'Reported current-reg results first, then strong older results.'} Legality
        in {current} is not yet verified.
      </p>
      {#if results.length}
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <span class="text-sm text-muted-foreground"
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
          <p class="mt-2 text-sm text-muted-foreground">
            {filterState.error ||
              'Try removing an item constraint or a Pokémon. Filters are never silently relaxed.'}
          </p>
          <Button
            variant="outline"
            class="mt-5 min-h-11"
            onclick={() => navigate(new URLSearchParams())}
            >Clear filters</Button
          >
        </div>
      {/if}
      <p class="mt-8 text-xs leading-5 text-muted-foreground">
        Catalog snapshot: {data.catalog.updatedAt.slice(0, 10)}.
        <a
          class="underline underline-offset-2"
          href={data.catalog.sources[0].url}
          rel="external">Teams and result claims via VGCPastes</a
        >. Detailed sets available for {teams.filter((team) => team.paste)
          .length} teams.
      </p>
    </section>
  </div>
</main>
