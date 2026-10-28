<script lang="ts">
  import './layout.css';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Avatar, DropdownMenu } from 'bits-ui';
  import { resolve } from '$app/paths';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, tick } from 'svelte';
  import type { ResolvedPathname } from '$app/types';
  import { initSync, pushNow, signOut, sync } from '#lib/sync.svelte.js';
  import { activeTeamKey, readSavedTeams } from '#lib/workbench.js';
  import { migrateStoredData } from '#lib/storage-migration.js';
  import { teamsInUse } from '#lib/team-collections.js';

  let { children } = $props();
  const isHome = $derived(page.route.id === '/');
  const isMyTeams = $derived(
    page.route.id === '/my-teams' ||
      page.route.id === '/my-teams/new' ||
      page.route.id === '/wishlist'
  );
  const isBrowse = $derived(isHome || page.route.id === '/teams/[id]');
  const isLogin = $derived(page.url.pathname === resolve('login'));

  const brandHref = $derived(
    isBrowse ? resolve(`?${page.url.searchParams}`) : resolve('?browse=all')
  );

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
        path !== resolve('my-teams') &&
        path !== resolve('wishlist') &&
        path !== resolve('my-teams/new') &&
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
      return !['member', 'regulation', 'sort', 'page', 'type', 'custom'].some(
        (key) => from.searchParams.has(key)
      );
    if (from.pathname !== resolve('my-teams')) return false;
    const selected = from.searchParams.get('team');
    const target = to.searchParams.get('team');
    if (
      to.hash ||
      to.search !== (target ? '?team=' + encodeURIComponent(target) : '')
    )
      return false;
    if (selected) return selected === target;
    try {
      return target === localStorage.getItem(activeTeamKey);
    } catch {
      return false;
    }
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
    navigationGeneration++;
    if (!to) return;
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
    if (remembered) {
      const url = new URL(destination, page.url.origin);
      const selected =
        url.pathname === resolve('my-teams')
          ? url.searchParams.get('team')
          : null;
      if (selected) {
        try {
          if (
            !teamsInUse(readSavedTeams(localStorage)).some(
              (team) => team.id === selected
            )
          )
            destination = resolve('my-teams');
        } catch {
          destination = resolve('my-teams');
        }
      }
    }
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

  onMount(() => {
    initialScroll = readScroll();
    try {
      migrateStoredData(localStorage);
    } catch {
      /* storage unavailable */
    }
    initialUrl = new URL(location.href);
    initSync();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPosition();
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
      document.documentElement.style.removeProperty('--app-header-height');
    };
  });

  $effect(() => {
    if (initialUrl && (!sync.configured || sync.authResolved)) void resume();
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
          });
      }
    }
  });

  $effect(() => {
    if (headerHeight)
      document.documentElement.style.setProperty(
        '--app-header-height',
        headerHeight + 'px'
      );
    else document.documentElement.style.removeProperty('--app-header-height');
  });
</script>

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
    class="sticky top-0 z-40 border-b border-base-300 bg-base-100"
  >
    <div
      class="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 ps-[calc(1rem+env(safe-area-inset-left))] pe-[calc(1rem+env(safe-area-inset-right))] pt-[calc(0.625rem+env(safe-area-inset-top))] pb-2.5 sm:flex sm:justify-between sm:gap-4 sm:ps-[calc(2rem+env(safe-area-inset-left))] sm:pe-[calc(2rem+env(safe-area-inset-right))]"
    >
      <a
        href={brandHref}
        class="nav-pill justify-start text-base-content hover:bg-base-200 sm:justify-center"
      >
        <img src="/favicon.svg" alt="" width="32" height="35" />
        <span
          class="text-[1.0625rem] leading-none font-extrabold tracking-tight"
          >Champion's Atlas</span
        >
      </a>
      <nav
        aria-label="Main"
        class="col-span-2 row-start-2 grid grid-cols-2 gap-1 sm:order-2 sm:flex sm:items-center"
      >
        <a
          href={brandHref}
          aria-current={isBrowse ? 'page' : undefined}
          class="nav-pill {isBrowse
            ? 'bg-info text-info-content'
            : 'text-primary hover:bg-info'}">Browse</a
        >
        <a
          href={resolve('my-teams')}
          aria-current={isMyTeams ? 'page' : undefined}
          class="nav-pill {isMyTeams
            ? 'bg-info text-info-content'
            : 'text-primary hover:bg-info'}">My teams</a
        >
      </nav>
      <div
        class="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-1 sm:order-3"
      >
        {#if sync.configured}
          {#if sync.status === 'syncing' || sync.status === 'error'}
            <span
              role="status"
              aria-live="polite"
              title={sync.error}
              class="provenance max-w-16 text-center leading-tight wrap-break-word {sync.status ===
              'error'
                ? 'font-semibold'
                : ''}"
              style={sync.status === 'error'
                ? 'color: var(--color-error-content)'
                : ''}
              >{sync.status === 'error' ? 'Sync failed' : 'Syncing…'}</span
            >
          {/if}
          {#if sync.user}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Account menu"
                class="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-field)] outline-none hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
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
                  class="z-50 min-w-56 rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 text-base-content shadow-lg"
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
                      class="flex min-h-9 cursor-pointer items-center px-2 text-sm outline-none data-highlighted:bg-info data-highlighted:text-info-content"
                      >Retry sync</DropdownMenu.Item
                    >
                  {/if}
                  <DropdownMenu.Item
                    onSelect={signOut}
                    class="flex min-h-9 cursor-pointer items-center px-2 text-sm outline-none data-highlighted:bg-info data-highlighted:text-info-content"
                    >Sign out</DropdownMenu.Item
                  >
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          {/if}
        {/if}
      </div>
    </div>
  </header>
  {#key sync.user?.uid}
    {@render children()}
  {/key}
  <footer
    class="mx-auto mt-10 max-w-7xl border-t border-base-content/25 px-4 py-6 sm:px-8"
  >
    <p class="provenance max-w-4xl">
      An independent fan project. Pokémon belongs to its respective owners. Team
      sources credited in each entry. Champions Pokémon sprites from
      <a
        class="underline underline-offset-2"
        href="https://github.com/PokeAPI/sprites"
        target="_blank"
        rel="external noreferrer">PokéAPI sprites</a
      >; see
      <a
        class="underline underline-offset-2"
        href="https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt"
        target="_blank"
        rel="external noreferrer">license notice</a
      >. Champions sprite set and image rights belong to The Pokémon Company.
      Item icons from
      <a
        class="underline underline-offset-2"
        href="https://github.com/smogon/sprites"
        target="_blank"
        rel="external noreferrer">Smogon sprites</a
      >. Item image rights belong to Nintendo, Game Freak, and The Pokémon
      Company.
    </p>
  </footer>
{/if}
