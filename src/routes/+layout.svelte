<script lang="ts">
  import './layout.css';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Avatar, DropdownMenu } from 'bits-ui';
  import { resolve } from '$app/paths';
  import {
    afterNavigate,
    beforeNavigate,
    goto,
    onNavigate,
    type NavigationTarget,
  } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, tick } from 'svelte';
  import type { PathnameWithSearchOrHash, ResolvedPathname } from '$app/types';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import Search from '@lucide/svelte/icons/search';
  import Folder from '@lucide/svelte/icons/folder';
  import ActionNotification from '#lib/components/ActionNotification.svelte';
  import AppFooter from '#lib/components/AppFooter.svelte';
  import HelpButton from '#lib/components/HelpButton.svelte';
  import HelpSheet from '#lib/components/HelpSheet.svelte';
  import NotificationSettings from '#lib/components/NotificationSettings.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    initCatalogRuntime,
    refreshCatalogNow,
  } from '#lib/catalog-runtime.svelte.js';
  import {
    copySyncLog,
    deleteAccount,
    initSync,
    pushNow,
    signOut,
    sync,
  } from '#lib/sync.svelte.js';
  import { migrateStoredData } from '#lib/storage-migration.js';
  import {
    applyGameResults,
    liveSavedTeam,
    shortcutTeam,
  } from '#lib/team-collections.js';
  import { normalizeInitialUrl } from '#lib/initial-url.js';
  import { AtlasNative, isNativeApp } from '#lib/native.js';
  import { clearNotification } from '#lib/notifications.js';
  import { pageTransition } from '#lib/motion.js';
  import { swipe, swipeReset } from '#lib/swipe.js';

  let { children } = $props();
  const isHome = $derived(page.route.id === '/');
  const collectionRoutes = ['/saved', '/wishlist'] as const;
  const isCollectionPath = (path: string) =>
    collectionRoutes.some((route) => path === resolve(route));
  const isSaved = $derived(
    page.route.id === '/saved' || page.route.id === '/saved/new'
  );
  let savedTeamId = $state<string | null>(null);
  const savedHref = $derived(
    !isSaved && savedTeamId
      ? resolve(`saved?team=${encodeURIComponent(savedTeamId)}`)
      : resolve('saved')
  );
  const isBrowse = $derived(isHome || page.route.id === '/teams/[id]');
  const isLogin = $derived(page.url.pathname === resolve('login'));

  const brandHref = $derived(
    isBrowse ? resolve(`?${page.url.searchParams}`) : resolve('?browse=all')
  );
  const tabClass = (active: boolean) =>
    `flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-field)] text-[0.6875rem] leading-none font-bold outline-none transition-[scale] duration-150 active:scale-95 [&>svg]:size-5 [&>svg]:shrink-0 ${active ? 'bg-info text-info-content' : 'text-[color:var(--color-muted)] hover:bg-base-200 hover:text-base-content focus-visible:bg-base-200'}`;

  const userName = $derived(sync.user?.displayName ?? sync.user?.email ?? '');
  const userInitials = $derived(
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
  const lastPageKey = 'champions-atlas:last-page:v1';
  const savedTeamKey = 'champions-atlas:saved-open-team:v1';
  const lastScrollKey = 'champions-atlas:last-scroll:v1';
  const authReturnKey = 'champions-atlas:auth-return:v1';
  const authReturnSourceKey = 'champions-atlas:auth-return-source:v1';
  let initialUrl = $state<URL | null>(null);
  let startupReady = $state(false);
  let startupSettled = $state(false);
  let starting = false;
  let redirecting = false;
  let pendingReturn: string | null = null;
  let returningRemembered = false;
  let headerHeight = $state(0);
  type ScrollPosition = { url: string; x: number; y: number };
  let initialScroll: ScrollPosition | null = null;
  let pendingScroll: ScrollPosition | null = null;
  let settledUrl: string | null = null;
  let navigationGeneration = 0;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let shareReadError = $state(false);
  let checkingShares = false;
  let syncingResults = false;
  let notificationAccount: string | undefined;
  let notificationSettingsOpen = $state(false);

  function validDestination(value: string | null): string | null {
    if (
      !value?.startsWith('/') ||
      value.startsWith('//') ||
      value.includes('\\')
    )
      return null;
    try {
      const url = new URL(value, page.url.origin);
      if (url.origin !== page.url.origin) return null;
      const path = url.pathname;
      const detailPrefix = resolve('/teams/[id]', { id: 'x' }).slice(0, -1);

      if (
        path !== resolve('/') &&
        !isCollectionPath(path) &&
        path !== resolve('saved/new') &&
        !(
          path.startsWith(detailPrefix) &&
          path.length > detailPrefix.length &&
          !path.slice(detailPrefix.length).includes('/')
        )
      )
        return null;

      decodeURIComponent(path);
      return path + url.search + url.hash;
    } catch {
      return null;
    }
  }

  function storedDestination(
    kind: 'local' | 'session',
    key: string
  ): string | null {
    try {
      return validDestination(
        (kind === 'local' ? localStorage : sessionStorage).getItem(key)
      );
    } catch {
      return null;
    }
  }

  function updateStorage(
    kind: 'local' | 'session',
    key: string,
    value: string | null
  ) {
    try {
      const storage = kind === 'local' ? localStorage : sessionStorage;
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      return;
    }
  }

  function trackSavedTeam(from: NavigationTarget | null, to: NavigationTarget) {
    let id = savedTeamId;
    if (!from) {
      try {
        id = localStorage.getItem(savedTeamKey);
      } catch {
        id = null;
      }
    }
    if (to.route.id === '/saved') id = to.url.searchParams.get('team') || null;
    else if (id && from?.route.id !== to.route.id) {
      try {
        if (!liveSavedTeam(localStorage, id)) id = null;
      } catch {
        id = null;
      }
    }
    savedTeamId = id;
    updateStorage('local', savedTeamKey, id);
  }

  function urlString(
    url: Readonly<Pick<URL, 'pathname' | 'search' | 'hash'>>
  ): string {
    return url.pathname + url.search + url.hash;
  }

  function readScroll(): ScrollPosition | null {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(lastScrollKey) ?? 'null'
      );
      if (!value || typeof value !== 'object') return null;
      const { url, x, y } = value as Record<string, unknown>;
      if (
        typeof url !== 'string' ||
        validDestination(url) !== url ||
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0
      )
        return null;
      return { url, x, y };
    } catch {
      return null;
    }
  }

  function savePosition() {
    const url = urlString(page.url);
    if (
      !startupReady ||
      !startupSettled ||
      redirecting ||
      pendingScroll ||
      settledUrl !== url ||
      page.status >= 400 ||
      (sync.configured && !sync.user) ||
      validDestination(url) !== url
    )
      return;
    let { scrollX: x, scrollY: y } = window;
    const { position, left, top } = document.body.style;
    if (position === 'fixed' && document.querySelector('dialog[open]')) {
      const lockedX = Number.parseFloat(left);
      const lockedY = Number.parseFloat(top);
      if (Number.isFinite(lockedX)) x = -lockedX;
      if (Number.isFinite(lockedY)) y = -lockedY;
    }
    updateStorage('local', lastPageKey, url);
    updateStorage(
      'local',
      lastScrollKey,
      JSON.stringify({
        url,
        x: Math.max(0, x),
        y: Math.max(0, y),
      })
    );
  }

  function flushPosition() {
    clearTimeout(scrollTimer);
    scrollTimer = undefined;
    savePosition();
  }

  function debouncePosition() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(flushPosition, 200);
  }

  async function updateAfterRender() {
    const generation = navigationGeneration;
    await tick();
    await new Promise<void>((done) => requestAnimationFrame(() => done()));
    await new Promise<void>((done) => requestAnimationFrame(() => done()));
    if (generation !== navigationGeneration) return;
    if (pendingScroll) {
      if (urlString(page.url) !== pendingScroll.url) return;
      window.scrollTo({
        left: pendingScroll.x,
        top: pendingScroll.y,
        behavior: 'instant',
      });
      pendingScroll = null;
    }
    savePosition();
  }

  function canonicalizing(from: URL, to: URL): boolean {
    if (from.pathname !== to.pathname) return false;
    if (from.pathname === resolve('/'))
      return !['member', 'page', 'new', 'unknown', 'sort'].some((key) =>
        from.searchParams.has(key)
      );
    return false;
  }

  beforeNavigate(({ from, to, type }) => {
    if (!startupReady || redirecting || !pendingScroll || !from || !to) return;
    navigationGeneration++;
    if (
      type !== 'goto' ||
      urlString(from.url) !== pendingScroll.url ||
      (urlString(to.url) !== pendingScroll.url &&
        !canonicalizing(from.url, to.url))
    )
      pendingScroll = null;
  });

  afterNavigate(({ from, to, type }) => {
    swipeReset();
    navigationGeneration++;
    if (!to) return;
    trackSavedTeam(from, to);
    settledUrl = urlString(to.url);
    if (!startupReady) return;
    if (pendingScroll && settledUrl !== pendingScroll.url) {
      if (
        type === 'goto' &&
        from &&
        urlString(from.url) === pendingScroll.url &&
        canonicalizing(from.url, to.url)
      )
        pendingScroll = { ...pendingScroll, url: settledUrl };
      else pendingScroll = null;
    }
    if (!redirecting) void updateAfterRender();
  });

  onNavigate((navigation) =>
    startupReady && !pendingScroll ? pageTransition(navigation) : undefined
  );

  function returnDestination(): string {
    if (pendingReturn) return pendingReturn;
    const session = storedDestination('session', authReturnKey);
    if (session) {
      try {
        returningRemembered =
          sessionStorage.getItem(authReturnSourceKey) === 'remembered';
      } catch {
        returningRemembered = false;
      }
      return session;
    }
    const remembered = storedDestination('local', lastPageKey);
    returningRemembered = !!remembered;
    return remembered ?? resolve('/');
  }

  function saveReturn(destination: string, remembered: boolean) {
    pendingReturn = validDestination(destination);
    returningRemembered = remembered;
    updateStorage('session', authReturnKey, pendingReturn);
    updateStorage(
      'session',
      authReturnSourceKey,
      pendingReturn ? (remembered ? 'remembered' : 'explicit') : null
    );
  }

  function clearReturn() {
    pendingReturn = null;
    returningRemembered = false;
    updateStorage('session', authReturnKey, null);
    updateStorage('session', authReturnSourceKey, null);
  }

  async function visitDestination(destination: string, remembered: boolean) {
    const incoming = initialUrl ? urlString(initialUrl) : null;
    const explicit =
      (incoming === destination && incoming !== resolve('/')) ||
      (initialUrl?.pathname === resolve('login') &&
        (pendingReturn === destination ||
          storedDestination('session', authReturnKey) === destination));
    if (initialScroll?.url === destination && (remembered || explicit))
      pendingScroll = initialScroll;
    initialScroll = null;
    if (destination !== page.url.pathname + page.url.search + page.url.hash)
      await goto(destination as ResolvedPathname, { replace: true });
    if (
      remembered &&
      destination.startsWith(
        resolve('/teams/[id]', { id: 'x' }).slice(0, -1)
      ) &&
      page.status === 404
    ) {
      pendingScroll = null;
      updateStorage('local', lastPageKey, null);
      await goto(resolve('?browse=all'), { replace: true });
    }
  }

  async function resume() {
    if (
      !initialUrl ||
      starting ||
      startupSettled ||
      (sync.configured && !sync.authResolved)
    )
      return;

    starting = true;
    const incoming = initialUrl.pathname + initialUrl.search + initialUrl.hash;
    const login = initialUrl.pathname === resolve('login');
    const bareRoot = incoming === resolve('/');
    const remembered = bareRoot
      ? storedDestination('local', lastPageKey)
      : null;
    returningRemembered = !!remembered;
    const destination = login
      ? returnDestination()
      : bareRoot
        ? (remembered ?? resolve('/'))
        : incoming;

    if (sync.configured && !sync.user) {
      saveReturn(destination, returningRemembered);
      if (!login) await goto(resolve('login'), { replace: true });
    } else {
      await visitDestination(destination, returningRemembered);
      if (login) clearReturn();
    }
    startupSettled = true;
    startupReady = true;
    settledUrl = urlString(page.url);
    void updateAfterRender();
  }

  async function checkSharedLinks() {
    if (
      !isNativeApp ||
      !startupSettled ||
      redirecting ||
      checkingShares ||
      (sync.configured && !sync.authResolved) ||
      page.url.pathname === resolve('wishlist')
    )
      return;
    checkingShares = true;
    try {
      const { shares } = await AtlasNative.getPendingShares();
      shareReadError = false;
      if (!shares.length || (sync.configured && !sync.authResolved)) return;
      if (sync.configured && !sync.user) {
        saveReturn(resolve('wishlist'), false);
        if (page.url.pathname !== resolve('login'))
          await goto(resolve('login'), { replace: true }).catch(() => {});
      } else if (
        page.url.pathname !== resolve('login') &&
        page.url.pathname !== resolve('wishlist')
      ) {
        await goto(resolve('wishlist')).catch(() => {});
      }
    } catch {
      shareReadError = true;
    } finally {
      checkingShares = false;
    }
  }

  async function publishShortcutTeam() {
    if (isNativeApp)
      await AtlasNative.setActiveTeam({ team: shortcutTeam(localStorage) });
  }

  async function syncGameResults() {
    if (
      !isNativeApp ||
      !startupSettled ||
      syncingResults ||
      (sync.configured && !sync.user)
    )
      return;
    syncingResults = true;
    try {
      const { results } = await AtlasNative.getPendingResults();
      if (results.length) {
        if (applyGameResults(localStorage, results)) {
          sync.revision++;
          void pushNow();
        }
        await AtlasNative.acknowledgeResults({ results });
      }
      await publishShortcutTeam();
    } finally {
      syncingResults = false;
    }
  }

  let tappedPath: string | null = null;

  async function openTapped() {
    if (tappedPath === null || !startupSettled) return;
    const path = tappedPath;
    tappedPath = null;
    if (sync.configured && !sync.user) return;
    if (path.startsWith('?')) {
      await initCatalogRuntime();
      await Promise.race([
        refreshCatalogNow(),
        new Promise((done) => setTimeout(done, 5000)),
      ]);
    }
    void goto(resolve(path as PathnameWithSearchOrHash));
  }

  onMount(() => {
    initialScroll = readScroll();
    try {
      migrateStoredData(localStorage);
    } catch {
      /* storage unavailable */
    }
    initialUrl = normalizeInitialUrl(location.href, resolve('/'));
    void initCatalogRuntime();
    initSync();
    const tapListener = isNativeApp
      ? AtlasNative.addListener('notificationTap', ({ path }) => {
          tappedPath = path;
          void openTapped();
        })
      : null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushPosition();
        void publishShortcutTeam().catch(() => {});
      } else {
        void checkSharedLinks();
        void syncGameResults().catch(() => {});
      }
    };
    const onHashChange = () => {
      navigationGeneration++;
      pendingScroll = null;
      settledUrl = urlString(new URL(location.href));
      void updateAfterRender();
    };
    window.addEventListener('scroll', debouncePosition, { passive: true });
    window.addEventListener('pagehide', flushPosition);
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      navigationGeneration++;
      clearTimeout(scrollTimer);
      window.removeEventListener('scroll', debouncePosition);
      window.removeEventListener('pagehide', flushPosition);
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('visibilitychange', onVisibility);
      void tapListener?.then((handle) => handle.remove());
      document.documentElement.style.removeProperty('--app-header-measured');
    };
  });

  $effect.pre(() => {
    const nextAccount = sync.user?.uid;
    if (nextAccount !== notificationAccount) {
      notificationAccount = nextAccount;
      clearNotification();
    }
  });

  $effect(() => {
    if (initialUrl && (!sync.configured || sync.authResolved)) void resume();
  });

  $effect(() => {
    if (startupSettled && (!sync.configured || sync.authResolved)) {
      void sync.user;
      void checkSharedLinks();
      void syncGameResults().catch(() => {});
      void openTapped();
    }
  });

  $effect(() => {
    if (
      !startupSettled ||
      !sync.configured ||
      !sync.authResolved ||
      redirecting
    )
      return;

    const login = page.url.pathname === resolve('login');

    if ((sync.user && login) || (!sync.user && !login)) {
      redirecting = true;
      if (!sync.user) {
        saveReturn(page.url.pathname + page.url.search + page.url.hash, false);
        void goto(resolve('login'), { replace: true }).finally(() => {
          redirecting = false;
        });
      } else {
        const destination = returnDestination();
        void visitDestination(destination, returningRemembered)
          .then(clearReturn)
          .finally(() => {
            redirecting = false;
            void updateAfterRender();
            void checkSharedLinks();
          });
      }
    }
  });

  $effect(() => {
    if (headerHeight)
      document.documentElement.style.setProperty(
        '--app-header-measured',
        headerHeight + 'px'
      );
    else document.documentElement.style.removeProperty('--app-header-measured');
  });
