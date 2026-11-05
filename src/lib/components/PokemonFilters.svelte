<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import {
    browsePokemon,
    getMemberOptions,
    pokemonId,
    type MemberFilter,
    type Team,
  } from '#lib/catalog.js';
  import PokemonPicker from '#lib/components/PokemonPicker.svelte';
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    teams,
    filters,
    onchange,
    expanded = false,
    controlsId,
    actions,
    controls,
  }: {
    teams: Team[];
    filters: MemberFilter[];
    onchange: (filters: MemberFilter[]) => void;
    expanded?: boolean;
    controlsId?: string;
    actions?: Snippet;
    controls?: Snippet;
  } = $props();

  const id = $props.id();
  const allPokemon = $derived(
    [
      ...new Set(
        teams.flatMap((team) =>
          team.members.map((member) => browsePokemon(member.pokemon))
        )
      ),
    ].sort()
  );
  const selectedPokemon = $derived(
    new Set(filters.map((filter) => pokemonId(filter.pokemon)))
  );
  const availablePokemon = $derived(
    allPokemon.filter((pokemon) => !selectedPokemon.has(pokemonId(pokemon)))
  );

  function addPokemon(pokemon: string) {
    pokemon = browsePokemon(pokemon);
    if (filters.length >= 6 || selectedPokemon.has(pokemonId(pokemon))) return;
    onchange([...filters, { pokemon, item: '', ability: '', move: '' }]);
  }

  function updateMember(
    index: number,
    field: 'item' | 'ability' | 'move',
    value: string
  ) {
    onchange(
      filters.map((filter, i) =>
        i === index ? { ...filter, [field]: value } : filter
      )
    );
  }
</script>

<div class="mt-4 flex items-center gap-2">
  <div class="min-w-0 flex-1">
    <span class="sr-only" aria-live="polite"
      >{filters.length} of 6 Pokémon selected</span
    >
    <PokemonPicker
      options={availablePokemon}
      onselect={addPokemon}
      disabled={filters.length >= 6}
    />
  </div>
  {@render actions?.()}
</div>

<div
  id={controlsId}
  class={filters.length || (expanded && controls)
    ? 'mt-2 space-y-3'
    : undefined}
>
  {#if expanded && controls}
    {@render controls()}
  {/if}
  {#if filters.length}
    <div class="flex flex-wrap items-start gap-2">
      {#each filters as filter, index (filter.pokemon)}
        <div
          role="group"
          aria-label={`${filter.pokemon} constraints`}
          class="max-w-full min-w-0 border border-base-300 bg-base-100 ps-2 pe-1 {expanded
            ? 'w-full sm:w-auto'
            : ''}"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 text-sm font-semibold wrap-break-word">
              <SpeciesLabel pokemon={filter.pokemon} spriteSize={24} />
            </span>
            <Button
              type="button"
              variant="quiet"
              size="icon-compact"
              class="shrink-0"
              aria-label={`Remove ${filter.pokemon}`}
              onclick={() => onchange(filters.filter((_, i) => i !== index))}
              ><X class="size-4" aria-hidden="true" /></Button
            >
          </div>
          {#if expanded}
            {@const items = getMemberOptions(teams, filter.pokemon, 'item')}
            {@const abilities = getMemberOptions(
              teams,
              filter.pokemon,
              'ability'
            )}
            {@const moves = getMemberOptions(teams, filter.pokemon, 'move')}
            <div class="grid grid-cols-2 gap-2 pe-1 pb-2 sm:grid-cols-3">
              <label for={`${id}-item-${index}`} class="term min-w-0"
                >Held item
                <select
                  id={`${id}-item-${index}`}
                  class="select mt-1 min-h-11 w-full text-base sm:text-sm"
                  value={filter.item}
                  onchange={(event) =>
                    updateMember(index, 'item', event.currentTarget.value)}
                >
                  <option value="">Any item</option>
                  {#each items as item (item)}<option value={item}
                      >{item}</option
                    >{/each}
                  {#if filter.item && !items.includes(filter.item)}<option
                      value={filter.item}>{filter.item}</option
                    >{/if}
                </select>
              </label>

              <label for={`${id}-ability-${index}`} class="term min-w-0"
                >Ability
                <select
                  id={`${id}-ability-${index}`}
                  class="select mt-1 min-h-11 w-full text-base sm:text-sm"
                  value={filter.ability}
                  onchange={(event) =>
                    updateMember(index, 'ability', event.currentTarget.value)}
                >
                  <option value="">Any ability</option>
                  {#if filter.ability && !abilities.includes(filter.ability)}<option
                      value={filter.ability}>{filter.ability}</option
                    >{/if}
                  {#each abilities as ability (ability)}<option value={ability}
                      >{ability}</option
                    >{/each}
                </select>
              </label>

              <label
                for={`${id}-move-${index}`}
                class="term col-span-2 min-w-0 sm:col-span-1"
                >Move
                <select
                  id={`${id}-move-${index}`}
                  class="select mt-1 min-h-11 w-full text-base sm:text-sm"
                  value={filter.move}
                  onchange={(event) =>
                    updateMember(index, 'move', event.currentTarget.value)}
                >
                  <option value="">Any move</option>
                  {#if filter.move && !moves.includes(filter.move)}<option
                      value={filter.move}>{filter.move}</option
                    >{/if}
                  {#each moves as move (move)}<option value={move}
                      >{move}</option
                    >{/each}
                </select>
              </label>
            </div>
          {:else if filter.item || filter.ability || filter.move}
            <div
              class="flex flex-wrap gap-x-2 pe-1 pb-1 text-[0.8125rem] text-base-content/70"
            >
              {#if filter.item}
                <span class="max-w-full wrap-break-word"
                  >Item: {filter.item}</span
                >
              {/if}
              {#if filter.ability}
                <span class="max-w-full wrap-break-word"
                  >Ability: {filter.ability}</span
                >
              {/if}
              {#if filter.move}
                <span class="max-w-full wrap-break-word"
                  >Move: {filter.move}</span
                >
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
