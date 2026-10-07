<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import {
    bestEvidence,
    evidenceGrade,
    regulationLabel,
    type Team,
  } from '$lib/catalog';
  import { getPokemonTypes, TYPE_COLORS } from '$lib/types';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    team,
    currentRegulation,
    showRegulation,
    query,
  }: {
    team: Team;
    currentRegulation: string;
    showRegulation: boolean;
    query: string;
  } = $props();
  const result = $derived(bestEvidence(team, currentRegulation));
  const grade = $derived(evidenceGrade(result.level));

  function open(event: MouseEvent) {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void goto(resolve(`/teams/${team.id}${query}`), {
      state: { fromCatalog: true },
    });
  }
</script>

<article
  class="plate relative min-w-0 overflow-hidden transition-colors duration-200 hover:border-primary"
>
  <a
    href={resolve(`/teams/${team.id}${query}`)}
    onclick={open}
    class="block rounded-[inherit] p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
  >
    {#if team.creator.trim()}
      <p class="text-sm font-semibold wrap-break-word">{team.creator}</p>
    {/if}
    <ul class="mt-3 grid grid-cols-3 gap-x-2 gap-y-3" aria-label="Team members">
      {#each team.members as member, index (index)}
        <li
          class="flex min-w-0 flex-col items-center px-0.5 text-center"
          style="--type-color: {TYPE_COLORS[
            getPokemonTypes(member.pokemon)[0]
          ]}"
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
    <h2
      class="mt-3 text-sm leading-snug font-bold tracking-[-0.02em] wrap-break-word text-secondary-text"
    >
      {team.name}
    </h2>
    <div
      class="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
    >
      {#if showRegulation}<span class="term"
          >{regulationLabel(team.regulation)}</span
        >{/if}
      <span class="provenance ml-auto">{team.publishedAt}</span>
    </div>
    <div class="mt-3.5 flex items-start justify-between gap-3 border-t pt-2.5">
      <div class="min-w-0">
        <span class="stamp" data-grade={grade}>{result.label}</span>
        {#if result.platform !== 'Unknown' || result.event.trim()}
          <div
            class="mt-1.5 grid gap-0.5 text-xs leading-relaxed wrap-break-word"
          >
            {#if result.platform !== 'Unknown'}<p class="text-secondary-text">
                {result.platform}
              </p>{/if}
            {#if result.event.trim() && result.event !== result.platform}<p
                class="text-muted"
              >
                {result.event}
              </p>{/if}
          </div>
        {/if}
      </div>
      <ArrowUpRight
        class="mt-0.5 size-4 shrink-0 text-muted"
        aria-hidden="true"
      />
    </div>
  </a>
</article>
