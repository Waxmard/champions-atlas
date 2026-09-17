<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import { bestEvidence, type Team } from '$lib/catalog';
  import { getCardBackgroundStyle } from '$lib/types';
  import ItemIcon from './ItemIcon.svelte';
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
  class="group rounded-2xl border bg-card transition-[box-shadow,border-color] duration-200 hover:border-primary/40 hover:shadow-md"
>
  <a
    href={resolve(`/teams/${team.id}${query}`)}
    onclick={open}
    class="block rounded-2xl p-5 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
  >
    <div class="mb-4 flex items-start justify-between gap-2">
      <div class="flex flex-wrap gap-1.5">
        <span class="rounded-md bg-secondary px-2 py-1 text-xs font-semibold"
          >Reg {team.regulation}</span
        >
        {#if team.regulation === currentRegulation}<span
            class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
            >Current regulation</span
          >{/if}
        {#if result.level <= 2}<span
            class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
            >Strong evidence</span
          >{/if}
      </div>
      <span class="text-xs text-muted-foreground">{team.publishedAt}</span>
    </div>
    <h2
      class="line-clamp-2 min-h-12 text-base leading-6 font-semibold tracking-tight"
    >
      {team.name}
    </h2>
    <p class="mt-1 truncate text-xs text-muted-foreground">
      {team.creator || 'Creator not listed'}
    </p>
    <ul class="my-5 grid grid-cols-3 gap-2" aria-label="Team members">
      {#each team.members as member, index (index)}
        <li
          class="flex min-w-0 flex-col items-center rounded-lg border border-border/50 bg-secondary/40 px-2 py-2.5 text-center transition-all duration-200 hover:border-primary/40 hover:shadow-2xs"
          style={getCardBackgroundStyle(member.pokemon, true)}
        >
          <PokemonSprite pokemon={member.pokemon} />
          <p class="mt-1 text-xs font-semibold wrap-break-word">
            {member.pokemon}
          </p>
          <p
            class="mt-1 flex items-center justify-center gap-1 text-xs wrap-break-word text-muted-foreground"
          >
            {#if member.item}<ItemIcon item={member.item} />{/if}{member.item ||
              'Item unknown'}
          </p>
        </li>
      {/each}
    </ul>
    <div class="flex min-h-9 items-center justify-between gap-3 border-t pt-3">
      <div class="min-w-0">
        <p
          class:text-primary={result.level <= 2}
          class="truncate text-xs font-medium"
        >
          {result.label}
        </p>
        {#if result.event}<p
            class="mt-0.5 truncate text-xs text-muted-foreground"
            title={result.event}
          >
            {result.event}
          </p>{/if}
      </div>
      <ArrowUpRight
        class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden="true"
      />
    </div>
  </a>
</article>
