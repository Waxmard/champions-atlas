<script lang="ts">
  import type { Snippet } from 'svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import type { Member } from '$lib/catalog';
  import type { PokemonSuggestion } from '$lib/workbench';

  let {
    options,
    inGameSuggestion,
    onchoose,
  }: {
    options: PokemonSuggestion[];
    inGameSuggestion?: Snippet;
    onchoose: (member: Member) => void;
  } = $props();
</script>

<section
  aria-label="Pokémon suggestions"
  class="plate max-h-72 overflow-y-auto"
>
  <ul role="list" class="divide-y">
    {#if inGameSuggestion}
      {@render inGameSuggestion()}
    {/if}
    {#each options as option (option.pokemon)}
      <li>
        <button
          type="button"
          aria-label={`Use ${option.pokemon} set`}
          class="option-row"
          data-set-choice
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => onchoose(option.member)}
        >
          <PokemonSprite pokemon={option.pokemon} size={32} />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-2">
              <span class="truncate font-semibold">{option.pokemon}</span>
              <span class="term shrink-0">{option.sharedTeammates} shared</span>
            </span>
            <span class="mt-0.5 flex flex-wrap items-baseline gap-x-3">
              {#each [option.member.item, option.member.ability, option.member.nature].filter(Boolean) as field, fieldIndex (fieldIndex)}
                <span class="term truncate">{field}</span>
              {/each}
            </span>
          </span>
        </button>
      </li>
    {/each}
    {#if !options.length && !inGameSuggestion}
      <li class="provenance p-3">No matching suggestions.</li>
    {/if}
  </ul>
</section>
