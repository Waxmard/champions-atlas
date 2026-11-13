<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import { page } from '$app/state';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import PokemonFilters from '#lib/components/PokemonFilters.svelte';
  import WishlistList from '#lib/components/WishlistList.svelte';
  import WishlistTeamView from '#lib/components/WishlistTeamView.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { matchesTeam, type MemberFilter } from '#lib/catalog.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { notify } from '#lib/notifications.js';
  import { pushNow, sync } from '#lib/sync.svelte.js';
  import {
    displaySavedTeam,
    resolveCatalogTeam,
    SavedTeamError,
    savedTeamHeading,
  } from '#lib/team-collections.js';
  import {
    activeTeamKey,
    readSavedTeams,
    type SavedTeam,
  } from '#lib/workbench.js';

  let {
    collection,
    orderTeams,
    reorderTeams,
    useTeam,
    removeTeam,
    empty,
    busy = false,
    ready = $bindable(false),
    loaded = $bindable(false),
    storageError = $bindable(''),
    errorMessage = $bindable(''),
    inlineError = $bindable(false),
    importForm,
    shareRecovery,
  }: {
    collection: 'wishlist' | 'favorites';
    orderTeams: (teams: SavedTeam[]) => SavedTeam[];
    reorderTeams: (
      storage: Storage,
      orderedIds: string[],
      expectedIds: string[]
    ) => SavedTeam[] | null;
    useTeam: (storage: Storage, id: string) => SavedTeam;
    removeTeam: (storage: Storage, id: string) => void;
    empty: string;
    busy?: boolean;
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
  const pickerTeams = $derived(entries.map(displaySavedTeam));
  const visibleEntries = $derived(
    entries.filter((entry) => matchesTeam(entry, filters))
  );
  let pendingId = $state('');
  let listRegion = $state<HTMLDivElement>();
  let listScroll: { x: number; y: number } | null = null;
  let listOpener: HTMLElement | null = null;
  const label = $derived(collection === 'favorites' ? 'Favorites' : 'Wishlist');
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

  onMount(() => {
    ready = true;
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

  async function use(entry: SavedTeam) {
    if (pendingId) return;
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
          : `Could not move this team to My Teams. Check app storage access and available space. Your ${label} ${collection === 'favorites' ? 'were' : 'was'} not changed.`;
      pendingId = '';
      refresh();
      return;
    }
    void pushNow();
    try {
      localStorage.setItem(activeTeamKey, promoted.id);
    } catch {
      errorMessage =
        'Your team was saved, but the active team could not be remembered.';
      refresh();
      notify('Team moved to My Teams.');
      pendingId = '';
      return;
    }
    try {
      await goto(
        (resolve('my-teams') +
          '?team=' +
          encodeURIComponent(promoted.id)) as ResolvedPathname
      );
    } catch {
      errorMessage = errorMessage
        ? `${errorMessage} Could not open My Teams.`
        : 'Could not open My Teams. Your team was saved.';
      refresh();
    }
    notify('Team moved to My Teams.');
    pendingId = '';
  }

  async function remove(entry: SavedTeam) {
    if (pendingId) return;
    if (!confirm(`Remove “${entry.name}” from ${label}?`)) return;
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
    notify(`Removed from ${label}.`);
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
    const next = document.querySelectorAll<HTMLElement>('[data-wishlist-use]')[
      Math.min(index, visibleEntries.length - 1)
    ];
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
  <div bind:this={listRegion} hidden={selectedId !== null}>
    <h1 class="sr-only">{label}</h1>
    {@render importForm?.()}
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
          class="mt-5 flex items-baseline justify-between gap-3 border-b pb-1.5"
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
          {#if filters.length}
            <Button type="button" variant="quiet" onclick={() => (filters = [])}
              >Clear filters</Button
            >
          {/if}
        </div>
        {#if filters.length && entries.length > 1}
          <p class="provenance mt-2">Clear filters to reorder {label}.</p>
        {/if}
        {#if visibleEntries.length}
          <WishlistList
            {collection}
            entries={visibleEntries}
            disabled={!ready || !!pendingId || busy}
            sortable={filters.length === 0 && entries.length > 1}
            displayTeam={displaySavedTeam}
            onuse={use}
            onremove={remove}
            onreorder={reorder}
          />
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
        <WishlistTeamView
          {collection}
          entry={selectedEntry}
          match={resolveCatalogTeam(
            selectedEntry.original,
            catalogState.catalog.teams
          )}
          disabled={!ready || !!pendingId}
          onuse={() => use(selectedEntry)}
          onremove={() => remove(selectedEntry)}
        />
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
