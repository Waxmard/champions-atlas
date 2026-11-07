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
  const optionKey = (option: PokemonSuggestion) =>
    `${option.favorite ? 'fav:' + (option.favoriteTeamName ?? '') : 'cat'}:${option.pokemon}:${option.member.item ?? ''}:${option.member.ability ?? ''}:${option.member.nature ?? ''}:${option.member.spread ?? ''}:${option.member.moves.join(',')}`;
</script>

<SuggestionList
  id="set-pokemon-suggestions"
  label="Pokémon suggestions"
  count={options.length}
  moreLabel="Show 10 more"
  {hasMore}
  {onshowmore}
>
  {#each options as option (optionKey(option))}
    <SuggestionRow
      label={`Use ${option.pokemon} set`}
      glyph={{ kind: 'pokemon', value: option.pokemon }}
      primary={option.pokemon}
      secondary={[
        option.favorite
          ? option.favoriteTeamName
            ? `Favorite (${option.favoriteTeamName})`
            : 'Favorite'
          : '',
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
