<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import CollectionPage from '#lib/components/CollectionPage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
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
    orderedWishlist,
    reorderWishlist,
    removeWishlistedTeam,
    resolveCatalogTeam,
    SavedTeamError,
    useWishlistedTeam,
    wishlistedCatalogEntries,
  } from '#lib/team-collections.js';
  import { readSavedTeams } from '#lib/workbench.js';
  let collectionPage = $state<CollectionPage>();
  let ready = $state(false),
    loaded = $state(false),
    storageError = $state(''),
    errorMessage = $state('');
  let pasteLink = $state(''),
    importPending = $state(false),
    invalidLink = $state(false),
    importInput = $state<HTMLInputElement | null>(null);
  let mounted = false;
  let importController: AbortController | null = null;
  let queuePending = $state(false);
  let queueError = $state('');
  let blockedShare = $state<{ id: string; url: string } | null>(null);
  const refresh = () => collectionPage?.refresh();

  onMount(() => {
    mounted = true;
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
</script>

{#snippet shareRecovery()}
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
{/snippet}
{#snippet importForm()}
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
        From a Poképaste page, use Share → Champion’s Atlas, then open Atlas to
        finish importing.
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
            disabled={!ready || !!storageError || importPending || queuePending}
            >Import to Wishlist</Button
          >
          {#if importPending}
            <p role="status" class="provenance">Loading Poképaste…</p>
          {/if}
          <p class="provenance">Legality remains unverified.</p>
        </div>
      </form>
    </section>
  {/if}
{/snippet}
<CollectionPage
  bind:this={collectionPage}
  bind:ready
  bind:loaded
  bind:storageError
  bind:errorMessage
  bind:inlineError={invalidLink}
  collection="wishlist"
  orderTeams={orderedWishlist}
  reorderTeams={reorderWishlist}
  useTeam={useWishlistedTeam}
  removeTeam={removeWishlistedTeam}
  busy={importPending || queuePending}
  empty="No teams in Wishlist yet. Share a Poképaste or choose Wishlist on a team in Browse."
  {importForm}
  {shareRecovery}
/>
