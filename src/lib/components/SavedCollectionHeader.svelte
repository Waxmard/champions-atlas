<script lang="ts">
  import { resolve } from '$app/paths';
  import Bookmark from '@lucide/svelte/icons/bookmark';

  let {
    collection,
    title,
    description,
  }: {
    collection: 'my-teams' | 'wishlist';
    title: string;
    description?: string;
  } = $props();
</script>

<header class="min-w-0">
  <h1 class="sr-only">{title}</h1>
  <nav
    aria-label="Team collections"
    class="inline-flex w-fit max-w-full flex-none items-center rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1"
  >
    <a
      href={resolve('my-teams')}
      aria-label="My teams collection"
      aria-current={collection === 'my-teams' ? 'page' : undefined}
      class="inline-flex min-h-9 items-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11 {collection ===
      'my-teams'
        ? 'bg-info text-info-content'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
    >
      <span>My teams</span>
    </a>
    <a
      href={resolve('wishlist')}
      aria-current={collection === 'wishlist' ? 'page' : undefined}
      class="inline-flex min-h-9 items-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11 {collection ===
      'wishlist'
        ? 'bg-info text-info-content'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
    >
      <Bookmark class="size-4" aria-hidden="true" />
      <span>Wishlist</span>
    </a>
  </nav>
  {#if description}
    <p
      class="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-base-content/70"
    >
      {description}
    </p>
  {/if}
</header>
