<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import { bestEvidence, evidenceGrade, type Team } from '$lib/catalog';
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
    <div class="flex items-baseline justify-between gap-3">
      {#if showRegulation}<span class="term">Reg {team.regulation}</span>{/if}
      <span class="provenance ml-auto shrink-0">{team.publishedAt}</span>
    </div>
    <h2 class="mt-1.5 text-lg leading-tight font-extrabold wrap-break-word">
      {team.name}
    </h2>
    <ul
      class="mt-3.5 grid grid-cols-3 gap-x-2 gap-y-3"
      aria-label="Team members"
    >
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
    <div class="mt-3.5 flex items-start justify-between gap-3 border-t pt-2.5">
      <div class="min-w-0">
        <span class="stamp" data-grade={grade}>{result.label}</span>
      </div>
      <ArrowUpRight
        class="mt-0.5 size-4 shrink-0 text-base-content/60"
        aria-hidden="true"
      />
    </div>
  </a>
</article>
