<script lang="ts">
  import { differences } from '$lib/workbench';
  import type { Member } from '$lib/catalog';
  import ItemIcon from './ItemIcon.svelte';
  import MovePill from './MovePill.svelte';
  import PokemonSprite from './PokemonSprite.svelte';
  import TypeBadge from './TypeBadge.svelte';
  import { getPokemonTypes } from '$lib/types';
  let {
    before,
    after,
    beforeLabel = 'Your version',
    afterLabel = 'Candidate',
  }: {
    before: Member[];
    after: Member[];
    beforeLabel?: string;
    afterLabel?: string;
  } = $props();
  const rows = $derived(differences(before, after));
</script>

{#if rows.length}
  <div class="plate mt-4 overflow-x-auto">
    <table class="table w-full table-fixed table-xs text-left leading-5">
      <caption class="sr-only">Team differences</caption>
      <thead>
        <tr
          ><th class="w-1/3 p-3"><span class="term">Pokémon / field</span></th
          ><th class="p-3"><span class="term">{beforeLabel}</span></th><th
            class="p-3"><span class="term">{afterLabel}</span></th
          ></tr
        >
      </thead>
      <tbody class="divide-y">
        {#each rows as row, index (index)}
          <tr class="align-top">
            <th scope="row" class="p-3 wrap-break-word">
              <div class="flex items-center gap-2">
                <PokemonSprite pokemon={row.pokemon} size={28} />
                <div class="min-w-0">
                  <div class="flex flex-wrap items-baseline gap-x-1.5">
                    <span class="value font-semibold">{row.pokemon}</span>
                    {#if row.field === 'Pokémon'}
                      {#each getPokemonTypes(row.pokemon) as type (type)}
                        <TypeBadge {type} size="sm" />
                      {/each}
                    {/if}
                  </div>
                  <span class="term block">{row.field}</span>
                </div>
              </div>
            </th>
            {#each [row.before, row.after] as value, side (side)}
              <td class="p-3 wrap-break-word">
                {#if value === 'Unknown'}
                  <span class="unknown rounded-xs px-1.5 py-px">Unknown</span>
                {:else if row.field === 'Full set'}
                  <details>
                    <summary class="term cursor-pointer py-1">Show set</summary>
                    <p class="value mt-2 whitespace-pre-wrap">{value}</p>
                  </details>
                {:else if row.field === 'Item'}
                  <span
                    class="value inline-flex items-center gap-1.5 {side === 1
                      ? 'font-semibold'
                      : ''}"
                  >
                    <ItemIcon item={value} />
                    <span class="truncate">{value}</span>
                  </span>
                {:else if row.field === 'Moves' || row.field.startsWith('Move')}
                  {#if value.includes(', ')}
                    <div class="flex flex-col gap-1">
                      {#each value.split(', ') as move (move)}
                        <MovePill {move} />
                      {/each}
                    </div>
                  {:else}
                    <MovePill move={value} />
                  {/if}
                {:else if row.field === 'Pokémon'}
                  <span
                    class="value {value === 'Added' || value === 'Removed'
                      ? 'font-semibold'
                      : 'text-base-content/70'}">{value}</span
                  >
                {:else}
                  <span class="value {side === 1 ? 'font-semibold' : ''}"
                    >{value}</span
                  >
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="plate mt-4 px-4 py-3 text-[0.9375rem] leading-relaxed">
    No differences in loaded fields.
  </p>
{/if}
<p class="provenance mt-3 max-w-[68ch]">
  Unknown details cannot be compared. Matching fields do not establish legality
  or competitive strength.
</p>
