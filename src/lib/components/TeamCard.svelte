<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    isCustomRulesTeam,
    regulationLabel,
    sourceName,
    type Team,
  } from '#lib/catalog.js';
  import TeamSummary from './TeamSummary.svelte';

  let {
    team,
    currentRegulation,
    showRegulation,
    query,
    actions,
    href,
    fromCatalog = true,
    showListedSource = true,
  }: {
    team: Team;
    currentRegulation: string;
    showRegulation: boolean;
    query: string;
    actions?: Snippet;
    href?: `wishlist?${string}` | `teams/${string}`;
    fromCatalog?: boolean;
    showListedSource?: boolean;
  } = $props();
  const custom = $derived(isCustomRulesTeam(team));
  const source = $derived(sourceName(team, currentRegulation));
  const destination = $derived(href ?? (`teams/${team.id}${query}` as const));
  const showEvidence = $derived(
    showListedSource || source !== 'Listed in the catalog' || custom
  );

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
  <div class="flex items-baseline justify-between gap-3">
    {#if showRegulation}<span class="term"
        >{regulationLabel(team.regulation)}</span
      >{/if}
    <span class="provenance ms-auto shrink-0">{team.publishedAt}</span>
  </div>
  <TeamSummary name={team.name} members={team.members} />
{/snippet}

{#snippet resultEvidence()}
  <div class="min-w-0">
    {#if showListedSource || source !== 'Listed in the catalog'}
      <span class="stamp" data-grade="source">{source}</span>
    {/if}
    {#if custom}<p class="term mt-1">Custom rules</p>{/if}
  </div>
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
  <div
    class="mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-2.5"
  >
    {#if showEvidence}
      <a
        href={resolve(destination)}
        onclick={open}
        class="min-w-0 flex-auto rounded-[var(--radius-field)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {@render resultEvidence()}
      </a>
    {:else}
      <div class="min-w-0 flex-auto"></div>
    {/if}
    {#if actions}
      <div class="ms-auto flex shrink-0 items-center gap-1.5">
        {@render actions()}
      </div>
    {/if}
  </div>
</article>
