<script lang="ts">
  import { tick } from 'svelte';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import PokemonPicker from '#lib/components/PokemonPicker.svelte';
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    bestEvidence,
    regulationLabel,
    sourceName,
    type Member,
    type Team,
  } from '#lib/catalog.js';
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
    open?: boolean;
  }

  let {
    members,
    teams,
    currentRegulation,
    tags,
    favoriteTeams = [],
    disabled,
    onapply,
    open = $bindable(false),
  }: Props = $props();
  let query = $state('');
  let summary = $state<HTMLElement>();
  const regulation = $derived(regulationLabel(currentRegulation));
  const ideas = $derived(
    swapIdeas(members, teams, currentRegulation, tags, 4, favoriteTeams)
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
  const evidence = (item: SwapSuggestion) =>
    [
      sourceName(item.source, currentRegulation),
      bestEvidence(item.source, currentRegulation).label,
    ]
      .filter(Boolean)
      .join(' · ');
  async function apply(slot: number, member: Member) {
    if (!onapply(slot, $state.snapshot(member))) return;
    query = '';
    await tick();
    summary?.focus();
  }
</script>

{#snippet swapContent(item: SwapSuggestion)}
  {@const supporting = evidence(item)}
  <span class="flex min-w-0 flex-1 flex-col gap-1">
    <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <span class="term shrink-0">Slot {item.slot + 1}</span>
      <span class="truncate text-base-content/70"
        >{members[item.slot]?.pokemon}</span
      >
      <span aria-hidden="true">→</span>
      <SpeciesLabel pokemon={item.member.pokemon} spriteSize={28} />
    </span>
    <span class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      {#if item.member.item}
        <span class="term inline-flex min-w-0 items-center gap-1">
          <ItemIcon item={item.member.item} size={16} />
          <span class="truncate">{item.member.item}</span>
        </span>
      {/if}
      {#each [item.member.ability, item.member.nature] as detail, index (index)}
        {#if detail}<span class="term truncate">{detail}</span>{/if}
      {/each}
      {#if item.member.moves.length}<span class="term truncate"
          >{item.member.moves.join(' · ')}</span
        >{/if}
      <span class="term shrink-0">{item.sharedTeammates} shared</span>
    </span>
    <span class="provenance">
      {#if item.favorite}
        Favorite{item.favoriteTeamName ? ` — ${item.favoriteTeamName}` : ''}
      {:else}
        {item.consensus
          ? `${item.consensusSupport} teams share this set`
          : `Assembled from ${item.support} team${item.support === 1 ? '' : 's'}`}
        {supporting ? `— best supporting: ${supporting}` : ''}
      {/if}
    </span>
  </span>
{/snippet}

<details bind:open class="min-w-0">
  <summary
    bind:this={summary}
    id="swap-suggestions-toggle"
    class="min-h-11 cursor-pointer content-center text-sm font-medium text-base-content/70"
  >
    Suggested swaps
  </summary>
  {#if open}
    <div class="min-w-0 space-y-2 pb-2">
      {#if ideas.length || searched.length}
        <p class="provenance max-w-[68ch]">
          Suggestions are built from current {regulation} teams. Applying one replaces
          the whole set.
        </p>
      {/if}
      {#if disabled}
        <p class="provenance">
          Finish editing or fix team text to apply a swap.
        </p>
      {/if}
      <SuggestionList
        id="swap-suggestions"
        label="Suggested swaps"
        count={ideas.length}
        empty={`No strong current ${regulation} swap fits this team yet. Pick a specific Pokémon below.`}
      >
        {#each ideas as idea (swapRowKey(idea))}
          <SuggestionRow
            label={`Use ${idea.member.pokemon} set for slot ${idea.slot + 1}`}
            {disabled}
            onclick={() => apply(idea.slot, idea.member)}
          >
            {@render swapContent(idea)}
          </SuggestionRow>
        {/each}
      </SuggestionList>
      <details class="min-w-0">
        <summary
          class="min-h-11 cursor-pointer content-center text-sm font-medium text-base-content/70"
        >
          Swap in a specific Pokémon
        </summary>
        <div class="min-w-0 space-y-2 pt-2">
          <PokemonPicker
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
                  {disabled}
                  onclick={() => apply(row.slot, row.member)}
                >
                  {@render swapContent(row)}
                </SuggestionRow>
              {/each}
            </SuggestionList>
          {/if}
        </div>
      </details>
    </div>
  {/if}
</details>
