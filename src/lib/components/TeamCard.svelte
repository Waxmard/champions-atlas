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
    leadingActions,
    trailingActions,
    href,
    fromCatalog = true,
  }: {
    team: Team;
    showRegulation: boolean;
    query: string;
    leadingActions?: Snippet;
    trailingActions?: Snippet;
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
  {#if leadingActions || trailingActions || showRegulation || custom || team.publishedAt}
    <div
      class="mx-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-t py-2"
    >
      {#if leadingActions}
        <div class="col-start-1">
          {@render leadingActions()}
        </div>
      {/if}
      {#if showRegulation || custom || team.publishedAt}
        <div
          class="flex min-w-0 flex-wrap items-baseline gap-2 break-words {leadingActions
            ? 'col-start-2'
            : 'col-span-2 col-start-1'}"
        >
          {#if showRegulation}<span class="term"
              >{regulationLabel(team.regulation)}</span
            >{/if}
          {#if custom}<span class="term">Custom rules</span>{/if}
          {#if team.publishedAt}<span class="provenance"
              >{team.publishedAt}</span
            >{/if}
        </div>
      {/if}
      {#if trailingActions}
        <div class="col-start-3 justify-self-end">
          {@render trailingActions()}
        </div>
      {/if}
    </div>
  {/if}
</article>
