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
  <div class="mt-4 overflow-x-auto rounded-xl border">
    <table class="table w-full table-fixed table-xs text-left leading-5">
      <caption class="sr-only">Team differences</caption>
      <thead class="bg-base-200">
        <tr
          ><th class="w-1/3 p-3">Pokémon / field</th><th class="p-3"
            >{beforeLabel}</th
          ><th class="p-3">{afterLabel}</th></tr
        >
      </thead>
      <tbody class="divide-y">
        {#each rows as row, index (index)}
          <tr class="align-top">
            <th scope="row" class="p-3 font-medium wrap-break-word">
              <div class="flex items-center gap-2">
                <PokemonSprite pokemon={row.pokemon} size={28} />
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1">
                    <span>{row.pokemon}</span>
                    {#if row.field === 'Pokémon'}
                      {#each getPokemonTypes(row.pokemon) as type (type)}
                        <TypeBadge {type} size="sm" />
                      {/each}
                    {/if}
                  </div>
                  <span class="block font-normal text-base-content/70"
                    >{row.field}</span
                  >
                </div>
              </div>
            </th>
            {#each [row.before, row.after] as value, side (side)}
              <td class="p-3 wrap-break-word">
                {#if row.field === 'Full set'}
                  <details>
                    <summary class="cursor-pointer py-1 text-primary"
                      >Show set</summary
                    >
                    <p class="mt-2 whitespace-pre-wrap">{value}</p>
                  </details>
                {:else if row.field === 'Item' && value !== 'Unknown'}
                  <span class="flex items-center gap-1">
                    <ItemIcon item={value} />
                    <span>{value}</span>
                  </span>
                {:else if (row.field === 'Moves' || row.field.startsWith('Move')) && value !== 'Unknown'}
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
                    class="badge {value === 'Added' || value === 'On team'
                      ? 'badge-primary'
                      : 'badge-soft'}"
                  >
                    {value}
                  </span>
                {:else}
                  {value}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="mt-4 text-sm text-base-content/70">
    No differences in loaded fields.
  </p>
{/if}
<p class="mt-3 text-xs text-base-content/70">
  Unknown details cannot be compared. Matching fields do not establish legality
  or competitive strength.
</p>
