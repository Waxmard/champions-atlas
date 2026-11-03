<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    isCustomRulesTeam,
    regulationLabel,
    type Team,
  } from '#lib/catalog.js';
  import TeamSummary from './TeamSummary.svelte';

  let {
    team,
    showRegulation,
    query,
    actions,
    href,
    fromCatalog = true,
  }: {
    team: Team;
    showRegulation: boolean;
    query: string;
    actions?: Snippet;
    href?: `wishlist?${string}` | `teams/${string}`;
    fromCatalog?: boolean;
  } = $props();
  const custom = $derived(isCustomRulesTeam(team));
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
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    {#if showRegulation}<span class="term"
        >{regulationLabel(team.regulation)}</span
      >{/if}
    {#if custom}<span class="term">Custom rules</span>{/if}
    <span class="provenance ms-auto shrink-0">{team.publishedAt}</span>
  </div>
  <TeamSummary name={team.name} members={team.members} />
{/snippet}
<article
  class="plate relative flex min-w-0 flex-col overflow-hidden transition-colors duration-200 hover:border-primary"
>
  <a
    href={resolve(destination)}
    onclick={open}
    class="block flex-1 rounded-[inherit] p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
  >
    {@render content()}
  </a>
  {#if actions}
    <div
      class="mx-4 flex flex-wrap items-center justify-between gap-2 border-t py-2"
    >
      {@render actions()}
    </div>
  {/if}
</article>
