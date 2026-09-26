<script lang="ts">
  import './layout.css';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Avatar, DropdownMenu } from 'bits-ui';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import type { ResolvedPathname } from '$app/types';
  import { initSync, signOut, sync } from '$lib/sync.svelte';
  import {
    activeTeamKey,
    readSavedTeams,
    resolveSavedTeamId,
  } from '$lib/workbench';

  let { children } = $props();
  const isHome = $derived(page.url.pathname === resolve('/'));
  const isMyTeams = $derived(
    page.url.pathname.startsWith(resolve('/my-teams'))
  );
  const isBrowse = $derived(
    isHome ||
      page.url.pathname.startsWith(
        resolve('/teams/[id]', { id: 'x' }).slice(0, -1)
      )
  );
  const isLogin = $derived(page.url.pathname === resolve('/login'));
  const brandHref = $derived(
    isHome || page.url.pathname.startsWith(resolve('/teams/'))
      ? resolve(`/?${page.url.searchParams}`)
      : resolve('/?browse=all')
  );
  const userName = $derived(sync.user?.displayName ?? sync.user?.email ?? '');
  const userInitials = $derived(
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'
  );

  const lastPageKey = 'champions-atlas:last-page:v1';
  const authReturnKey = 'champions-atlas:auth-return:v1';
  let initialUrl = $state<URL | null>(null);
  let startupReady = $state(false);
  let startupSettled = $state(false);
  let starting = false;
  let redirecting = false;
  let pendingReturn: string | null = null;
  let headerHeight = $state(0);

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
        path !== resolve('/my-teams') &&
        path !== resolve('/my-teams/new') &&
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

  function defaultDestination(): string {
    try {
      const teams = readSavedTeams(localStorage);
      const id = resolveSavedTeamId(
        teams,
        null,
        localStorage.getItem(activeTeamKey)
      );
      if (id) return resolve('/my-teams') + '?team=' + encodeURIComponent(id);
    } catch {
      return resolve('/');
    }
    return resolve('/');
  }

  function returnDestination(): string {
    return (
      pendingReturn ??
      storedDestination('session', authReturnKey) ??
      storedDestination('local', lastPageKey) ??
      defaultDestination()
    );
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
    const login = initialUrl.pathname === resolve('/login');
    const bareRoot = incoming === resolve('/');
    const remembered = bareRoot
      ? storedDestination('local', lastPageKey)
      : null;
    let destination = login
      ? returnDestination()
      : bareRoot
        ? (remembered ?? defaultDestination())
        : incoming;
    if (bareRoot || login) {
      const selected = destination.startsWith(resolve('/my-teams') + '?')
        ? new URL(destination, page.url.origin).searchParams.get('team')
        : null;
      if (selected) {
        try {
          if (
            !readSavedTeams(localStorage).some((team) => team.id === selected)
          )
            destination = resolve('/my-teams');
        } catch {
          destination = resolve('/my-teams');
        }
      }
    }
    const automaticDetail =
      !!remembered &&
      destination === remembered &&
      remembered.startsWith(resolve('/teams/[id]', { id: 'x' }).slice(0, -1));
    if (sync.configured && !sync.user) {
      pendingReturn = validDestination(destination);
      if (pendingReturn) updateStorage('session', authReturnKey, pendingReturn);
      if (!login) await goto(resolve('/login'), { replaceState: true });
    } else {
      if (destination !== incoming)
        await goto(destination as ResolvedPathname, { replaceState: true });
      if (automaticDetail && page.status === 404) {
        updateStorage('local', lastPageKey, null);
        await goto(resolve('/?browse=all'), { replaceState: true });
      }
      if (login) {
        pendingReturn = null;
        updateStorage('session', authReturnKey, null);
      }
    }
    startupSettled = true;
    startupReady = true;
  }

  onMount(() => {
    initialUrl = new URL(location.href);
    initSync();
    return () =>
      document.documentElement.style.removeProperty('--app-header-height');
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
    const login = page.url.pathname === resolve('/login');
    if ((sync.user && login) || (!sync.user && !login)) {
      redirecting = true;
      const destination = sync.user ? returnDestination() : resolve('/login');
      if (!sync.user) {
        pendingReturn = validDestination(
          page.url.pathname + page.url.search + page.url.hash
        );
        if (pendingReturn)
          updateStorage('session', authReturnKey, pendingReturn);
      }
      void goto(destination as ResolvedPathname, { replaceState: true })
        .then(() => {
          if (sync.user) {
            pendingReturn = null;
            updateStorage('session', authReturnKey, null);
          }
        })
        .finally(() => {
          redirecting = false;
        });
    }
  });

  $effect(() => {
    const url = page.url;
    if (
      !startupReady ||
      url.pathname === resolve('/login') ||
      (url.pathname === resolve('/') && !url.search && !url.hash) ||
      page.status >= 400 ||
      (sync.configured && !sync.user)
    )
      return;
    updateStorage('local', lastPageKey, url.pathname + url.search + url.hash);
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
  class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border focus:bg-base-100 focus:p-3"
  >Skip to content</a
>
{#if isLogin}
  {@render children()}
{:else if !startupReady || (sync.configured && (!sync.authResolved || !sync.user))}
  <main id="main" class="flex min-h-svh items-center justify-center">
    <LoaderCircle
      class="size-6 animate-spin text-base-content/60"
      aria-label="Loading"
    />
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
        class="flex min-h-11 items-center rounded-[var(--radius-field)] px-2 text-base-content outline-none hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
      >
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
          class="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-field)] px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary {isBrowse
            ? 'bg-info text-info-content'
            : 'text-primary hover:bg-info'}">Browse</a
        >
        <a
          href={resolve('/my-teams')}
          aria-current={isMyTeams ? 'page' : undefined}
          class="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-field)] px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary {isMyTeams
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
                    <p class="truncate text-sm font-semibold">{userName}</p>
                    {#if sync.user.email && sync.user.email !== userName}<p
                        class="provenance truncate"
                      >
                        {sync.user.email}
                      </p>{/if}
                  </div>
                  <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-base-300" />
                  <DropdownMenu.Item
                    onSelect={signOut}
                    class="flex min-h-9 cursor-pointer items-center px-2 text-sm outline-none data-highlighted:bg-base-200"
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
  {@render children()}
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
