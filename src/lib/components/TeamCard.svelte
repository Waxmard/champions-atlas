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
  import { getPokemonTypes, TYPE_COLORS } from '#lib/types.js';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    team,
    currentRegulation,
    showRegulation,
    query,
    actions,
    detailId = team.id,
  }: {
    team: Team;
    currentRegulation: string;
    showRegulation: boolean;
    query: string;
    actions?: Snippet;
    detailId?: string | null;
  } = $props();
  const custom = $derived(isCustomRulesTeam(team));
  const source = $derived(sourceName(team, currentRegulation));

  function open(event: MouseEvent) {
    if (
      detailId === null ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void goto(resolve(`teams/${detailId}${query}`), {
      state: { fromCatalog: true },
    });
  }
</script>

{#snippet content()}
  <div class="flex items-baseline justify-between gap-3">
    {#if showRegulation}<span class="term"
        >{regulationLabel(team.regulation)}</span
      >{/if}
    <span class="provenance ms-auto shrink-0">{team.publishedAt}</span>
  </div>
  <h2 class="mt-1.5 text-lg leading-tight font-extrabold wrap-break-word">
    {team.name}
  </h2>
  <ul class="mt-3.5 grid grid-cols-3 gap-x-2 gap-y-3" aria-label="Team members">
    {#each team.members as member, index (index)}
      <li
        class="flex min-w-0 flex-col items-center px-0.5 text-center"
        style="--type-color: {TYPE_COLORS[getPokemonTypes(member.pokemon)[0]]}"
      >
        <div class="roster-sprite">
          <PokemonSprite pokemon={member.pokemon} size={40} />
        </div>
        <p class="mt-1 text-[0.8125rem] leading-tight wrap-break-word">
          {member.pokemon}
        </p>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet resultEvidence()}
  <div class="min-w-0">
    {#if detailId !== null || source !== 'Listed in the catalog'}
      <span class="stamp" data-grade="source">{source}</span>
    {/if}
    {#if custom}<p class="term mt-1">Custom rules</p>{/if}
  </div>
{/snippet}

<article
  class="plate relative flex min-w-0 flex-col overflow-hidden transition-colors duration-200 hover:border-primary"
>
  {#if detailId !== null}
    <a
      href={resolve(`teams/${detailId}${query}`)}
      onclick={open}
      class="block flex-1 rounded-[inherit] p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      {@render content()}
    </a>
  {:else}
    <div class="flex-1 p-4">{@render content()}</div>
  {/if}
  <div
    class="mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-2.5"
  >
    {#if detailId !== null}
      <a
        href={resolve(`teams/${detailId}${query}`)}
        onclick={open}
        class="min-w-0 flex-1 rounded-[var(--radius-field)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {@render resultEvidence()}
      </a>
    {:else}
      <div class="min-w-0 flex-1">
        {@render resultEvidence()}
      </div>
    {/if}
    {#if actions}
      <div class="ms-auto flex shrink-0 items-center gap-1.5">
        {@render actions()}
      </div>
    {/if}
  </div>
</article>
