<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { ResolvedPathname } from '$app/types';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import SavedCollectionHeader from '#lib/components/SavedCollectionHeader.svelte';
  import TeamCard from '#lib/components/TeamCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { Team } from '#lib/catalog.js';
  import { canonicalPokepasteUrl, loadPokepaste } from '#lib/pokepaste.js';
  import { syncOwnerKey } from '#lib/storage-migration.js';
  import { AtlasNative, isNativeApp } from '#lib/native.js';
  import { pushNow, sync } from '#lib/sync.svelte.js';
  import {
    addCatalogToWishlist,
    addPokepasteToWishlist,
    removeWishlistedTeam,
    SavedTeamError,
    useWishlistedTeam,
    wishlistedCatalogEntries,
  } from '#lib/team-collections.js';
  import {
    activeTeamKey,
    readSavedTeams,
    type SavedTeam,
  } from '#lib/workbench.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let entries = $state<SavedTeam[]>([]);
  let ready = $state(false),
    loaded = $state(false),
    storageError = $state(''),
    status = $state(''),
    errorMessage = $state(''),
    pendingId = $state('');
  let feedbackDismissed = $state(false);
  let pasteLink = $state(''),
    importPending = $state(false),
    invalidLink = $state(false),
    importInput = $state<HTMLInputElement | null>(null);
  let mounted = false;
  let importController: AbortController | null = null;
  let queuePending = $state(false);
  let queueError = $state('');
  let blockedShare = $state<{ id: string; url: string } | null>(null);
  const catalogIds = $derived(
    new Set(data.catalog.teams.map((team) => team.id))
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

  afterNavigate(() => {
    if (!page.state.movedToWishlist) return;
    feedbackDismissed = false;
    status = 'Team moved to Wishlist.';
    if (page.state.movedToWishlist === 'active-failed')
      errorMessage =
        'Team moved to Wishlist, but the active team could not be remembered.';
    replaceState(
      resolve(`/wishlist?${page.url.searchParams.toString()}${page.url.hash}`),
      {
        ...page.state,
        movedToWishlist: undefined,
      }
    );
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
    feedbackDismissed = false;
    status = errorMessage = '';
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
      const catalogTeam = data.catalog.teams.find(
        (team) => team.pasteUrl === url
      );
      if (
        saved.some(
          (entry) =>
            entry.collection === 'wishlist' && entry.original.pasteUrl === url
        ) ||
        (catalogTeam && wishlistedCatalogEntries(saved, catalogTeam).length > 0)
      ) {
        refresh();
        status = 'Already in Wishlist.';
        return true;
      }
      if (catalogTeam) {
        addCatalogToWishlist(localStorage, catalogTeam);
        void pushNow();
        refresh();
        status = 'Added to Wishlist.';
        return true;
      }
    } catch {
      errorMessage =
        'Could not save this team. Check app storage access and available space. Existing saved teams were not replaced.';
      refresh();
      return false;
    }

    const controller = new AbortController();
    importController = controller;
    importPending = true;
    status = 'Loading Poképaste…';
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    try {
      const payload = await loadPokepaste(url, fetch, controller.signal);
      if (!mounted || (controller.signal.aborted && !timedOut)) return false;
      if (timedOut) {
        status = '';
        errorMessage = 'Poképaste request timed out. Try again.';
        return false;
      }
      try {
        if (
          (sync.configured && (!sync.authResolved || !sync.user)) ||
          sync.user?.uid !== userId ||
          localStorage.getItem(syncOwnerKey) !== owner
        ) {
          status = '';
          errorMessage = 'Account changed. Import the Poképaste again.';
          return false;
        }
        addPokepasteToWishlist(
          localStorage,
          payload,
          data.catalog.currentRegulation,
          data.catalog.teams
        );
        void pushNow();
        refresh();
        status = 'Added to Wishlist.';
        return true;
      } catch {
        status = '';
        errorMessage =
          'Could not save this team. Check app storage access and available space. Existing saved teams were not replaced.';
        refresh();
        return false;
      }
    } catch (error) {
      if (!mounted) return false;
      status = '';
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

  async function processShares(retry: boolean, explicit = false) {
    if (
      !isNativeApp ||
      !canProcessShares() ||
      queuePending ||
      importPending ||
      (blockedShare && !retry) ||
      (queueError && !retry)
    )
      return;
    if (explicit) feedbackDismissed = false;
    queuePending = true;
    try {
      const { shares } = await AtlasNative.getPendingShares();
      if (!mounted) return;
      queueError = '';
      blockedShare = null;
      for (const share of shares) {
        if (!canProcessShares()) return;
        blockedShare = share;
        feedbackDismissed = false;
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
    feedbackDismissed = false;
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
    feedbackDismissed = false;
    pendingId = entry.id;
    status = errorMessage = '';
    let promoted: SavedTeam;
    try {
      promoted = useWishlistedTeam(localStorage, entry.id);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError
          ? error.message
          : 'Could not move this team to My teams. Check app storage access and available space. Your Wishlist was not changed.';
      pendingId = '';
      refresh();
      return;
    }
    void pushNow();
    status = 'Team moved to My teams.';
    try {
      localStorage.setItem(activeTeamKey, promoted.id);
    } catch {
      errorMessage =
        'Your team was saved, but the active team could not be remembered.';
    }
    try {
      await goto(
        (resolve('my-teams') +
          '?team=' +
          encodeURIComponent(promoted.id)) as ResolvedPathname
      );
    } catch {
      errorMessage = errorMessage
        ? `${errorMessage} Could not open My teams.`
        : 'Could not open My teams. Your team was saved.';
      pendingId = '';
      refresh();
      return;
    }
    pendingId = '';
  }

  async function remove(entry: SavedTeam) {
    if (pendingId) return;
    if (!confirm(`Remove “${entry.name}” from Wishlist?`)) return;
    feedbackDismissed = false;
    pendingId = entry.id;
    status = errorMessage = '';
    const index = entries.findIndex(({ id }) => id === entry.id);
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
    description="Teams to try later. Move a team to My teams when you're ready."
  />
  <p class="mt-3 text-[0.9375rem] text-base-content/70">
    From a Poképaste page, use Share → Champion’s Atlas, then open Atlas to
    finish importing.
  </p>
  <details class="mt-1 max-w-3xl">
    <summary
      class="min-h-11 cursor-pointer py-2 text-sm font-normal text-base-content/60"
    >
      Add a Poképaste manually
    </summary>
    <form
      aria-label="Import Poképaste"
      aria-busy={importPending}
      novalidate
      onsubmit={submitPokepaste}
    >
      <label for="pokepaste-link" class="term block">Poképaste link or ID</label
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
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={!ready || !!storageError || importPending || queuePending}
          >Import to Wishlist</Button
        >
        <p class="provenance">Legality remains unverified.</p>
      </div>
    </form>
  </details>
  {#if invalidLink && errorMessage}
    <span id="wishlist-error" class="sr-only">{errorMessage}</span>
  {/if}
  {#if storageError}<p
      role="alert"
      class="plate mt-2 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {storageError}
    </p>{/if}
  {#if !feedbackDismissed && (status || errorMessage)}
    <section
      aria-label="Wishlist notification"
      class="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] z-40 ms-auto flex max-w-md items-center gap-2 rounded-box border bg-base-100 p-3 shadow-lg {errorMessage
        ? 'border-error-content text-error-content'
        : status === 'Already in Wishlist.'
          ? 'border-warning-content text-warning-content'
          : status === 'Loading Poképaste…'
            ? 'border-base-300 text-base-content'
            : 'border-success-content text-success-content'}"
    >
      <div
        role={errorMessage ? 'alert' : 'status'}
        aria-live={errorMessage ? undefined : 'polite'}
        class="min-w-0 flex-1 text-sm break-words"
      >
        {#if errorMessage}<p>{errorMessage}</p>{/if}
        {#if status}<p>{status}</p>{/if}
      </div>
      <Button
        variant="quiet"
        size="icon-touch"
        class="shrink-0"
        aria-label="Dismiss notification"
        onclick={() => (feedbackDismissed = true)}
      >
        <X class="size-4" aria-hidden="true" />
      </Button>
    </section>
  {/if}
  {#if queueError}
    <div role="alert" class="plate mt-2 max-w-[68ch] px-4 py-3">
      {queueError}
      {#if !blockedShare}
        <Button
          variant="quiet"
          disabled={queuePending || importPending}
          onclick={() => processShares(true, true)}
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
          onclick={() => processShares(true, true)}
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
                  onclick={() => use(entry)}>Move to My teams</Button
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
        No teams in Wishlist yet. Share a Poképaste or choose Wishlist on a team
        in Browse.
      </p>
    {/if}
  {/if}
</main>
