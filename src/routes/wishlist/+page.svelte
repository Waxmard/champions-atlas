<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import SavedCollectionHeader from '$lib/components/SavedCollectionHeader.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { Team } from '$lib/catalog';
  import { pushNow, sync } from '$lib/sync.svelte';
  import {
    removeWishlistedTeam,
    SavedTeamError,
    useWishlistedTeam,
  } from '$lib/team-collections';
  import {
    activeTeamKey,
    readSavedTeams,
    storageKey,
    type SavedTeam,
  } from '$lib/workbench';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let entries = $state<SavedTeam[]>([]);
  let ready = $state(false),
    loaded = $state(false),
    storageError = $state(''),
    status = $state(''),
    pendingId = $state('');
  const catalogIds = $derived(
    new Set((data.catalog.teams as Team[]).map((team) => team.id))
  );

  function displayTeam(entry: SavedTeam): Team {
    return {
      sheetIds: [],
      creator: '',
      publishedAt: '',
      replicaCode: null,
      replicaStatus: '',
      reports: [],
      pasteNotes: null,
      ...entry.original,
      name: entry.name,
      members: entry.members,
    } as Team;
  }

  function refresh() {
    try {
      entries = readSavedTeams(localStorage).filter(
        (entry) => entry.collection === 'wishlist'
      );
      storageError = '';
    } catch {
      entries = [];
      storageError =
        'Saved teams could not be read. Check browser storage access. Existing data has been left untouched.';
    }
    loaded = true;
  }

  onMount(() => {
    ready = true;
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });

  $effect(() => {
    void sync.revision;
    if (ready) untrack(refresh);
  });

  async function use(entry: SavedTeam) {
    if (pendingId) return;
    pendingId = entry.id;
    status = '';
    let promoted: SavedTeam;
    try {
      promoted = useWishlistedTeam(localStorage, entry.id);
    } catch (error) {
      status =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not move this team to My teams. Check browser storage access and available space. Your Wishlist was not changed.';
      pendingId = '';
      refresh();
      return;
    }
    void pushNow();
    try {
      localStorage.setItem(activeTeamKey, promoted.id);
    } catch {
      status =
        'Your team was saved, but the active team could not be remembered.';
    }
    try {
      await goto(
        (resolve('/my-teams') +
          '?team=' +
          encodeURIComponent(promoted.id)) as ResolvedPathname
      );
    } catch {
      status = 'Could not open My teams. Your team was saved.';
      pendingId = '';
      refresh();
      return;
    }
    pendingId = '';
  }

  async function remove(entry: SavedTeam) {
    if (pendingId) return;
    if (!confirm(`Remove “${entry.name}” from Wishlist?`)) return;
    pendingId = entry.id;
    status = '';
    const index = entries.findIndex(({ id }) => id === entry.id);
    try {
      removeWishlistedTeam(localStorage, entry.id);
    } catch (error) {
      status =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not remove this team. Existing saved teams have been left untouched.';
      pendingId = '';
      refresh();
      return;
    }
    void pushNow();
    status = 'Removed from Wishlist.';
    refresh();
    pendingId = '';
    await tick();
    const next = document.querySelectorAll<HTMLElement>('[data-wishlist-use]')[
      Math.min(index, entries.length - 1)
    ];
    (
      next ?? document.querySelector<HTMLElement>('nav[aria-label="Main"] a')
    )?.focus();
  }
</script>

<svelte:head><title>Wishlist — Champion's Atlas</title></svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  <SavedCollectionHeader
    collection="wishlist"
    title="Wishlist"
    description="Teams to try later. Use a team to move it to My teams."
  />
  <p
    role="status"
    aria-live="polite"
    class="mt-4 min-h-6 text-[0.9375rem] text-base-content/70"
  >
    {status}
  </p>
  {#if storageError}<p
      role="alert"
      class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {storageError}
    </p>{/if}
  {#if !loaded}<p class="mt-6 text-[0.9375rem] text-base-content/70">
      Loading Wishlist…
    </p>
  {:else if !storageError}
    {#if entries.length}
      <ul class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each entries as entry (entry.id)}
          {@const available = catalogIds.has(entry.original.id)}
          <li class="min-w-0">
            <TeamCard
              team={displayTeam(entry)}
              currentRegulation={data.catalog.currentRegulation}
              showRegulation
              query=""
              detailAvailable={available}
            >
              {#snippet actions()}
                <Button
                  data-wishlist-use
                  variant="primary"
                  disabled={!ready || !!pendingId}
                  onclick={() => use(entry)}>Use this team</Button
                >
                <Button
                  variant="quiet"
                  size="icon-compact"
                  class="text-base-content/60 hover:bg-error hover:text-error-content focus-visible:bg-error focus-visible:text-error-content"
                  aria-label="Remove from Wishlist"
                  title="Remove from Wishlist"
                  disabled={!ready || !!pendingId}
                  onclick={() => remove(entry)}
                >
                  <Trash2 class="size-4" aria-hidden="true" />
                </Button>
              {/snippet}
            </TeamCard>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="plate mt-2 max-w-xl px-4 py-3 text-[0.9375rem] leading-relaxed">
        No teams in Wishlist yet. Choose Wishlist on a team in Browse.
      </p>
    {/if}
  {/if}
</main>
