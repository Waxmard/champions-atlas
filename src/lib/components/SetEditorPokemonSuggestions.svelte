<script lang="ts">
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
  import { type Member } from '#lib/catalog.js';
  import type { PokemonSuggestion } from '#lib/swap-suggestions.js';

  let {
    options,
    hasMore = false,
    onshowmore,
    onchoose,
  }: {
    options: PokemonSuggestion[];
    hasMore?: boolean;
    onshowmore?: () => void;
    onchoose: (member: Member) => void;
  } = $props();
</script>

<SuggestionList
  id="set-pokemon-suggestions"
  label="Pokémon suggestions"
  inputId="set-pokemon-input"
  count={options.length}
  moreLabel="Show 10 more"
  {hasMore}
  {onshowmore}
>
  {#each options as option (option.pokemon)}
    <SuggestionRow
      label={`Use ${option.pokemon} set`}
      glyph={{ kind: 'pokemon', value: option.pokemon }}
      primary={option.pokemon}
      secondary={[
        option.member.item,
        option.member.ability,
        option.member.nature,
      ]
        .filter(Boolean)
        .join(' · ')}
      onclick={() => onchoose(option.member)}
    />
  {/each}
</SuggestionList>
