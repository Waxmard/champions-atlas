<script lang="ts">
  import type { Snippet } from 'svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import { bestEvidence, sourceName, type Member } from '#lib/catalog.js';
  import { handleSuggestionKeydown } from '#lib/suggestion-keyboard.js';
  import type { PokemonSuggestion } from '#lib/swap-suggestions.js';

  let {
    options,
    inGameSuggestion,
    currentRegulation,
    onchoose,
    onclosesuggestions,
  }: {
    options: PokemonSuggestion[];
    inGameSuggestion?: Snippet;
    currentRegulation: string;
    onchoose: (member: Member) => void;
    onclosesuggestions: () => void;
  } = $props();
</script>

<section
  id="set-pokemon-suggestions"
  aria-label="Pokémon suggestions"
  class="plate max-h-72 divide-y overflow-y-auto"
>
  <div class="term px-3 py-1.5">Pokémon suggestions</div>
  <ul role="list" class="divide-y">
    {#if inGameSuggestion}
      {@render inGameSuggestion()}
    {/if}
    {#each options as option (option.pokemon)}
      {@const evidence = [
        sourceName(option.source, currentRegulation),
        bestEvidence(option.source, currentRegulation).label,
      ]
        .filter(Boolean)
        .join(' · ')}
      <li>
        <button
          type="button"
          aria-label={`Use ${option.pokemon} set`}
          class="option-row"
          data-set-choice
          data-suggestion
          onpointerdown={(event) => event.preventDefault()}
          onkeydown={(event) =>
            handleSuggestionKeydown(
              event,
              document.getElementById('set-pokemon-suggestions'),
              'set-pokemon-input',
              onclosesuggestions
            )}
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
            <span class="provenance mt-0.5 block">
              {option.consensus
                ? `${option.consensusSupport} teams share this set`
                : `Assembled from ${option.support} team${option.support === 1 ? '' : 's'}`}{evidence
                ? ` — best supporting: ${evidence}`
                : ''}
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
