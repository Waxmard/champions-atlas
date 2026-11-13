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
    morphId,
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
    morphId?: string;
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
<article
  class="plate relative flex min-w-0 flex-col overflow-hidden transition-[border-color,scale] duration-200 hover:border-primary has-[>a:active]:scale-[0.985]"
  data-team-card={morphId ?? team.id}
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
