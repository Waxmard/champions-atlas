<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Member } from '#lib/catalog.js';
  import MemberCard from '#lib/components/MemberCard.svelte';
  import HelpButton from '#lib/components/HelpButton.svelte';
  import { createCurrentSetRegistry } from '#lib/current-set-registry.svelte.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { formatVp, teamVpCost, VP_COSTS } from '#lib/vp-cost.js';

  let {
    members,
    renderMember,
    onopen,
  }: {
    members: Member[];
    renderMember?: Snippet<[number]>;
    onopen?: (index: number) => void;
  } = $props();
  const currentSets = createCurrentSetRegistry();
  const cost = $derived(
    currentSets.sets
      ? teamVpCost(currentSets.sets, members, catalogState.catalog)
      : null
  );
</script>

<div
  class="team-sheet-grid grid min-w-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,max(9.5rem,45%)),1fr))] items-start gap-3 lg:grid-cols-3 phone-landscape:grid-cols-3"
>
  {#each members as member, index (index)}
    <section
      id={`pokemon-slot-${index}`}
      class="min-w-0"
      aria-label={`${member.pokemon} set`}
    >
      {#if renderMember}
        {@render renderMember(index)}
      {:else}
        <MemberCard
          {member}
          disabled={!onopen}
          onopen={() => onopen?.(index)}
        />
      {/if}
    </section>
  {/each}
</div>
{#if cost}
  <p class="provenance mt-3 flex items-center justify-end gap-1" data-team-vp>
    Estimated spend · {formatVp(cost.total)}
    <HelpButton topic="vp" label="About estimated spend" />
  </p>
  {#if cost.unrecorded}
    <p class="provenance">
      {cost.unrecorded} without a recorded in-game set, estimated at
      {VP_COSTS.unrecorded.toLocaleString('en-US')} VP each
    </p>
  {/if}
{/if}
