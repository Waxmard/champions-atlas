<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import { dur } from '#lib/motion.js';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Folder from '@lucide/svelte/icons/folder';
  import Star from '@lucide/svelte/icons/star';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { type Team } from '#lib/catalog.js';
  import { recordSummary, savedTeamHeading } from '#lib/team-collections.js';
  import type { SavedTeam } from '#lib/workbench.js';
  import TeamCard from './TeamCard.svelte';
  import { Button } from './ui/button/index.js';

  let {
    collection = 'wishlist',
    entries,
    disabled,
    sortable,
    displayTeam,
    onuse,
    onremove,
    onreorder,
    onfavorite,
  }: {
    collection?: 'wishlist' | 'saved';
    entries: SavedTeam[];
    disabled: boolean;
    sortable: boolean;
    displayTeam: (entry: SavedTeam) => Team;
    onuse?: (entry: SavedTeam) => void;
    onremove: (entry: SavedTeam) => void;
    onreorder: (orderedIds: string[], expectedIds: string[]) => boolean;
    onfavorite?: (entry: SavedTeam) => void;
  } = $props();

  let list: HTMLUListElement;

  function focusMoved(id: string, control: 'up' | 'down') {
    void tick().then(() => {
      const item = list?.querySelector<HTMLElement>(
        `[data-wishlist-id="${CSS.escape(id)}"]`
      );
      const requested = item?.querySelector<HTMLButtonElement>(
        `[data-wishlist-control="${control}"]`
      );
      const opposite = item?.querySelector<HTMLButtonElement>(
        `[data-wishlist-control="${control === 'up' ? 'down' : 'up'}"]`
      );
      const target =
        requested && !requested.disabled
          ? requested
          : opposite && !opposite.disabled
            ? opposite
            : null;
      if (!target) return;
      target.focus({ preventScroll: true });
      item?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function move(entry: SavedTeam, direction: -1 | 1) {
    if (disabled || !sortable) return;
    const expectedIds = entries.map(({ id }) => id);
    const index = expectedIds.indexOf(entry.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= expectedIds.length) return;
    const orderedIds = [...expectedIds];
    [orderedIds[index], orderedIds[next]] = [
      orderedIds[next],
      orderedIds[index],
    ];
    if (onreorder(orderedIds, expectedIds))
      focusMoved(entry.id, direction < 0 ? 'up' : 'down');
  }
</script>

<ul bind:this={list} class="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
  {#each entries as entry, index (entry.id)}
    {@const heading = savedTeamHeading(entry)}
    <li
      class="min-w-0"
      data-wishlist-id={entry.id}
      animate:flip={{ duration: dur(250) }}
      out:fade={{ duration: dur(150) }}
    >
      {#snippet titleActions()}
        <div class="flex gap-2">
          <Button
            variant="quiet"
            size="icon-compact"
            class="size-11"
            data-wishlist-control="up"
            aria-label={`Move ${heading.title} up`}
            title={`Move ${heading.title} up`}
            disabled={disabled || index === 0}
            onclick={() => move(entry, -1)}
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="quiet"
            size="icon-compact"
            class="size-11"
            data-wishlist-control="down"
            aria-label={`Move ${heading.title} down`}
            title={`Move ${heading.title} down`}
            disabled={disabled || index === entries.length - 1}
            onclick={() => move(entry, 1)}
          >
            <ArrowDown class="size-4" aria-hidden="true" />
          </Button>
        </div>
      {/snippet}
      {#snippet useAction()}
        <Button
          data-wishlist-use
          variant="quiet"
          class="min-h-11 ps-0 pe-1.5"
          {disabled}
          data-swipe-right
          onclick={() => onuse?.(entry)}
        >
          <Folder class="size-4" aria-hidden="true" />
          <span>Save</span>
        </Button>
      {/snippet}
      {#snippet useSwipe()}
        <Folder class="size-4" aria-hidden="true" />
        <span>Save</span>
      {/snippet}
      <TeamCard
        team={displayTeam(entry)}
        {heading}
        titleActions={sortable ? titleActions : undefined}
        leadingActions={onuse ? useAction : undefined}
        swipeRight={onuse ? useSwipe : undefined}
        query=""
        href={`${collection}?team=${encodeURIComponent(entry.id)}`}
        fromCatalog={false}
      >
        {#snippet trailingActions()}
          <div class="flex items-center gap-2">
            {#if entry.record}
              {@const summary = recordSummary(entry.record)}
              <span
                class="provenance"
                role="img"
                aria-label={`Record: ${summary.label}`}>{summary.text}</span
              >
            {/if}
            {#if onfavorite}
              <Button
                variant="quiet"
                size="icon-compact"
                class="size-11"
                aria-label="Favorite"
                aria-pressed={!!entry.favorite}
                title={entry.favorite
                  ? 'Remove from favorites'
                  : 'Add to favorites'}
                {disabled}
                onclick={() => onfavorite(entry)}
              >
                <Star
                  class="size-4 {entry.favorite ? 'fill-current' : ''}"
                  aria-hidden="true"
                />
              </Button>
            {/if}
            <Button
              variant="quiet"
              size="icon-compact"
              class="size-11"
              aria-label={collection === 'saved'
                ? 'Delete team'
                : 'Remove from Wishlist'}
              title={collection === 'saved'
                ? 'Delete team'
                : 'Remove from Wishlist'}
              {disabled}
              data-swipe-left
              onclick={() => onremove(entry)}
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </Button>
          </div>
        {/snippet}
        {#snippet swipeLeft()}
          <span>{collection === 'saved' ? 'Delete' : 'Remove'}</span>
          <Trash2 class="size-5" />
        {/snippet}
      </TeamCard>
    </li>
  {/each}
</ul>
