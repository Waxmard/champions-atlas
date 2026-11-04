<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import { page } from '$app/state';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import TeamCard from '#lib/components/TeamCard.svelte';
  import WishlistTeamView from '#lib/components/WishlistTeamView.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { Team } from '#lib/catalog.js';
  import { canonicalPokepasteUrl, loadPokepaste } from '#lib/pokepaste.js';
  import { syncOwnerKey } from '#lib/storage-migration.js';
  import { AtlasNative, isNativeApp } from '#lib/native.js';
  import { notify } from '#lib/notifications.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { SAVE_FAILURE } from '#lib/saved-team-actions.js';
  import { pushNow, sync } from '#lib/sync.svelte.js';
  import {
    addCatalogToWishlist,
    addPokepasteToWishlist,
    removeWishlistedTeam,
    resolveCatalogTeam,
    SavedTeamError,
    useWishlistedTeam,
    wishlistedCatalogEntries,
  } from '#lib/team-collections.js';
  import {
    activeTeamKey,
    readSavedTeams,
    type SavedTeam,
  } from '#lib/workbench.js';
  let entries = $state<SavedTeam[]>([]);
  let ready = $state(false),
    loaded = $state(false),
    storageError = $state(''),
    errorMessage = $state(''),
    pendingId = $state('');
  let pasteLink = $state(''),
    importPending = $state(false),
    invalidLink = $state(false),
    importInput = $state<HTMLInputElement | null>(null);
  let mounted = false;
  let importController: AbortController | null = null;
  let queuePending = $state(false);
  let queueError = $state('');
  let blockedShare = $state<{ id: string; url: string } | null>(null);
  let listRegion = $state<HTMLDivElement>();
  let listScroll: { x: number; y: number } | null = null;
  let listOpener: HTMLElement | null = null;
  const selectedId = $derived(page.url.searchParams.get('team'));
  const selectedEntry = $derived(
    entries.find((entry) => entry.id === selectedId)
  );

  beforeNavigate(({ from, to }) => {
    if (
      from?.route.id !== '/wishlist' ||
      to?.route.id !== '/wishlist' ||
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
      from?.route.id !== '/wishlist' ||
      to?.route.id !== '/wishlist' ||
      !from.url.searchParams.has('team') ||
      to.url.searchParams.has('team') ||
      !listScroll
    )
      return;
    const position = listScroll;
    void tick().then(() => {
      if (page.route.id !== '/wishlist' || page.url.searchParams.has('team'))
        return;
      if (listOpener?.isConnected) listOpener.focus({ preventScroll: true });
      window.scrollTo({
        left: position.x,
        top: position.y,
        behavior: 'instant',
      });
      requestAnimationFrame(() => {
        window.scrollTo({
          left: position.x,
          top: position.y,
          behavior: 'instant',
        });
      });
    });
  });

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
      entries = readSavedTeams(localStorage)
        .filter((entry) => entry.collection === 'wishlist')
        .reverse();
      storageError = '';
    } catch {
      entries = [];
      storageError =
        'Saved teams could not be read. Check app storage access. Existing data has been left untouched.';
    }
    loaded = true;
  }

  onMount(() => {
    mounted = true;
    ready = true;
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void processShares(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibility);
      importController?.abort();
    };
  });

  $effect(() => {
    void sync.revision;
    if (ready) untrack(refresh);
  });

  $effect(() => {
    if (
      ready &&
      loaded &&
      !storageError &&
      (!sync.configured || sync.authResolved)
    ) {
      void sync.user;
      untrack(() => void processShares(false));
    }
  });

  $effect(() => {
    if (ready && page.url.hash === '#import-pokepaste') {
      untrack(() => {
        void tick().then(() => importInput?.focus());
      });
    }
  });

  async function closeImport() {
    await goto(resolve('wishlist'), { replace: true, reset: false });
    await tick();
    document.getElementById('wishlist-actions')?.focus();
  }

  function submitPokepaste(event: SubmitEvent) {
    event.preventDefault();
    if (queuePending) return;
    importInput?.focus();
    void importPokepaste(pasteLink).finally(() => void processShares(false));
  }

  async function importPokepaste(input: string): Promise<boolean> {
    if (
      !ready ||
      storageError ||
      importPending ||
      (sync.configured && (!sync.authResolved || !sync.user))
    )
      return false;
    errorMessage = '';
    invalidLink = false;

    let url: string;
    try {
      url = canonicalPokepasteUrl(input);
    } catch (error) {
      invalidLink = true;
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Enter a Poképaste link or 16-character paste ID.';
      return false;
    }

    let owner: string | null;
    let userId: string | undefined;
    try {
      const saved = readSavedTeams(localStorage);
      userId = sync.user?.uid;
      owner = localStorage.getItem(syncOwnerKey);
      if (
        userId &&
        owner !== `${import.meta.env.VITE_FIREBASE_PROJECT_ID}:${userId}`
      ) {
        errorMessage = 'Account changed. Import the Poképaste again.';
        return false;
      }
      if (
        saved.some(
          (entry) =>
            entry.collection === 'wishlist' && entry.original.pasteUrl === url
        )
      ) {
        refresh();
        notify('Already in Wishlist.');
        return true;
      }
      if (
        catalogState.catalog.teams.filter((team) => team.pasteUrl === url)
          .length > 1
      )
        throw new SavedTeamError(
          'Multiple catalog teams use this Poképaste. Open the team from Browse instead.'
        );
      const catalogTeam = resolveCatalogTeam(
        { pasteUrl: url },
        catalogState.catalog.teams
      );
      if (catalogTeam) {
        const alreadySaved =
          wishlistedCatalogEntries(saved, catalogTeam).length > 0;
        if (!alreadySaved) {
          addCatalogToWishlist(localStorage, catalogTeam);
          void pushNow();
        }
        refresh();
        notify(alreadySaved ? 'Already in Wishlist.' : 'Added to Wishlist.');
        return true;
      }
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError ? error.message : SAVE_FAILURE;
      refresh();
      return false;
    }

    const controller = new AbortController();
    importController = controller;
    importPending = true;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    try {
      const payload = await loadPokepaste(url, fetch, controller.signal);
      if (!mounted || (controller.signal.aborted && !timedOut)) return false;
      if (timedOut) {
        errorMessage = 'Poképaste request timed out. Try again.';
        return false;
      }
      try {
        if (
          (sync.configured && (!sync.authResolved || !sync.user)) ||
          sync.user?.uid !== userId ||
          localStorage.getItem(syncOwnerKey) !== owner
        ) {
          errorMessage = 'Account changed. Import the Poképaste again.';
          return false;
        }
        addPokepasteToWishlist(
          localStorage,
          payload,
          catalogState.catalog.currentRegulation,
          catalogState.catalog.teams
        );
        void pushNow();
        refresh();
        notify('Added to Wishlist.');
        return true;
      } catch (error) {
        errorMessage =
          error instanceof SavedTeamError ? error.message : SAVE_FAILURE;
        refresh();
        return false;
      }
    } catch (error) {
      if (!mounted) return false;
      errorMessage = timedOut
        ? 'Poképaste request timed out. Try again.'
        : error instanceof TypeError
          ? 'Could not load this Poképaste. Check your connection and try again.'
          : error instanceof Error
            ? `${error.message.replace(/[.!?]$/, '')}. Check the link or paste and try again.`
            : 'Could not load this Poképaste. Try again.';
      return false;
    } finally {
      window.clearTimeout(timer);
      if (importController === controller) importController = null;
      if (mounted) importPending = false;
    }
  }

  function canProcessShares() {
    return (
      mounted &&
      ready &&
      loaded &&
      !storageError &&
      (!sync.configured || (sync.authResolved && !!sync.user))
    );
  }

  async function processShares(retry: boolean) {
    if (
      !isNativeApp ||
      !canProcessShares() ||
      queuePending ||
      importPending ||
      (blockedShare && !retry) ||
      (queueError && !retry)
    )
      return;
    queuePending = true;
    try {
      const { shares } = await AtlasNative.getPendingShares();
      if (!mounted) return;
      queueError = '';
      blockedShare = null;
      for (const share of shares) {
        if (!canProcessShares()) return;
        blockedShare = share;
        const userId = sync.user?.uid;
        let owner: string | null;
        try {
          owner = localStorage.getItem(syncOwnerKey);
        } catch {
          errorMessage = 'Could not read account storage. Try again.';
          return;
        }
        const imported = await importPokepaste(share.url);
        invalidLink = false;
        if (!imported || !canProcessShares()) return;
        try {
          if (
            sync.user?.uid !== userId ||
            localStorage.getItem(syncOwnerKey) !== owner
          ) {
            errorMessage = 'Account changed. Import the Poképaste again.';
            return;
          }
          await AtlasNative.acknowledgeShare({ id: share.id });
        } catch {
          queueError = 'Shared links could not be updated. Try again.';
          return;
        }
        if (!mounted) return;
        blockedShare = null;
      }
    } catch {
      if (mounted) queueError = 'Shared links could not be read. Try again.';
    } finally {
      if (mounted) queuePending = false;
    }
  }

  async function dismissShare() {
    if (!blockedShare || !canProcessShares() || queuePending || importPending)
      return;
    queuePending = true;
    try {
      await AtlasNative.acknowledgeShare({ id: blockedShare.id });
      if (!mounted) return;
      blockedShare = null;
      queueError = '';
      errorMessage = '';
    } catch {
      if (mounted) queueError = 'Shared links could not be updated. Try again.';
      return;
    } finally {
      if (mounted) queuePending = false;
    }
    void processShares(false);
  }

  async function use(entry: SavedTeam) {
    if (pendingId) return;
    pendingId = entry.id;
    errorMessage = '';
    invalidLink = false;
    let promoted: SavedTeam;
    try {
      promoted = useWishlistedTeam(localStorage, entry.id);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not move this team to My Teams. Check app storage access and available space. Your Wishlist was not changed.';
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
    if (!confirm(`Remove “${entry.name}” from Wishlist?`)) return;
    pendingId = entry.id;
    errorMessage = '';
    invalidLink = false;
    const index = entries.findIndex(({ id }) => id === entry.id);
    const wasSelected = selectedId === entry.id;
    try {
      removeWishlistedTeam(localStorage, entry.id);
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
    notify('Removed from Wishlist.');
    refresh();
    pendingId = '';
    if (wasSelected) {
      try {
        await goto(resolve('wishlist'));
      } catch {
        errorMessage = 'Team removed, but Wishlist could not be opened.';
        return;
      }
    }
    await tick();
    const next = document.querySelectorAll<HTMLElement>('[data-wishlist-use]')[
      Math.min(index, entries.length - 1)
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
    >{selectedEntry ? `${selectedEntry.name} — Wishlist` : 'Wishlist'} — Champion's
    Atlas</title
  >
</svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 pt-2 pb-8 sm:px-8 sm:pb-12">
  <div bind:this={listRegion} hidden={selectedId !== null}>
    <h1 class="sr-only">Wishlist</h1>
    {#if page.url.hash === '#import-pokepaste'}
      <section
        id="import-pokepaste"
        aria-label="Add a Poképaste"
        class="max-w-3xl"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">Add a Poképaste</h2>
          <Button
            variant="quiet"
            disabled={importPending || queuePending}
            onclick={closeImport}>Close import</Button
          >
        </div>
        <p id="wishlist-share-hint" class="provenance mt-2">
          From a Poképaste page, use Share → Champion’s Atlas, then open Atlas
          to finish importing.
        </p>
        <form
          aria-label="Import Poképaste"
          class="mt-2"
          novalidate
          onsubmit={submitPokepaste}
        >
          <label for="pokepaste-link" class="term block"
            >Poképaste link or ID</label
          >
          <input
            id="pokepaste-link"
            name="pokepaste"
            type="text"
            inputmode="url"
            class="input mt-2 min-h-11 w-full"
            required
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            aria-invalid={invalidLink || undefined}
            aria-describedby={invalidLink
              ? 'wishlist-help wishlist-error'
              : 'wishlist-help'}
            disabled={!ready}
            readonly={importPending || queuePending}
            bind:this={importInput}
            bind:value={pasteLink}
            oninput={() => {
              if (invalidLink) {
                invalidLink = false;
                errorMessage = '';
              }
            }}
          />
          <p id="wishlist-help" class="provenance mt-2">
            Paste a pokepast.es link or its 16-character ID.
          </p>
          {#if invalidLink && errorMessage}
            <p
              id="wishlist-error"
              role="alert"
              class="mt-2 text-sm text-error-content"
            >
              {errorMessage}
            </p>
          {/if}
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              aria-busy={importPending}
              disabled={!ready ||
                !!storageError ||
                importPending ||
                queuePending}>Import to Wishlist</Button
            >
            {#if importPending}
              <p role="status" class="provenance">Loading Poképaste…</p>
            {/if}
            <p class="provenance">Legality remains unverified.</p>
          </div>
        </form>
      </section>
    {/if}
    {#if !invalidLink && errorMessage}
      <p
        role="alert"
        class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
        style="color: var(--color-error-content)"
      >
        {errorMessage}
      </p>
    {/if}
    {#if storageError}<p
        role="alert"
        class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
        style="color: var(--color-error-content)"
      >
        {storageError}
      </p>{/if}
    {#if queueError}
      <div role="alert" class="plate mt-2 max-w-[68ch] px-4 py-3">
        {queueError}
        {#if !blockedShare}
          <Button
            variant="quiet"
            disabled={queuePending || importPending}
            onclick={() => processShares(true)}
          >
            Try again
          </Button>
        {/if}
      </div>
    {/if}
    {#if blockedShare}
      <div class="plate mt-2 max-w-[68ch] px-4 py-3">
        <p>Shared link: {blockedShare.url}</p>
        <p>Dismissing removes the pending link, not a saved team.</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button
            variant="quiet"
            disabled={queuePending || importPending || !canProcessShares()}
            onclick={() => processShares(true)}
          >
            Retry
          </Button>
          <Button
            variant="quiet"
            disabled={queuePending || importPending || !canProcessShares()}
            onclick={dismissShare}
          >
            Dismiss shared link
          </Button>
        </div>
      </div>
    {/if}
    {#if !loaded}<p class="mt-6 text-[0.9375rem] text-base-content/70">
        Loading Wishlist…
      </p>
    {:else if !storageError}
      {#if entries.length}
        <ul class="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {#each entries as entry (entry.id)}
            <li class="min-w-0">
              <TeamCard
                team={displayTeam(entry)}
                showRegulation
                query=""
                href={`wishlist?team=${encodeURIComponent(entry.id)}`}
                fromCatalog={false}
              >
                {#snippet actions()}
                  <Button
                    data-wishlist-use
                    variant="quiet"
                    disabled={!ready || !!pendingId}
                    onclick={() => use(entry)}
                  >
                    <ArrowRight class="size-4" aria-hidden="true" />
                    <span>My Teams</span>
                  </Button>
                  <Button
                    variant="quiet"
                    size="icon-compact"
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
        <p
          class="plate mt-2 max-w-xl px-4 py-3 text-[0.9375rem] leading-relaxed"
        >
          No teams in Wishlist yet. Share a Poképaste or choose Wishlist on a
          team in Browse.
        </p>
      {/if}
    {/if}
  </div>
  {#if selectedId !== null}
    {#if !loaded || storageError || !selectedEntry}
      <h1 class="sr-only">Wishlist</h1>
    {/if}
    <div
      class="sticky top-[var(--app-header-height,0px)] z-30 -mx-4 border-b border-base-300 bg-base-200 px-4 py-1 sm:-mx-8 sm:px-8"
    >
      <a
        href={resolve('wishlist')}
        class="provenance inline-flex min-h-11 items-center gap-2 text-[0.8125rem] outline-none hover:text-base-content focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />
        Back to Wishlist
      </a>
    </div>
    {#if !invalidLink && errorMessage}
      <p
        role="alert"
        class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
        style="color: var(--color-error-content)"
      >
        {errorMessage}
      </p>
    {/if}
    {#if !loaded}
      <p class="mt-6 text-[0.9375rem] text-base-content/70">
        Loading Wishlist…
      </p>
    {:else if storageError}
      <p
        role="alert"
        class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
        style="color: var(--color-error-content)"
      >
        {storageError}
      </p>
    {:else if selectedEntry}
      {#key selectedEntry.id}
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
      {/key}
    {:else}
      <div class="plate mt-6 max-w-xl px-4 py-3">
        <p role="status" class="text-[0.9375rem] leading-relaxed">
          This team is no longer in Wishlist.
        </p>
        <div class="mt-3">
          <Button href={resolve('wishlist')} variant="quiet" class="min-h-11">
            Back to Wishlist
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</main>
