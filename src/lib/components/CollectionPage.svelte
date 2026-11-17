<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import { page } from '$app/state';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Save from '@lucide/svelte/icons/save';
  import Star from '@lucide/svelte/icons/star';
  import PokemonFilters from '#lib/components/PokemonFilters.svelte';
  import SavedTeamEditor from '#lib/components/SavedTeamEditor.svelte';
  import WishlistList from '#lib/components/WishlistList.svelte';
  import WishlistTeamView from '#lib/components/WishlistTeamView.svelte';
  import SortMenu from '#lib/components/SortMenu.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { matchesTeam, type MemberFilter } from '#lib/catalog.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import {
    createCurrentSetRegistry,
    currentSetOwnerMatches,
  } from '#lib/current-set-registry.svelte.js';
  import {
    currentSetsChangedEvent,
    prepareCurrentSets,
    readCurrentSets,
    saveCurrentSets,
    unrecordedMembers,
  } from '#lib/current-sets.js';
  import { notify } from '#lib/notifications.js';
  import { pushNow, sync } from '#lib/sync.svelte.js';
  import {
    displaySavedTeam,
    resolveCatalogTeam,
    SavedTeamError,
    savedTeamHeading,
    sortByWinRate,
  } from '#lib/team-collections.js';
  import {
    readSavedTeams,
    savedFavoritesKey,
    savedSortKey,
    wishlistSortKey,
    type SavedTeam,
  } from '#lib/workbench.js';
  import { sortByVpCost } from '#lib/vp-cost.js';

  let {
    collection,
    orderTeams,
    reorderTeams,
    useTeam,
    removeTeam,
    empty,
    setFavorite,
    setCurrent,
    busy = false,
    ready = $bindable(false),
    loaded = $bindable(false),
    storageError = $bindable(''),
    errorMessage = $bindable(''),
    inlineError = $bindable(false),
    importForm,
    shareRecovery,
  }: {
    collection: 'wishlist' | 'saved';
    orderTeams: (teams: SavedTeam[]) => SavedTeam[];
    reorderTeams: (
      storage: Storage,
      orderedIds: string[],
      expectedIds: string[]
    ) => SavedTeam[] | null;
    useTeam?: (storage: Storage, id: string) => SavedTeam;
    removeTeam: (storage: Storage, id: string) => void;
    empty: string;
    busy?: boolean;
    setFavorite?: (
      storage: Storage,
      id: string,
      favorite: boolean
    ) => SavedTeam;
    setCurrent?: (
      storage: Storage,
      id: string,
      current: boolean
    ) => SavedTeam[];
    ready?: boolean;
    loaded?: boolean;
    storageError?: string;
    errorMessage?: string;
    inlineError?: boolean;
    importForm?: Snippet;
    shareRecovery?: Snippet;
  } = $props();

  let entries = $state<SavedTeam[]>([]);
  let filters = $state<MemberFilter[]>([]);
  let favoritesOnly = $state(false);
  type Sort = 'manual' | 'record' | 'vp';
  let sort = $state<Sort>('manual');
  const sortKey = $derived(
    collection === 'saved' ? savedSortKey : wishlistSortKey
  );
  const sortOptions = [
    ['manual', 'Manual order'],
    ['record', 'Win rate'],
    ['vp', 'VP spend'],
  ] as const;
  const parseSort = (value: string | null): Sort =>
    value === 'record' || value === 'vp' ? value : 'manual';
  const currentSets = createCurrentSetRegistry();
  const filtered = $derived(filters.length > 0 || favoritesOnly);
  const pickerTeams = $derived(entries.map(displaySavedTeam));
  const visibleEntries = $derived.by(() => {
    const matching = entries.filter(
      (entry) =>
        matchesTeam(entry, filters) &&
        (!favoritesOnly || entry.favorite || entry.current)
    );
    return sort === 'record'
      ? sortByWinRate(matching)
      : sort === 'vp'
        ? sortByVpCost(matching, currentSets.sets, catalogState.catalog)
        : matching;
  });
  const unrecorded = $derived(
    collection === 'saved' && currentSets.sets
      ? unrecordedMembers(currentSets.sets, entries)
      : []
  );
  let pendingId = $state('');
  let listRegion = $state<HTMLDivElement>();
  let listScroll: { x: number; y: number } | null = null;
  let listOpener: HTMLElement | null = null;
  const label = $derived(collection === 'saved' ? 'Saved' : 'Wishlist');
  const route = $derived(`/${collection}`);
  const selectedId = $derived(page.url.searchParams.get('team'));
  const selectedEntry = $derived(
    entries.find((entry) => entry.id === selectedId)
  );

  beforeNavigate(({ from, to }) => {
    if (
      from?.route.id !== route ||
      to?.route.id !== route ||
      from.url.searchParams.has('team') ||
      !to.url.searchParams.has('team')
    )
      return;
    listScroll = { x: window.scrollX, y: window.scrollY };
    const active = document.activeElement;
    listOpener =
      active instanceof HTMLElement && listRegion?.contains(active)
        ? active
        : null;
  });

  afterNavigate(({ from, to }) => {
    if (
      from?.route.id !== route ||
      to?.route.id !== route ||
      !from.url.searchParams.has('team') ||
      to.url.searchParams.has('team') ||
      !listScroll
    )
      return;
    const { x: left, y: top } = listScroll;
    const restore = () => window.scrollTo({ left, top, behavior: 'instant' });
    void tick().then(() => {
      if (page.route.id !== route || page.url.searchParams.has('team')) return;
      if (listOpener?.isConnected) listOpener.focus({ preventScroll: true });
      restore();
      requestAnimationFrame(restore);
    });
  });

  export function refresh() {
    try {
      entries = orderTeams(readSavedTeams(localStorage));
      storageError = '';
    } catch {
      entries = [];
      storageError =
        'Saved teams could not be read. Check app storage access. Existing data has been left untouched.';
    }
    loaded = true;
  }

  function readFavoritesOnly(): boolean {
    try {
      return localStorage.getItem(savedFavoritesKey) !== '0';
    } catch {
      return true;
    }
  }

  function readSort(): Sort {
    try {
      return parseSort(localStorage.getItem(sortKey));
    } catch {
      return 'manual';
    }
  }

  function setSort(value: string) {
    sort = parseSort(value);
    try {
      localStorage.setItem(sortKey, sort);
    } catch {
      return;
    }
  }

  function setFavoritesOnly(value: boolean) {
    favoritesOnly = value;
    try {
      localStorage.setItem(savedFavoritesKey, value ? '1' : '0');
    } catch {
      return;
    }
  }

  onMount(() => {
    ready = true;
    sort = readSort();
    if (setFavorite) favoritesOnly = readFavoritesOnly();
    refresh();
  });

  $effect(() => {
    void sync.revision;
    if (ready) untrack(refresh);
  });

  function reorder(orderedIds: string[], expectedIds: string[]): boolean {
    errorMessage = '';
    inlineError = false;
    try {
      const next = reorderTeams(localStorage, orderedIds, expectedIds);
      refresh();
      if (next) void pushNow();
      return true;
    } catch (error) {
      refresh();
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : `Could not reorder ${label}. Existing saved teams have been left untouched.`;
      return false;
    }
  }

  function recordUnrecorded() {
    errorMessage = '';
    inlineError = false;
    try {
      if (!currentSetOwnerMatches()) {
        currentSets.refresh();
        errorMessage = currentSets.error;
        return;
      }
      const members = unrecordedMembers(
        readCurrentSets(localStorage),
        orderTeams(readSavedTeams(localStorage))
      );
      if (!members.length) {
        currentSets.refresh();
        notify('No in-game sets to record.');
        return;
      }
      saveCurrentSets(
        localStorage,
        prepareCurrentSets(localStorage, members),
        new Set()
      );
      void pushNow();
      window.dispatchEvent(new Event(currentSetsChangedEvent));
      notify(
        `Recorded ${members.length} in-game ${members.length === 1 ? 'set' : 'sets'} on this device.`
      );
    } catch (error) {
      currentSets.refresh();
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Could not record in-game sets. Existing in-game sets were left untouched.';
    }
  }

  async function use(entry: SavedTeam) {
    if (pendingId || !useTeam) return;
    pendingId = entry.id;
    errorMessage = '';
    inlineError = false;
    let promoted: SavedTeam;
    try {
      promoted = useTeam(localStorage, entry.id);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not move this team to Saved. Check app storage access and available space. Nothing was changed.';
      pendingId = '';
      refresh();
      return;
    }
    void pushNow();
    try {
      await goto(
        (resolve('saved') +
          '?team=' +
          encodeURIComponent(promoted.id)) as ResolvedPathname
      );
    } catch {
      errorMessage = 'Could not open Saved. Your team was saved.';
      refresh();
    }
    notify('Team moved to Saved.');
    pendingId = '';
  }

  function updateFlag(run: () => unknown) {
    if (pendingId) return;
    errorMessage = '';
    inlineError = false;
    try {
      run();
      void pushNow();
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not update this team. Existing saved teams have been left untouched.';
    }
    refresh();
  }

  const toggleFavorite = (entry: SavedTeam) =>
    setFavorite &&
    updateFlag(() => setFavorite(localStorage, entry.id, !entry.favorite));

  const toggleCurrent = (entry: SavedTeam) =>
    setCurrent &&
    updateFlag(() => setCurrent(localStorage, entry.id, !entry.current));

  async function remove(entry: SavedTeam) {
    if (pendingId) return;
    if (
      !confirm(
        collection === 'saved'
          ? `Delete “${entry.name}” and its record?`
          : `Remove “${entry.name}” from ${label}?`
      )
    )
      return;
    pendingId = entry.id;
    errorMessage = '';
    inlineError = false;
    const index = visibleEntries.findIndex(({ id }) => id === entry.id);
    const wasSelected = selectedId === entry.id;
    try {
      removeTeam(localStorage, entry.id);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not remove this team. Existing saved teams have been left untouched.';
      pendingId = '';
      refresh();
      return;
    }
    void pushNow();
    notify(collection === 'saved' ? 'Team deleted.' : `Removed from ${label}.`);
    refresh();
    pendingId = '';
    if (wasSelected) {
      try {
        await goto(resolve(collection));
      } catch {
        errorMessage = `Team removed, but ${label} could not be opened.`;
        return;
      }
    }
    await tick();
    const rows = document.querySelectorAll<HTMLElement>(
      collection === 'saved' ? '[data-swipe-left]' : '[data-wishlist-use]'
    );
    const next = rows[Math.min(index, visibleEntries.length - 1)];
    if (next) {
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'center' });
    } else {
      document.querySelector<HTMLElement>('nav[aria-label="Main"] a')?.focus();
    }
  }
