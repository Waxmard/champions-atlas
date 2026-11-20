<script lang="ts">
  import type { Snippet } from 'svelte';
  import Filter from '@lucide/svelte/icons/filter';
  import X from '@lucide/svelte/icons/x';
  import { browsePokemonNames } from '#lib/battle-forms.js';
  import {
    browsePokemon,
    getMemberOptions,
    pokemonId,
    type MemberFilter,
    type Team,
  } from '#lib/catalog.js';
  import Modal from '#lib/components/Modal.svelte';
  import PokemonPicker from '#lib/components/PokemonPicker.svelte';
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import RemovableChip from '#lib/components/RemovableChip.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    teams,
    filters,
    onchange,
    controls,
    toggles = [],
  }: {
    teams: Team[];
    filters: MemberFilter[];
    onchange: (filters: MemberFilter[]) => void;
    controls?: Snippet;
    toggles?: { label: string; onremove: () => void }[];
  } = $props();

  const id = $props.id();
  const allPokemon = $derived(browsePokemonNames(teams));
  const selectedPokemon = $derived(
    new Set(filters.map((filter) => pokemonId(filter.pokemon)))
  );
  const availablePokemon = $derived(
    allPokemon.filter((pokemon) => !selectedPokemon.has(pokemonId(pokemon)))
  );
  let open = $state(false);
  const count = $derived(
    filters.reduce(
      (sum, { item, ability, move }) =>
        sum +
        Number(!!item.trim()) +
        Number(!!ability.trim()) +
        Number(!!move.trim()),
      0
    ) + toggles.length
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
  {#if controls}
    <Button
      type="button"
      variant="quiet"
      class="shrink-0 max-sm:h-11 max-sm:min-w-11 max-sm:px-1"
      aria-haspopup="dialog"
      onclick={() => (open = true)}
    >
      <Filter class="size-4" aria-hidden="true" />
      <span class="max-sm:sr-only">Filters</span>
      {#if count}<span class="badge badge-primary">{count}</span>{/if}
    </Button>
  {/if}
</div>

{#if filters.length || toggles.length}
  <ul class="mt-2 flex flex-wrap items-center gap-2">
    {#each filters as filter, index (filter.pokemon)}
      {@const count = [filter.item, filter.ability, filter.move].filter(
        Boolean
      ).length}
      <li class="max-w-full min-w-0">
        <RemovableChip
          label={filter.pokemon}
          onremove={() => onchange(filters.filter((_, i) => i !== index))}
        >
          <SpeciesLabel
            pokemon={filter.pokemon}
            spriteSize={24}
            textClass="truncate"
          />
          {#if count}
            <span class="shrink-0 font-normal text-base-content/70"
              ><span aria-hidden="true">· {count}</span><span class="sr-only"
                >, {count} {count === 1 ? 'constraint' : 'constraints'}</span
              ></span
            >
          {/if}
        </RemovableChip>
      </li>
    {/each}
    {#each toggles as toggle (toggle.label)}
      <li class="max-w-full min-w-0">
        <RemovableChip label={toggle.label} onremove={toggle.onremove}>
          <span class="truncate">{toggle.label}</span>
        </RemovableChip>
      </li>
    {/each}
  </ul>
{/if}

{#if open}
  <Modal title="Filters" onclose={() => (open = false)}>
    <div class="space-y-3">
      {@render controls?.()}
      {#each filters as filter, index (filter.pokemon)}
        {@const items = getMemberOptions(teams, filter.pokemon, 'item')}
        {@const abilities = getMemberOptions(teams, filter.pokemon, 'ability')}
        {@const moves = getMemberOptions(teams, filter.pokemon, 'move')}
        <div
          role="group"
          aria-label={`${filter.pokemon} constraints`}
          class="min-w-0 space-y-2 border-t border-base-300 pt-3 first:border-t-0 first:pt-0"
        >
          <div class="flex min-w-0 items-center justify-between gap-2">
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
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                {#each items as item (item)}<option value={item}>{item}</option
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
                {#each moves as move (move)}<option value={move}>{move}</option
                  >{/each}
              </select>
            </label>
          </div>
        </div>
      {:else}
        <p class="provenance">
          Close this pop-up and choose a Pokémon to filter by its item, ability,
          or move.
        </p>
      {/each}
    </div>
  </Modal>
{/if}
