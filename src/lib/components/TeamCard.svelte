<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { regulationLabel, teamHeading, type Team } from '#lib/catalog.js';
  import TeamSummary from './TeamSummary.svelte';

  let {
    team,
    heading,
    query,
    titleActions,
    leadingActions,
    trailingActions,
    href,
    fromCatalog = true,
    swipeLeft,
    swipeRight,
    isNew = false,
  }: {
    team: Team;
    heading?: { title: string; context: string };
    query: string;
    titleActions?: Snippet;
    leadingActions?: Snippet;
    trailingActions?: Snippet;
    href?: `wishlist?${string}` | `favorites?${string}` | `teams/${string}`;
    fromCatalog?: boolean;
    swipeLeft?: Snippet;
    swipeRight?: Snippet;
    isNew?: boolean;
  } = $props();
  const resolvedHeading = $derived(heading ?? teamHeading(team.name, team));
  const destination = $derived(href ?? (`teams/${team.id}${query}` as const));
  function open(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void goto(
      resolve(destination),
      fromCatalog ? { state: { fromCatalog: true } } : {}
    );
  }
</script>

{#snippet content()}
  <TeamSummary
    name={resolvedHeading.title}
    context={resolvedHeading.context}
    reserveTitleActions={!!titleActions}
    {isNew}
    members={team.members}
  />
{/snippet}
<div class="relative flex min-w-0 overflow-hidden rounded-box">
  <article
    class="peer plate relative z-1 flex min-w-0 flex-1 touch-pan-y flex-col overflow-hidden transition-[border-color,scale] duration-200 hover:border-primary has-[>a:active]:scale-[0.985]"
    data-swipe-row
  >
    <a
      href={resolve(destination)}
      onclick={open}
      class="block flex-1 rounded-[inherit] p-4 outline-none"
    >
      {@render content()}
    </a>
    {#if titleActions}
      <div class="absolute end-4 top-[1.375rem] z-10">
        {@render titleActions()}
      </div>
    {/if}
    <div
      class="mx-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-t py-2"
    >
      {#if leadingActions}
        <div class="col-start-1">
          {@render leadingActions()}
        </div>
      {/if}
      <div
        class="flex min-w-0 flex-wrap items-baseline gap-2 break-words {leadingActions
          ? 'col-start-2 justify-center text-center'
          : 'col-span-2 col-start-1'}"
      >
        <span class="term">{regulationLabel(team.regulation)}</span>
        {#if team.publishedAt}<span class="provenance">{team.publishedAt}</span
          >{/if}
      </div>
      {#if trailingActions}
        <div class="col-start-3 justify-self-end">
          {@render trailingActions()}
        </div>
      {/if}
    </div>
  </article>
  {#if swipeRight}
    <div
      aria-hidden="true"
      class="absolute inset-1 hidden items-center gap-2 rounded-box bg-success ps-6 text-sm font-semibold text-success-content peer-data-[swipe=right]:flex peer-data-[swipe-armed]:[&_svg]:scale-125"
    >
      {@render swipeRight()}
    </div>
  {/if}
  {#if swipeLeft}
    <div
      aria-hidden="true"
      class="absolute inset-1 hidden items-center justify-end gap-2 rounded-box bg-error pe-6 text-sm font-semibold text-error-content peer-data-[swipe=left]:flex peer-data-[swipe-armed]:[&_svg]:scale-125"
    >
      {@render swipeLeft()}
    </div>
  {/if}
</div>
