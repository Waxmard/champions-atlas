<script lang="ts">
  import PokemonPicker from '#lib/components/PokemonPicker.svelte';
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { regulationLabel, type Member, type Team } from '#lib/catalog.js';
  import { ladderShares } from '#lib/ladder.js';
  import {
    swapIdeas,
    swapSuggestions,
    swapTargets,
    type SwapSuggestion,
  } from '#lib/swap-suggestions.js';
  import type { TeamTagsIndex } from '#lib/tags.js';
  import type { SavedTeam } from '#lib/workbench.js';

  interface Props {
    members: Member[];
    teams: Team[];
    currentRegulation: string;
    tags?: TeamTagsIndex;
    favoriteTeams?: SavedTeam[];
    disabled: boolean;
    onapply: (slot: number, member: Member) => boolean;
  }

  let {
    members,
    teams,
    currentRegulation,
    tags,
    favoriteTeams = [],
    disabled,
    onapply,
  }: Props = $props();
  let query = $state('');
  let visibleCount = $state(4);
  const regulation = $derived(regulationLabel(currentRegulation));
  const ideas = $derived(
    swapIdeas(
      members,
      teams,
      currentRegulation,
      tags,
      4,
      favoriteTeams,
      ladderShares(currentRegulation),
      true
    )
  );
  const searched = $derived(
    query
      ? swapSuggestions(
          members,
          teams,
          currentRegulation,
          query,
          tags,
          favoriteTeams
        )
      : []
  );
  const options = $derived(
    swapTargets(members, teams, currentRegulation, favoriteTeams)
  );
  const swapRowKey = (row: SwapSuggestion) =>
    `${row.slot}:${row.favorite ? 'fav:' + (row.favoriteTeamName ?? '') : 'cat'}:${row.pokemon}:${row.member.item ?? ''}:${row.member.ability ?? ''}:${row.member.nature ?? ''}:${row.member.spread ?? ''}:${row.member.moves.join(',')}`;
  const detail = (row: SwapSuggestion) =>
    [
      `Replaces ${members[row.slot]?.pokemon ?? `slot ${row.slot + 1}`}`,
      row.favorite
        ? row.favoriteTeamName
          ? `Favorite (${row.favoriteTeamName})`
          : 'Favorite'
        : '',
      row.member.item,
      row.member.ability,
      row.member.nature,
    ]
      .filter(Boolean)
      .join(' · ');
  function apply(slot: number, member: Member) {
    if (onapply(slot, $state.snapshot(member))) query = '';
  }
</script>

<div class="min-w-0 space-y-2">
  {#if ideas.length || searched.length}
    <p class="provenance max-w-[68ch]">
      Suggestions are built from catalog teams and {regulation} ladder pairings. Applying
      one replaces the whole set.
    </p>
  {/if}
  {#if disabled}
    <p class="provenance">Finish editing or fix team text to apply a swap.</p>
  {/if}
  <SuggestionList
    id="swap-suggestions"
    label="Suggested swaps"
    count={ideas.length}
    empty="No catalog team or ladder pairing fits this team yet. Pick a specific Pokémon below."
    hasMore={ideas.length > visibleCount}
    onshowmore={() => (visibleCount += 5)}
  >
    {#each ideas.slice(0, visibleCount) as idea (swapRowKey(idea))}
      <SuggestionRow
        label={`Use ${idea.member.pokemon} set for slot ${idea.slot + 1}`}
        glyph={{ kind: 'pokemon', value: idea.member.pokemon }}
        primary={idea.member.pokemon}
        secondary={detail(idea)}
        {disabled}
        onclick={() => apply(idea.slot, idea.member)}
      />
    {/each}
  </SuggestionList>
  <div class="min-w-0 space-y-2 pt-2">
    <h3 class="term">Swap in a specific Pokémon</h3>
    <PokemonPicker
      portal={false}
      {options}
      onselect={(pokemon) => (query = pokemon)}
      {disabled}
      label="Swap in a specific Pokémon"
      placeholder="Choose a Pokémon to swap in…"
      disabledPlaceholder="Finish editing first"
    />
    {#if query}
      <div class="flex items-center justify-between gap-2">
        <span class="term min-w-0 truncate">{query}</span>
        <Button variant="quiet" {disabled} onclick={() => (query = '')}
          >Clear</Button
        >
      </div>
      <SuggestionList
        id="swap-search-suggestions"
        label={`Swap suggestions for ${query}`}
        count={searched.length}
        empty={`No usable current ${regulation} set with ${query} for this team.`}
      >
        {#each searched as row (swapRowKey(row))}
          <SuggestionRow
            label={`Use ${row.member.pokemon} set for slot ${row.slot + 1}`}
            glyph={{ kind: 'pokemon', value: row.member.pokemon }}
            primary={row.member.pokemon}
            secondary={detail(row)}
            {disabled}
            onclick={() => apply(row.slot, row.member)}
          />
        {/each}
      </SuggestionList>
    {/if}
  </div>
</div>
