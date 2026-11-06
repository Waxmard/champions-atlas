<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { Team } from '#lib/catalog.js';
  import type { SavedTeam } from '#lib/workbench.js';
  import AtlasIcon from './AtlasIcon.svelte';
  import TeamCard from './TeamCard.svelte';
  import { Button } from './ui/button/index.js';

  let {
    entries,
    disabled,
    sortable,
    owner,
    displayTeam,
    onuse,
    onremove,
    onreorder,
  }: {
    entries: SavedTeam[];
    disabled: boolean;
    sortable: boolean;
    owner: string | null;
    displayTeam: (entry: SavedTeam) => Team;
    onuse: (entry: SavedTeam) => void;
    onremove: (entry: SavedTeam) => void;
    onreorder: (
      orderedIds: string[],
      expectedIds: string[],
      movedId: string
    ) => boolean;
  } = $props();

  type Marker = {
    id: string;
    after: boolean;
    horizontal: boolean;
    rtl: boolean;
  };
  type Gesture = {
    pointerId: number;
    sourceId: string;
    name: string;
    expectedIds: string[];
    snapshot: string;
    owner: string | null;
    handle: HTMLButtonElement;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    frame: number | null;
  };

  let list: HTMLUListElement;
  let gesture: Gesture | null = null;
  let visual = $state<{
    sourceId: string;
    name: string;
    x: number;
    y: number;
    marker: Marker | null;
  } | null>(null);

  function cancelGesture() {
    const current = gesture;
    if (!current) return;
    gesture = null;
    visual = null;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('visibilitychange', onVisibility);
    if (current.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancelGesture();
  }

  function onVisibility() {
    if (document.visibilityState !== 'visible') cancelGesture();
  }

  $effect(() => {
    const snapshot = JSON.stringify(entries);
    const currentOwner = owner;
    const blocked = disabled || !sortable;
    if (
      gesture &&
      (blocked ||
        gesture.owner !== currentOwner ||
        gesture.snapshot !== snapshot)
    )
      cancelGesture();
  });

  onDestroy(cancelGesture);

  function focusMoved(id: string, control: 'handle' | 'up' | 'down') {
    void tick().then(() => {
      const item = Array.from(
        list?.querySelectorAll<HTMLElement>('[data-wishlist-id]') ?? []
      ).find((candidate) => candidate.dataset.wishlistId === id);
      const requested = item?.querySelector<HTMLButtonElement>(
        `[data-wishlist-control="${control}"]`
      );
      const handle = item?.querySelector<HTMLButtonElement>(
        '[data-wishlist-control="handle"]'
      );
      (requested && !requested.disabled ? requested : handle)?.focus({
        preventScroll: true,
      });
      item?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function move(entry: SavedTeam, direction: -1 | 1) {
    if (disabled || !sortable || gesture) return;
    const expectedIds = entries.map(({ id }) => id);
    const index = expectedIds.indexOf(entry.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= expectedIds.length) return;
    const orderedIds = [...expectedIds];
    [orderedIds[index], orderedIds[next]] = [
      orderedIds[next],
      orderedIds[index],
    ];
    if (onreorder(orderedIds, expectedIds, entry.id))
      focusMoved(entry.id, direction < 0 ? 'up' : 'down');
  }

  function targetAt(
    current: Gesture
  ): { ids: string[]; marker: Marker } | null {
    if (!list || !list.getClientRects().length) return null;
    const bounds = list.getBoundingClientRect();
    const { x, y } = current;
    if (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom ||
      x < 0 ||
      x > window.innerWidth ||
      y < 0 ||
      y > window.innerHeight
    )
      return null;

    let target: HTMLLIElement | undefined;
    for (const hit of document.elementsFromPoint(x, y)) {
      const item = hit.closest<HTMLLIElement>('[data-wishlist-id]');
      if (item?.parentElement === list) {
        target = item;
        break;
      }
    }
    if (!target) {
      let closest = Infinity;
      for (const item of list.querySelectorAll<HTMLLIElement>(
        ':scope > [data-wishlist-id]'
      )) {
        const rect = item.getBoundingClientRect();
        const dx = Math.max(rect.left - x, 0, x - rect.right);
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);
        const distance = dx * dx + dy * dy;
        if (distance < closest) {
          closest = distance;
          target = item;
        }
      }
    }
    const id = target?.dataset.wishlistId;
    if (!target || !id || id === current.sourceId) return null;
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(list);
    const horizontal = style.gridTemplateColumns.trim().split(/\s+/).length > 1;
    const rtl = style.direction === 'rtl';
    const after = horizontal
      ? rtl
        ? x < (rect.left + rect.right) / 2
        : x >= (rect.left + rect.right) / 2
      : y >= (rect.top + rect.bottom) / 2;
    const ids = current.expectedIds.filter(
      (entryId) => entryId !== current.sourceId
    );
    const index = ids.indexOf(id);
    if (index < 0) return null;
    ids.splice(index + Number(after), 0, current.sourceId);
    if (
      ids.every(
        (entryId, position) => entryId === current.expectedIds[position]
      )
    )
      return null;
    return { ids, marker: { id, after, horizontal, rtl } };
  }

  function animate() {
    const current = gesture;
    if (!current || !current.active) return;
    if (!list?.getClientRects().length) {
      cancelGesture();
      return;
    }
    visual = {
      sourceId: current.sourceId,
      name: current.name,
      x: current.x,
      y: current.y,
      marker: targetAt(current)?.marker ?? null,
    };
    const edge = 64;
    const speed =
      current.y < edge
        ? -12 * Math.min(1, (edge - current.y) / edge)
        : current.y > window.innerHeight - edge
          ? 12 * Math.min(1, (current.y - (window.innerHeight - edge)) / edge)
          : 0;
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const nextScroll = Math.max(0, Math.min(maxScroll, window.scrollY + speed));
    if (nextScroll !== window.scrollY)
      window.scrollTo({
        left: window.scrollX,
        top: nextScroll,
        behavior: 'instant',
      });
    current.frame = requestAnimationFrame(animate);
  }

  function startPointer(event: PointerEvent, entry: SavedTeam) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      gesture ||
      disabled ||
      !sortable
    )
      return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLButtonElement;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    gesture = {
      pointerId: event.pointerId,
      sourceId: entry.id,
      name: entry.name,
      expectedIds: entries.map(({ id }) => id),
      snapshot: JSON.stringify(entries),
      owner,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      frame: null,
    };
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function movePointer(event: PointerEvent) {
    const current = gesture;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    if (
      !current.active &&
      Math.hypot(current.x - current.startX, current.y - current.startY) >= 6
    ) {
      current.active = true;
      animate();
    }
  }

  function finishPointer(event: PointerEvent) {
    const current = gesture;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    const proposal =
      current.active &&
      !disabled &&
      sortable &&
      owner === current.owner &&
      JSON.stringify(entries) === current.snapshot
        ? targetAt(current)
        : null;
    cancelGesture();
    if (
      proposal &&
      onreorder(proposal.ids, current.expectedIds, current.sourceId)
    )
      focusMoved(current.sourceId, 'handle');
  }

  function cancelPointer(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) cancelGesture();
  }
</script>

<ul bind:this={list} class="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
  {#each entries as entry, index (entry.id)}
    <li
      class="relative min-w-0"
      class:opacity-50={visual?.sourceId === entry.id}
      data-wishlist-id={entry.id}
    >
      {#if visual?.marker?.id === entry.id}
        <span
          aria-hidden="true"
          class="pointer-events-none absolute z-20 rounded-full bg-primary {visual
            .marker.horizontal
            ? `inset-y-0 w-1 ${visual.marker.after !== visual.marker.rtl ? '-right-1.5' : '-left-1.5'}`
            : `inset-x-0 h-1 ${visual.marker.after ? '-bottom-1.5' : '-top-1.5'}`}"
        ></span>
      {/if}
      {#if sortable}
        <div class="flex justify-end">
          <Button
            variant="quiet"
            size="icon-compact"
            class="size-11 cursor-grab touch-none select-none [-webkit-user-select:none] {visual?.sourceId ===
            entry.id
              ? 'cursor-grabbing'
              : ''}"
            data-wishlist-control="handle"
            aria-label={`Drag to reorder ${entry.name}`}
            title={`Drag to reorder ${entry.name}`}
            disabled={disabled ||
              (visual !== null && visual.sourceId !== entry.id)}
            onpointerdown={(event) => startPointer(event, entry)}
            onpointermove={movePointer}
            onpointerup={finishPointer}
            onpointercancel={cancelPointer}
            onlostpointercapture={cancelPointer}
          >
            <GripVertical class="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="quiet"
            size="icon-compact"
            class="size-11"
            data-wishlist-control="up"
            aria-label={`Move ${entry.name} up`}
            title={`Move ${entry.name} up`}
            disabled={disabled || visual !== null || index === 0}
            onclick={() => move(entry, -1)}
          >
            <ArrowUp class="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="quiet"
            size="icon-compact"
            class="size-11"
            data-wishlist-control="down"
            aria-label={`Move ${entry.name} down`}
            title={`Move ${entry.name} down`}
            disabled={disabled ||
              visual !== null ||
              index === entries.length - 1}
            onclick={() => move(entry, 1)}
          >
            <ArrowDown class="size-4" aria-hidden="true" />
          </Button>
        </div>
      {/if}
      <div inert={visual !== null}>
        <TeamCard
          team={displayTeam(entry)}
          showRegulation
          query=""
          href={`wishlist?team=${encodeURIComponent(entry.id)}`}
          fromCatalog={false}
        >
          {#snippet leadingActions()}
            <Button
              data-wishlist-use
              variant="quiet"
              class="min-h-11 ps-0 pe-1.5"
              disabled={disabled || visual !== null}
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
              aria-label="Remove from Wishlist"
              title="Remove from Wishlist"
              disabled={disabled || visual !== null}
              onclick={() => onremove(entry)}
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </Button>
          {/snippet}
        </TeamCard>
      </div>
    </li>
  {/each}
</ul>

{#if visual}
  <div
    aria-hidden="true"
    class="plate pointer-events-none fixed z-50 max-w-48 truncate border-primary bg-base-100 px-3 py-2 text-sm font-semibold shadow-lg"
    style:left={`${Math.max(8, Math.min(visual.x + 12, window.innerWidth - 200))}px`}
    style:top={`${Math.max(8, Math.min(visual.y + 12, window.innerHeight - 44))}px`}
  >
    {visual.name}
  </div>
{/if}