</script>

<svelte:head>
  <title
    >{selectedEntry
      ? `${savedTeamHeading(selectedEntry).title} — ${label}`
      : label} — Champion's Atlas</title
  >
</svelte:head>

{#snippet alert(message: string)}
  <p
    role="alert"
    class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
    style="color: var(--color-error-content)"
  >
    {message}
  </p>
{/snippet}

{#snippet loading()}
  <p class="mt-6 text-[0.9375rem] text-base-content/70">Loading {label}…</p>
{/snippet}

<main id="main" class="app-container pt-2 pb-8 sm:pb-12">
  <div bind:this={listRegion} data-page-under hidden={selectedId !== null}>
    <h1 class="sr-only">{label}</h1>
    {@render importForm?.()}
    {#if unrecorded.length}
      <Button
        type="button"
        variant="quiet"
        class="min-h-11"
        disabled={!ready || !!pendingId || busy}
        onclick={recordUnrecorded}
      >
        <Save class="size-4" aria-hidden="true" />
        <span
          >Record {unrecorded.length} in-game {unrecorded.length === 1
            ? 'set'
            : 'sets'}</span
        >
      </Button>
    {/if}
    {#if !inlineError && errorMessage}
      {@render alert(errorMessage)}
    {/if}
    {#if storageError}
      {@render alert(storageError)}
    {/if}
    {@render shareRecovery?.()}
    {#if !loaded}
      {@render loading()}
    {:else if !storageError}
      {#if entries.length}
        <PokemonFilters
          teams={pickerTeams}
          {filters}
          onchange={(next) => (filters = next)}
        />
        <div
          class="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-1.5"
        >
          <p
            aria-live="polite"
            aria-atomic="true"
            class="value font-semibold tracking-wide"
          >
            {visibleEntries.length} matching {visibleEntries.length === 1
              ? 'team'
              : 'teams'}
          </p>
          <div class="flex flex-wrap items-center gap-1">
            <SortMenu
              label={`Sort ${label}`}
              value={sort}
              options={sortOptions}
              onchange={setSort}
            />
            {#if setFavorite}
              <Button
                type="button"
                variant="quiet"
                aria-pressed={favoritesOnly}
                onclick={() => setFavoritesOnly(!favoritesOnly)}
              >
                <Star
                  class="size-4 {favoritesOnly ? 'fill-current' : ''}"
                  aria-hidden="true"
                />
                Favorites
              </Button>
            {/if}
            {#if filters.length}
              <Button
                type="button"
                variant="quiet"
                onclick={() => (filters = [])}>Clear filters</Button
              >
            {/if}
          </div>
        </div>
        {#if (filtered || sort !== 'manual') && entries.length > 1}
          <p class="provenance mt-2">
            {sort !== 'manual'
              ? `Switch to Manual order to reorder ${label}.`
              : favoritesOnly
                ? 'Turn off Favorites to reorder Saved.'
                : `Clear filters to reorder ${label}.`}
          </p>
        {/if}
        {#if visibleEntries.length}
          <WishlistList
            {collection}
            entries={visibleEntries}
            disabled={!ready || !!pendingId || busy}
            sortable={sort === 'manual' && !filtered && entries.length > 1}
            displayTeam={displaySavedTeam}
            onuse={useTeam ? use : undefined}
            onremove={remove}
            onreorder={reorder}
            onfavorite={setFavorite ? toggleFavorite : undefined}
            oncurrent={setCurrent ? toggleCurrent : undefined}
          />
        {:else if favoritesOnly && !filters.length}
          <div class="plate mt-2 max-w-xl px-4 py-3">
            <h2 class="text-lg leading-tight font-extrabold">
              No favorite teams yet
            </h2>
            <p class="mt-2 text-[0.9375rem] leading-relaxed">
              Star a team to list it here.
            </p>
            <Button
              type="button"
              variant="quiet"
              class="-ms-2 mt-1 min-h-11"
              onclick={() => setFavoritesOnly(false)}>Show all</Button
            >
          </div>
        {:else}
          <div class="plate mt-2 max-w-xl px-4 py-3">
            <h2 class="text-lg leading-tight font-extrabold">
              No matching teams
            </h2>
            <p class="mt-2 text-[0.9375rem] leading-relaxed">
              Remove a Pokémon or clear filters to see more teams.
            </p>
          </div>
        {/if}
      {:else}
        <p
          class="plate mt-2 max-w-xl px-4 py-3 text-[0.9375rem] leading-relaxed"
        >
          {empty}
        </p>
      {/if}
    {/if}
  </div>
  {#if selectedId !== null}
    {#if !loaded || storageError || !selectedEntry}
      <h1 class="sr-only">{label}</h1>
    {/if}
    <div
      class="sticky top-[var(--app-header-height,0px)] z-30 [margin-inline-start:calc(-1*(1rem+env(safe-area-inset-left)))] [margin-inline-end:calc(-1*(1rem+env(safe-area-inset-right)))] border-b border-base-300 bg-base-200 py-1 [padding-inline-start:calc(1rem+env(safe-area-inset-left))] [padding-inline-end:calc(1rem+env(safe-area-inset-right))] sm:[margin-inline-start:calc(-1*(2rem+env(safe-area-inset-left)))] sm:[margin-inline-end:calc(-1*(2rem+env(safe-area-inset-right)))] sm:[padding-inline-start:calc(2rem+env(safe-area-inset-left))] sm:[padding-inline-end:calc(2rem+env(safe-area-inset-right))]"
    >
      <a
        data-swipe-back
        href={resolve(collection)}
        class="provenance inline-flex min-h-11 items-center gap-2 text-[0.8125rem] outline-none hover:text-base-content"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />
        Back to {label}
      </a>
    </div>
    {#if !inlineError && errorMessage}
      {@render alert(errorMessage)}
    {/if}
    {@render shareRecovery?.()}
    {#if !loaded}
      {@render loading()}
    {:else if storageError}
      {@render alert(storageError)}
    {:else if selectedEntry}
      {#key selectedEntry.id}
        {#if collection === 'saved'}
          <SavedTeamEditor
            teamId={selectedEntry.id}
            busy={!!pendingId}
            onchange={refresh}
            ondelete={() => remove(selectedEntry)}
          />
        {:else}
          <WishlistTeamView
            entry={selectedEntry}
            match={resolveCatalogTeam(
              selectedEntry.original,
              catalogState.catalog.teams
            )}
            disabled={!ready || !!pendingId}
            onuse={() => use(selectedEntry)}
            onremove={() => remove(selectedEntry)}
          />
        {/if}
      {/key}
    {:else}
      <div class="plate mt-6 max-w-xl px-4 py-3">
        <p role="status" class="text-[0.9375rem] leading-relaxed">
          This team is no longer in {label}.
        </p>
        <div class="mt-3">
          <Button href={resolve(collection)} variant="quiet" class="min-h-11">
            Back to {label}
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</main>
