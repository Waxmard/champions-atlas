<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import { bestEvidence, type Team } from '$lib/catalog';
  import { getCardBackgroundStyle } from '$lib/types';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    team,
    currentRegulation,
    query,
  }: { team: Team; currentRegulation: string; query: string } = $props();
  const result = $derived(bestEvidence(team, currentRegulation));

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
  class="group card min-w-0 bg-base-100 transition-[box-shadow,border-color] duration-200 card-border hover:border-primary/40 hover:shadow-sm"
>
  <a
    href={resolve(`/teams/${team.id}${query}`)}
    onclick={open}
    class="block rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <span class="badge badge-soft">Reg {team.regulation}</span>
      <span class="shrink-0 text-xs whitespace-nowrap text-base-content/70"
        >{team.publishedAt}</span
      >
    </div>
    <h2 class="line-clamp-2 text-base leading-6 font-semibold tracking-tight">
      {team.name}
    </h2>
    <p class="mt-1 text-xs wrap-break-word text-base-content/70">
      {team.creator || 'Creator not listed'}
    </p>
    <ul class="my-3 grid grid-cols-3 gap-2" aria-label="Team members">
      {#each team.members as member, index (index)}
        <li
          class="flex min-w-0 flex-col items-center rounded-lg p-1.5 text-center"
          style={getCardBackgroundStyle(member.pokemon, true)}
        >
          <PokemonSprite pokemon={member.pokemon} size={40} />
          <p class="mt-1 text-xs font-semibold wrap-break-word">
            {member.pokemon}
          </p>
        </li>
      {/each}
    </ul>
    <div class="flex items-center justify-between gap-3 border-t pt-3">
      <div class="min-w-0">
        <p
          class:text-primary={result.level <= 2}
          class="truncate text-xs font-medium"
        >
          {result.label}
        </p>
        {#if result.event}<p
            class="mt-0.5 truncate text-xs text-base-content/70"
            title={result.event}
          >
            {result.event}
          </p>{/if}
      </div>
      <ArrowUpRight
        class="size-4 shrink-0 text-base-content/70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden="true"
      />
    </div>
  </a>
</article>
