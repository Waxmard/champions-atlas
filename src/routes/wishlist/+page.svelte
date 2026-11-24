<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import { page } from '$app/state';
  import CollectionPage from '#lib/components/CollectionPage.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    canonicalPokepasteUrl,
    loadPokepaste,
    PokepasteUnavailableError,
    type PokepastePayload,
  } from '#lib/pokepaste.js';
  import { syncOwnerKey } from '#lib/storage-migration.js';
  import { later } from '#lib/timers.js';
  import { AtlasNative, isNativeApp } from '#lib/native.js';
  import { notify } from '#lib/notifications.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { youtubeVideoId, type Report, type Team } from '#lib/catalog.js';
  import {
    youtubeShareOptions,
    YoutubeUnavailableError,
    type ShareOption,
  } from '#lib/youtube-share.js';
  import { SAVE_FAILURE } from '#lib/saved-team-actions.js';
  import { pushNow, sync } from '#lib/sync.svelte.js';
  import {
    addCatalogToWishlist,
    addPokepasteToWishlist,
    orderedWishlist,
    reorderWishlist,
    removeWishlistedTeam,
    resolveCatalogTeam,
    savedFormat,
    SavedTeamError,
    useWishlistedTeam,
    wishlistedCatalogEntries,
  } from '#lib/team-collections.js';
  import { readSavedTeams, type SavedTeam } from '#lib/workbench.js';
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
  let pickOptions = $state.raw<ShareOption[]>([]);
  let picked = $state<boolean[]>([]);
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

  async function importPokepaste(
    input: string,
    preloaded?: PokepastePayload
  ): Promise<SavedTeam | null> {
    if (
      !ready ||
      storageError ||
      importPending ||
      (sync.configured && (!sync.authResolved || !sync.user))
    )
      return null;
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
      return null;
    }

    let owner: string | null;
    let userId: string | undefined;
    try {
      const saved = readSavedTeams(localStorage);
      userId = sync.user?.uid;
      owner = localStorage.getItem(syncOwnerKey);
      if (accountChanged(userId, owner)) {
        errorMessage = 'Account changed. Import the Poképaste again.';
        return null;
      }
      const existing = saved.find(
        (entry) =>
          entry.collection === 'wishlist' &&
          savedFormat(entry) === catalogState.format &&
          entry.original.pasteUrl === url
      );
      if (existing) {
        refresh();
        notify('Already in Wishlist.');
        return existing;
      }
      const catalogTeam = resolveCatalogTeam(
        { pasteUrl: url },
        catalogState.catalog.teams
      );
      if (catalogTeam) return bookmarkCatalogTeam(saved, catalogTeam);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError ? error.message : SAVE_FAILURE;
      refresh();
      return null;
    }

    const controller = new AbortController();
    importController = controller;
    importPending = true;
    let timedOut = false;
    const cancelTimeout = later(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    try {
      const payload =
        preloaded ?? (await loadPokepaste(url, fetch, controller.signal));
      if (!mounted || (controller.signal.aborted && !timedOut)) return null;
      if (timedOut) {
        errorMessage = 'Poképaste request timed out. Try again.';
        return null;
      }
      try {
        if (
          (sync.configured && (!sync.authResolved || !sync.user)) ||
          sync.user?.uid !== userId ||
          localStorage.getItem(syncOwnerKey) !== owner
        ) {
          errorMessage = 'Account changed. Import the Poképaste again.';
          return null;
        }
        const entry = addPokepasteToWishlist(
          localStorage,
          payload,
          catalogState.catalog.currentRegulation,
          catalogState.catalog.teams,
          catalogState.format
        );
        void pushNow();
        refresh();
        notify('Added to Wishlist.');
        return entry;
      } catch (error) {
        errorMessage =
          error instanceof SavedTeamError ? error.message : SAVE_FAILURE;
        refresh();
        return null;
      }
    } catch (error) {
      if (!mounted) return null;
      errorMessage = timedOut
        ? 'Poképaste request timed out. Try again.'
        : error instanceof TypeError
          ? 'Could not load this Poképaste. Check your connection and try again.'
          : error instanceof PokepasteUnavailableError
            ? 'Could not load this Poképaste. Check the link and try again.'
            : error instanceof Error
              ? `${error.message.replace(/[.!?]$/, '')}. Check the link or paste and try again.`
              : 'Could not load this Poképaste. Try again.';
      return null;
    } finally {
      cancelTimeout();
      if (importController === controller) importController = null;
      if (mounted) importPending = false;
    }
  }

  function bookmarkCatalogTeam(
    saved: SavedTeam[],
    team: Team,
    video?: Report
  ): SavedTeam {
    const existing = wishlistedCatalogEntries(saved, team)[0];
    const entry = addCatalogToWishlist(localStorage, team, video);
    if (
      !existing ||
      entry.original.reports?.length !== existing.original.reports?.length
    )
      void pushNow();
    refresh();
    notify(existing ? 'Already in Wishlist.' : 'Added to Wishlist.');
    return entry;
  }

  async function videoOptions(id: string): Promise<ShareOption[] | null> {
    errorMessage = '';
    importPending = true;
    try {
      const options = await youtubeShareOptions(id, catalogState.catalog.teams);
      if (!mounted) return null;
      if (options.length === 1 && 'error' in options[0])
        errorMessage = options[0].detail;
      else if (options.length) return options;
      else
        errorMessage =
          "No Poképaste link was found in this video's description.";
    } catch (error) {
      if (mounted)
        errorMessage =
          error instanceof YoutubeUnavailableError
            ? 'Could not read this video. Try again later.'
            : 'Could not read this video. Check your connection and try again.';
    } finally {
      if (mounted) importPending = false;
    }
    return null;
  }

  function accountChanged(userId: string | undefined, owner: string | null) {
    return (
      !!userId &&
      owner !== `${import.meta.env.VITE_FIREBASE_PROJECT_ID}:${userId}`
    );
  }

  async function importOption(option: ShareOption): Promise<SavedTeam | null> {
    if ('error' in option) return null;
    if ('payload' in option)
      return importPokepaste(option.payload.url, option.payload);
    if (!canProcessShares() || importPending) return null;
    errorMessage = '';
    try {
      const saved = readSavedTeams(localStorage);
      if (accountChanged(sync.user?.uid, localStorage.getItem(syncOwnerKey))) {
        errorMessage = 'Account changed. Share the video again.';
        return null;
      }
      return bookmarkCatalogTeam(saved, option.team, option.report);
    } catch (error) {
      errorMessage =
        error instanceof SavedTeamError ? error.message : SAVE_FAILURE;
      refresh();
      return null;
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

  async function processShares(retry: boolean, last: SavedTeam | null = null) {
    if (
      !isNativeApp ||
      !canProcessShares() ||
      queuePending ||
      importPending ||
      pickOptions.length > 0 ||
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
        let imported: SavedTeam | null;
        const videoId = youtubeVideoId(share.url);
        if (videoId) {
          const options = await videoOptions(videoId);
          if (!options || !canProcessShares()) return;
          if (options.length > 1) {
            picked = options.map(() => false);
            pickOptions = options;
            return;
          }
          imported = await importOption(options[0]);
        } else imported = await importPokepaste(share.url);
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
        last = imported;
      }
      if (last)
        await goto(
          (resolve('wishlist') +
            '?team=' +
            encodeURIComponent(last.id)) as ResolvedPathname
        ).catch(() => {});
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
      pickOptions = [];
      picked = [];
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

  async function addPicked(event: SubmitEvent) {
    event.preventDefault();
    const share = blockedShare;
    if (!share || !canProcessShares() || queuePending || importPending) return;
    const added: SavedTeam[] = [];
    for (const option of pickOptions.filter((_, index) => picked[index])) {
      const entry = await importOption(option);
      if (!entry) return;
      added.push(entry);
    }
    queuePending = true;
    try {
      await AtlasNative.acknowledgeShare({ id: share.id });
    } catch {
      if (mounted) queueError = 'Shared links could not be updated. Try again.';
      return;
    } finally {
      if (mounted) queuePending = false;
    }
    if (!mounted) return;
    pickOptions = [];
    picked = [];
    blockedShare = null;
    queueError = '';
    void processShares(false, added.length === 1 ? added[0] : null);
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
  {#if blockedShare && pickOptions.length}
    <form
      aria-label="Teams in shared video"
      class="plate mt-2 max-w-[68ch] px-4 py-3"
      onsubmit={addPicked}
    >
      <p class="font-semibold">
        This video has {pickOptions.length} teams. Choose which to add to Wishlist.
      </p>
      {#each pickOptions as option, index (index)}
        <label class="flex min-h-11 cursor-pointer items-center gap-3 py-1">
          <input
            type="checkbox"
            class="size-5 shrink-0 accent-primary"
            disabled={queuePending || importPending || 'error' in option}
            bind:checked={picked[index]}
          />
          <span class="min-w-0">
            <span class="block font-semibold wrap-anywhere">{option.label}</span
            >
            <span class="provenance block wrap-anywhere">{option.detail}</span>
          </span>
        </label>
      {/each}
      <div class="mt-2 flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={queuePending ||
            importPending ||
            !canProcessShares() ||
            !picked.some(Boolean)}
        >
          Add selected
        </Button>
        <Button
          variant="quiet"
          disabled={queuePending || importPending || !canProcessShares()}
          onclick={dismissShare}
        >
          Dismiss
        </Button>
      </div>
    </form>
  {:else if blockedShare && queuePending && !errorMessage && !queueError}
    <p role="status" class="provenance mt-2">Importing shared team…</p>
  {:else if blockedShare}
    <div class="plate mt-2 max-w-[68ch] px-4 py-3">
      <p class="wrap-anywhere">Shared link: {blockedShare.url}</p>
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
          Dismiss
        </Button>
      </div>
    </div>
  {/if}
{/snippet}
{#snippet addPaste(className: string)}
  <Button
    id="wishlist-actions"
    variant="quiet"
    class={className}
    onclick={() =>
      void goto(resolve('wishlist#import-pokepaste'), { reset: false })}
  >
    <Plus class="size-4" aria-hidden="true" />
    Add a Poképaste
  </Button>
{/snippet}
{#snippet importForm(empty: boolean)}
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
        From a Poképaste page or a YouTube video, use Share → Champion's Atlas,
        then open Champion's Atlas to finish importing.
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
  {:else if !empty}
    <div>{@render addPaste('-ms-2 gap-1 px-2')}</div>
  {/if}
{/snippet}
{#snippet emptyAction()}
  {#if page.url.hash !== '#import-pokepaste'}{@render addPaste('gap-1')}{/if}
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
  emptyTitle="No teams in Wishlist yet"
  empty="Choose Wishlist on a team in Browse, or add a Poképaste."
  {importForm}
  {emptyAction}
  {shareRecovery}
/>
