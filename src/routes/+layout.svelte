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
  class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:outline-2"
  >Skip to content</a
>
{#if isLogin}
  {@render children()}
{:else if sync.configured && (!sync.authResolved || !sync.user)}
  <main class="flex min-h-svh items-center justify-center">
    <LoaderCircle
      class="size-6 animate-spin text-muted-foreground"
      aria-label="Loading"
    />
  </main>
{:else}
  <header class="border-b bg-card shadow-xs">
    <div
      class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8"
    >
      <a
        href={brandHref}
        class="flex min-h-11 items-center gap-3 rounded-md px-2 font-semibold tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary {isHome
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-secondary'}"
        ><Compass class="size-6 text-primary" aria-hidden="true" />Champion's
        Atlas</a
      >
      <div class="flex items-center gap-2">
        <a
          href={resolve('/my-teams')}
          class="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium transition-colors focus-visible:ring-2 {isMyTeams
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-primary hover:bg-secondary'}">My teams</a
        >
        {#if sync.configured}
          {#if sync.status === 'syncing' || sync.status === 'error'}<span
              role="status"
              aria-live="polite"
              title={sync.error}
              class="text-xs {sync.status === 'error'
                ? 'text-destructive'
                : 'text-muted-foreground'}"
              >{sync.status === 'error' ? 'Sync failed' : 'Syncing…'}</span
            >{/if}
          {#if sync.user}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Account menu"
                class="inline-flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Avatar.Root
                  class="relative flex size-8 shrink-0 overflow-hidden rounded-full"
                >
                  {#if sync.user.photoURL}
                    <Avatar.Image
                      src={sync.user.photoURL}
                      alt={userName}
                      class="absolute inset-0 size-full object-cover"
                    />
                  {/if}
                  <Avatar.Fallback
                    class="flex size-full items-center justify-center bg-accent text-sm font-medium text-accent-foreground"
                    >{userInitials}</Avatar.Fallback
                  >
                </Avatar.Root>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  class="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
                >
                  <div class="px-2 py-1.5">
                    <p class="truncate text-sm font-medium">{userName}</p>
                    {#if sync.user.email && sync.user.email !== userName}
                      <p class="truncate text-xs text-muted-foreground">
                        {sync.user.email}
                      </p>
                    {/if}
                  </div>
                  <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
                  <DropdownMenu.Item
                    onSelect={signOut}
                    class="flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
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
    class="mx-auto mt-6 max-w-7xl border-t px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-8"
  >
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
    >. Champions sprite set and image rights belong to The Pokémon Company. Item
    icons from
    <a
      class="underline underline-offset-2"
      href="https://github.com/smogon/sprites"
      target="_blank"
      rel="external noreferrer">Smogon sprites</a
    >. Item image rights belong to Nintendo, Game Freak, and The Pokémon
    Company.
  </footer>
{/if}
