<script lang="ts">
  import { differences } from '$lib/workbench';
  import type { Member } from '$lib/catalog';
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
    <table class="w-full table-fixed text-left text-xs leading-5">
      <caption class="sr-only">Team differences</caption>
      <thead class="bg-secondary">
        <tr
          ><th class="w-1/3 p-3">Pokémon / field</th><th class="p-3"
            >{beforeLabel}</th
          ><th class="p-3">{afterLabel}</th></tr
        >
      </thead>
      <tbody class="divide-y">
        {#each rows as row, index (index)}
          <tr class="align-top"
            ><th scope="row" class="p-3 font-medium wrap-break-word"
              >{row.pokemon}<span
                class="block font-normal text-muted-foreground"
                >{row.field}</span
              ></th
            >
            {#each [row.before, row.after] as value, side (side)}
              <td class="p-3 wrap-break-word">
                {#if row.field === 'Full set'}<details>
                    <summary class="cursor-pointer py-1 text-primary"
                      >Show set</summary
                    >
                    <p class="mt-2 whitespace-pre-wrap">{value}</p>
                  </details>
                {:else}{value}{/if}
              </td>
            {/each}</tr
          >
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="mt-4 text-sm text-muted-foreground">
    No differences in loaded fields.
  </p>
{/if}
<p class="mt-3 text-xs text-muted-foreground">
  Unknown details cannot be compared. Matching fields do not establish legality
  or competitive strength.
</p>
