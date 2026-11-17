<script lang="ts">
  import { pokemonId, type Member } from '#lib/catalog.js';
  import { createCurrentSetRegistry } from '#lib/current-set-registry.svelte.js';
  import { formatVp, setVpCost } from '#lib/vp-cost.js';

  let { member, class: className = '' }: { member: Member; class?: string } =
    $props();
  const currentSets = createCurrentSetRegistry();
  const cost = $derived(
    currentSets.sets
      ? setVpCost(
          currentSets.sets.find(
            (entry) => entry.id === pokemonId(member.pokemon)
          )?.member,
          member
        )
      : null
  );
</script>

{#if cost}
  <p class="provenance {className}" data-set-vp>
    {formatVp(cost.vp)} to change in game{cost.recorded
      ? ''
      : ' · no in-game set recorded'}
  </p>
{/if}
