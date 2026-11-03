<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Member } from '#lib/catalog.js';
  import { getPokemonTypes, TYPE_COLORS } from '#lib/types.js';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    name,
    members,
    layout = 'card',
    memberHref,
    headingActions,
  }: {
    name: string;
    members: readonly Pick<Member, 'pokemon'>[];
    layout?: 'card' | 'workspace';
    memberHref?: (index: number) => string;
    headingActions?: Snippet;
  } = $props();
</script>

{#snippet memberContent(pokemon: string)}
  <div class="roster-sprite">
    <PokemonSprite {pokemon} size={40} />
  </div>
  <p class="mt-1 w-full text-[0.8125rem] leading-tight wrap-break-word">
    {pokemon}
  </p>
{/snippet}

<div
  class="flex items-start justify-between gap-3 {layout === 'card'
    ? 'mt-1.5'
    : ''}"
>
  <h2 class="min-w-0 flex-1 text-lg leading-[1.4] font-extrabold wrap-anywhere">
    {name}
  </h2>
  {@render headingActions?.()}
</div>
<ul
  class="mt-3.5 grid grid-cols-3 gap-x-2 gap-y-3 {layout === 'workspace'
    ? 'sm:grid-cols-6'
    : ''}"
  aria-label="Team members"
>
  {#each members as member, index (index)}
    <li
      class="flex min-w-0 flex-col items-center px-0.5 text-center"
      style="--type-color: {TYPE_COLORS[getPokemonTypes(member.pokemon)[0]]}"
    >
      {#if memberHref}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- Fragment links stay on the current page. -->
        <a
          href={memberHref(index)}
          class="flex w-full min-w-0 flex-col items-center rounded-[var(--radius-selector)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Go to ${member.pokemon}`}
        >
          {@render memberContent(member.pokemon)}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {:else}
        {@render memberContent(member.pokemon)}
      {/if}
    </li>
  {/each}
</ul>
