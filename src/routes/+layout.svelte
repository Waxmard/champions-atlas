<script lang="ts">
  import './layout.css';
  import Compass from '@lucide/svelte/icons/compass';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Avatar, DropdownMenu } from 'bits-ui';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { initSync, signOut, sync } from '$lib/sync.svelte';

  let { children } = $props();
  const isHome = $derived(page.url.pathname === resolve('/'));
  const isMyTeams = $derived(
    page.url.pathname.startsWith(resolve('/my-teams'))
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

  onMount(() => initSync());

  $effect(() => {
    if (!sync.configured || !sync.authResolved) return;
    if (sync.user && isLogin) void goto(resolve('/'));
    else if (!sync.user && !isLogin) void goto(resolve('/login'));
  });
</script>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border focus:bg-base-100 focus:p-3"
  >Skip to content</a
>
{#if isLogin}
  {@render children()}
{:else if sync.configured && (!sync.authResolved || !sync.user)}
  <main id="main" class="flex min-h-svh items-center justify-center">
    <LoaderCircle
      class="size-6 animate-spin text-base-content/60"
      aria-label="Loading"
    />
  </main>
{:else}
  <header class="border-b border-base-300 bg-base-100">
    <div
      class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-8"
    >
      <a
        href={brandHref}
        class="flex min-h-11 items-center gap-2.5 rounded-[var(--radius-field)] px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary {isHome
          ? 'bg-info text-info-content'
          : 'text-base-content hover:bg-base-200'}"
      >
        <span
          class="grid size-8 shrink-0 place-items-center rounded-[var(--radius-field)] bg-secondary text-[#172b4d]"
        >
          <Compass class="size-5" aria-hidden="true" />
        </span>
        <span
          class="text-[1.0625rem] leading-none font-extrabold tracking-tight"
          >Champion's Atlas</span
        >
      </a>
      <nav aria-label="Main" class="flex items-center gap-1">
        <a
          href={resolve('/my-teams')}
          class="inline-flex min-h-11 items-center rounded-[var(--radius-field)] px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary {isMyTeams
            ? 'bg-info text-info-content'
            : 'text-primary hover:bg-info'}">My teams</a
        >
        {#if sync.configured}
          {#if sync.status === 'syncing' || sync.status === 'error'}<span
              role="status"
              aria-live="polite"
              title={sync.error}
              class="provenance px-1 {sync.status === 'error'
                ? 'font-semibold'
                : ''}"
              style={sync.status === 'error'
                ? 'color: var(--color-error-content)'
                : ''}
              >{sync.status === 'error' ? 'Sync failed' : 'Syncing…'}</span
            >{/if}
          {#if sync.user}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Account menu"
                class="inline-flex size-11 items-center justify-center rounded-[var(--radius-field)] outline-none hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Avatar.Root
                  class="relative flex size-7 shrink-0 overflow-hidden rounded-full border"
                >
                  {#if sync.user.photoURL}
                    <Avatar.Image
                      src={sync.user.photoURL}
                      alt={userName}
                      class="absolute inset-0 size-full object-cover"
                    />
                  {/if}
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
                    {#if sync.user.email && sync.user.email !== userName}
                      <p class="provenance truncate">{sync.user.email}</p>
                    {/if}
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
      </nav>
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