</script>

<svelte:document use:swipe />

{#if shareReadError && page.url.pathname !== resolve('wishlist')}
  <div role="alert" class="plate mx-4 mt-4 px-4 py-3">
    Shared links could not be read. Try again.
    <Button variant="quiet" onclick={() => checkSharedLinks()}>
      Try again
    </Button>
  </div>
{/if}
<a
  href="#main"
  class="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:border focus:bg-base-100 focus:p-3"
  >Skip to content</a
>
{#if isLogin}
  {@render children()}
{:else if !startupReady || (sync.configured && (!sync.authResolved || !sync.user))}
  <main id="main" class="flex min-h-svh items-center justify-center">
    <LoaderCircle
      class="size-6 animate-spin text-base-content/60"
      aria-hidden="true"
    />
    <span class="sr-only" role="status">Loading…</span>
  </main>
{:else}
  <header
    bind:clientHeight={headerHeight}
    class="sticky top-0 z-40 border-b border-base-300 bg-base-100 [view-transition-name:app-header] phone-landscape:static"
  >
    <div
      class="app-container flex items-center justify-between gap-2 pt-[calc(0.625rem+env(safe-area-inset-top))] pb-2.5"
    >
      <a
        href={brandHref}
        class="nav-pill -ms-3 justify-start text-base-content hover:bg-base-200 max-sm:gap-0.5"
      >
        <img src="/favicon.svg" alt="" width="36" height="39" />
        <span
          class="font-display text-lg leading-none font-bold tracking-tight whitespace-nowrap sm:text-xl"
          >Champion's Atlas</span
        >
      </a>
      <div class="flex min-w-0 items-center justify-end gap-1">
        <HelpButton label="Help" class="size-11 shrink-0" />
        {#if sync.configured}
          {#if sync.user}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Account menu"
                class="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-field)] outline-none hover:bg-base-200"
              >
                <Avatar.Root
                  class="relative flex size-7 shrink-0 overflow-hidden rounded-full border"
                >
                  {#if sync.user.photoURL}<Avatar.Image
                      src={sync.user.photoURL}
                      alt={userName}
                      class="absolute inset-0 size-full object-cover"
                    />{/if}
                  <Avatar.Fallback
                    class="flex size-full items-center justify-center bg-base-200 text-xs font-medium"
                    >{userInitials}</Avatar.Fallback
                  >
                </Avatar.Root>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  class="surface popover-motion z-50 min-w-56 p-1 text-base-content shadow-lg"
                >
                  <div class="px-2 py-1.5">
                    <p class="text-sm font-semibold wrap-anywhere">
                      {userName}
                    </p>
                    {#if sync.user.email && sync.user.email !== userName}<p
                        class="provenance wrap-anywhere"
                      >
                        {sync.user.email}
                      </p>{/if}
                  </div>
                  <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-base-300" />
                  {#if sync.status === 'error'}
                    <p
                      role="alert"
                      class="max-w-64 px-2 py-1.5 text-sm leading-relaxed wrap-break-word"
                      style="color: var(--color-error-content)"
                    >
                      {sync.error}
                    </p>
                    <DropdownMenu.Item
                      onSelect={() => void pushNow()}
                      class="option-row min-h-9 px-2"
                      >Retry sync</DropdownMenu.Item
                    >
                  {/if}
                  {#if isNativeApp}
                    <DropdownMenu.Item
                      onSelect={() => (notificationSettingsOpen = true)}
                      class="option-row min-h-9 px-2"
                      >Notifications</DropdownMenu.Item
                    >
                  {/if}
                  <DropdownMenu.Item
                    onSelect={copySyncLog}
                    class="option-row min-h-9 px-2"
                    >Copy sync log</DropdownMenu.Item
                  >
                  <DropdownMenu.Item
                    onSelect={signOut}
                    class="option-row min-h-9 px-2">Sign out</DropdownMenu.Item
                  >
                  <DropdownMenu.Item
                    onSelect={() => {
                      if (
                        confirm(
                          'Permanently delete your account and its synced teams and sets from the cloud? Teams on this device stay.'
                        )
                      )
                        void deleteAccount();
                    }}
                    class="option-row min-h-9 px-2 text-error-content data-[highlighted]:bg-error data-[highlighted]:text-error-content"
                    >Delete account</DropdownMenu.Item
                  >
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          {/if}
        {/if}
      </div>
    </div>
  </header>
  <ActionNotification />
  <HelpSheet />
  {#if notificationSettingsOpen}
    <NotificationSettings onclose={() => (notificationSettingsOpen = false)} />
  {/if}
  {#key sync.user?.uid}
    {@render children()}
  {/key}
  <AppFooter />
  <nav
    aria-label="Main"
    class="fixed inset-x-0 bottom-0 z-40 h-[var(--app-tabbar-height)] border-t border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom)] [view-transition-name:app-tabbar] phone-landscape:inset-y-0 phone-landscape:right-auto phone-landscape:h-auto phone-landscape:w-[calc(var(--app-rail-width)+env(safe-area-inset-left))] phone-landscape:border-t-0 phone-landscape:border-r phone-landscape:pb-0 phone-landscape:pl-[env(safe-area-inset-left)]"
  >
    <div
      class="app-container grid h-full grid-cols-3 items-center gap-1 phone-landscape:grid-cols-1 phone-landscape:content-center phone-landscape:px-1"
    >
      <a
        href={brandHref}
        aria-current={isBrowse ? 'page' : undefined}
        class={tabClass(isBrowse)}
      >
        <Search aria-hidden="true" />
        <span class="truncate">Browse</span>
      </a>
      <a
        href={savedHref}
        data-swipe-back={page.route.id === '/saved/new' ? '' : undefined}
        aria-current={isSaved ? 'page' : undefined}
        class={tabClass(isSaved)}
      >
        <Folder aria-hidden="true" />
        <span class="truncate">Saved</span>
      </a>
      <a
        href={resolve('wishlist')}
        aria-current={page.route.id === '/wishlist' ? 'page' : undefined}
        class={tabClass(page.route.id === '/wishlist')}
      >
        <Bookmark aria-hidden="true" />
        <span class="truncate">Wishlist</span>
      </a>
    </div>
  </nav>
{/if}
