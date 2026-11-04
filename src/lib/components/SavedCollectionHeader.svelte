<script lang="ts">
  import { resolve } from '$app/paths';
  import Bookmark from '@lucide/svelte/icons/bookmark';

  let { collection }: { collection: 'my-teams' | 'wishlist' } = $props();
</script>

<header class="min-w-0">
  <nav
    aria-label="Team collections"
    class="grid w-full min-w-0 grid-cols-2 items-center rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1"
  >
    <a
      href={resolve('my-teams')}
      aria-label="My Teams collection"
      aria-current={collection === 'my-teams' ? 'page' : undefined}
      class="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11 {collection ===
      'my-teams'
        ? 'bg-info text-info-content'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
    >
      <svg
        viewBox="0 0 96 104"
        class="size-4 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="6"
          stroke-linecap="round"
          d="M22 37a34 34 0 1 0 52 0"
        />
        <path
          fill="currentColor"
          d="M22 37 18 15 35 24 48 7 61 24 78 15 74 37Z"
        />
        <path fill="currentColor" d="m61 46-9 24-23 10 10-24Z" />
      </svg>
      <span>My Teams</span>
    </a>
    <a
      href={resolve('wishlist')}
      aria-current={collection === 'wishlist' ? 'page' : undefined}
      class="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11 {collection ===
      'wishlist'
        ? 'bg-info text-info-content'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
    >
      <Bookmark class="size-4" aria-hidden="true" />
      <span>Wishlist</span>
    </a>
  </nav>
</header>
