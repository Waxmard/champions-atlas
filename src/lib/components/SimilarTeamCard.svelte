<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import PokemonSprite from './PokemonSprite.svelte';
  import { Button } from './ui/button';
  import { bestEvidence } from '$lib/catalog';
  import type { Recommendation } from '$lib/workbench';

  let {
    result,
    current,
    editing,
    onselect,
  }: {
    result: Recommendation;
    current: string;
    editing: boolean;
    onselect: (id: string) => void;
  } = $props();

  const evidence = $derived(bestEvidence(result.team, current));
</script>

<article
  class="min-w-0 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
>
  <p class="text-xs text-primary">
    Source: {result.shared}/6 Pokémon shared · {result.details} matching set details
    · {result.team.regulation}
  </p>
  <div class="mt-2 flex items-center gap-3">
    {#if result.member}
      <PokemonSprite pokemon={result.member.pokemon} size={32} />
    {:else}
      <ul class="grid shrink-0 grid-cols-3 gap-1" aria-label="Team members">
        {#each result.team.members as member (member.pokemon)}
          <li><PokemonSprite pokemon={member.pokemon} size={24} /></li>
        {/each}
      </ul>
    {/if}
    <h3
      class="flex min-w-0 flex-wrap items-center gap-1 font-semibold wrap-break-word"
    >
      {#if result.member}
        {result.member.pokemon} · {#if result.member.item}<ItemIcon
            item={result.member.item}
          />{/if}{result.member.item || 'Item unknown'}
      {:else}
        {result.team.name}
      {/if}
    </h3>
  </div>
  <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
    {#if result.team.regulation === current}
      <span
        class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
        >Current regulation</span
      >
    {/if}
    {#if evidence.level <= 2}
      <span
        class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
        >Strong evidence</span
      >
    {/if}
  </div>
  {#if result.member}
    <p class="mt-2 text-xs text-muted-foreground">
      {result.member.moves.join(' · ') || 'Moves unknown'}
    </p>
    <p class="mt-2 text-xs">From {result.team.name}</p>
  {/if}
  <p class="mt-2 text-xs leading-5 text-muted-foreground">
    {result.team.members.map((member) => member.pokemon).join(' · ')}
  </p>
  <p class="mt-3 text-xs">
    {evidence.label} · {evidence.event || 'No event reported'}
  </p>
  {#if !result.team.paste}
    <p class="mt-2 text-xs text-muted-foreground">Set details incomplete.</p>
  {/if}
  <Button
    variant="outline"
    class="mt-4 min-h-11"
    disabled={editing}
    onclick={() => onselect(result.id)}
  >
    {result.member
      ? `Compare ${result.member.pokemon}`
      : `Compare ${result.team.creator || 'team'}`}
  </Button>
</article>
