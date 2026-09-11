<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import Compass from '@lucide/svelte/icons/compass';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<a
  href="#main"
  class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:outline-2"
  >Skip to content</a
>
<header class="border-b bg-card/70">
  <div
    class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8"
  >
    <a
      href={resolve(`/?${page.url.searchParams}`)}
      class="flex min-h-11 items-center gap-3 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary"
      ><Compass class="size-6 text-primary" aria-hidden="true" />Champion's
      Atlas</a
    >
    <a
      href={resolve('/my-teams')}
      class="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary transition-colors hover:bg-secondary focus-visible:ring-2"
      >My teams</a
    >
  </div>
</header>
{@render children()}
<footer
  class="mx-auto mt-6 max-w-7xl border-t px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-8"
>
  An independent fan project. Pokémon belongs to its respective owners. Team
  sources credited in each entry.
</footer>
