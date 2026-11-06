<script lang="ts">
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import { type Member } from '#lib/catalog.js';
  import { handleSuggestionKeydown } from '#lib/suggestion-keyboard.js';
  import type { PokemonSuggestion } from '#lib/swap-suggestions.js';

  let {
    options,
    onchoose,
  }: {
    options: PokemonSuggestion[];
    onchoose: (member: Member) => void;
  } = $props();
</script>

<ul
  id="set-pokemon-suggestions"
  role="list"
  aria-label="Pokémon suggestions"
  class="mt-1 divide-y divide-base-300/60"
>
  {#each options as option (option.pokemon)}
    <li>
      <button
        type="button"
        aria-label={`Use ${option.pokemon} set`}
        class="option-row w-full"
        data-set-choice
        data-suggestion
        onpointerdown={(event) => event.preventDefault()}
        onkeydown={(event) =>
          handleSuggestionKeydown(
            event,
            document.getElementById('set-pokemon-suggestions'),
            'set-pokemon-input'
          )}
        onclick={() => onchoose(option.member)}
      >
        <PokemonSprite pokemon={option.pokemon} size={32} />
        <span class="min-w-0 flex-1">
          <span class="truncate font-semibold">{option.pokemon}</span>
          <span class="provenance mt-0.5 block truncate">
            {[option.member.item, option.member.ability, option.member.nature]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
    </li>
  {:else}
    <li class="provenance p-3">No matching suggestions.</li>
  {/each}
</ul>
