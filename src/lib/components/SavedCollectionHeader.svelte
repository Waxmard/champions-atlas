<script lang="ts">
  import { resolve } from '$app/paths';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import Plus from '@lucide/svelte/icons/plus';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    collection,
    title,
    description,
  }: {
    collection: 'my-teams' | 'wishlist';
    title: string;
    description: string;
  } = $props();
</script>

<header
  class="flex flex-col gap-4 border-b border-base-300 pb-5 sm:flex-row sm:items-end sm:justify-between"
>
  <div class="min-w-0">
    <h1
      class="text-[1.75rem] leading-tight font-extrabold wrap-break-word sm:text-4xl"
    >
      {title}
    </h1>
    <p
      class="mt-1.5 max-w-[58ch] text-[0.9375rem] leading-relaxed text-base-content/70"
    >
      {description}
    </p>
  </div>
  <div class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:self-end">
    <nav
      aria-label="Team collections"
      class="inline-flex items-center rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1"
    >
      <a
        href={resolve('my-teams')}
        aria-label="My teams collection"
        aria-current={collection === 'my-teams' ? 'page' : undefined}
        class="inline-flex min-h-11 items-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3.5 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary {collection ===
        'my-teams'
          ? 'bg-info text-info-content'
          : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
      >
        <span>My teams</span>
      </a>
      <a
        href={resolve('wishlist')}
        aria-current={collection === 'wishlist' ? 'page' : undefined}
        class="inline-flex min-h-11 items-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-3.5 text-sm font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary {collection ===
        'wishlist'
          ? 'bg-info text-info-content'
          : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'}"
      >
        <Bookmark class="size-4" aria-hidden="true" />
        <span>Wishlist</span>
      </a>
    </nav>
    {#if collection === 'my-teams'}
      <Button href={resolve('my-teams/new')} variant="quiet" size="compact">
        <Plus class="size-4" aria-hidden="true" />
        <span>Add custom team</span>
      </Button>
    {/if}
  </div>
</header>
