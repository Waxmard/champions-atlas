<script lang="ts">
  import { tick } from 'svelte';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { type Team } from '#lib/catalog.js';
  import { savedTeamHeading } from '#lib/team-collections.js';
  import type { SavedTeam } from '#lib/workbench.js';
  import AtlasIcon from './AtlasIcon.svelte';
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
  }: {
    collection?: 'wishlist' | 'favorites';
    entries: SavedTeam[];
    disabled: boolean;
    sortable: boolean;
    displayTeam: (entry: SavedTeam) => Team;
    onuse: (entry: SavedTeam) => void;
    onremove: (entry: SavedTeam) => void;
    onreorder: (orderedIds: string[], expectedIds: string[]) => boolean;
  } = $props();
  const label = $derived(collection === 'favorites' ? 'Favorites' : 'Wishlist');

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
    <li class="min-w-0" data-wishlist-id={entry.id}>
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
      <TeamCard
        team={displayTeam(entry)}
        {heading}
        titleActions={sortable ? titleActions : undefined}
        showRegulation
        query=""
        href={`${collection}?team=${encodeURIComponent(entry.id)}`}
        fromCatalog={false}
      >
        {#snippet leadingActions()}
          <Button
            data-wishlist-use
            variant="quiet"
            class="min-h-11 ps-0 pe-1.5"
            {disabled}
            onclick={() => onuse(entry)}
          >
            <AtlasIcon />
            <span>My Teams</span>
          </Button>
        {/snippet}
        {#snippet trailingActions()}
          <Button
            variant="quiet"
            size="icon-compact"
            class="size-11"
            aria-label={`Remove from ${label}`}
            title={`Remove from ${label}`}
            {disabled}
            onclick={() => onremove(entry)}
          >
            <Trash2 class="size-4" aria-hidden="true" />
          </Button>
        {/snippet}
      </TeamCard>
    </li>
  {/each}
</ul>
