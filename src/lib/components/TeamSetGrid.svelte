<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Member } from '#lib/catalog.js';
  import MemberCard from '#lib/components/MemberCard.svelte';

  let {
    members,
    renderMember,
    onopen,
  }: {
    members: Member[];
    renderMember?: Snippet<[number]>;
    onopen?: (index: number) => void;
  } = $props();
</script>

<div
  class="team-sheet-grid grid min-w-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,max(9.5rem,45%)),1fr))] items-start gap-3 lg:grid-cols-3 landscape:md:grid-cols-3"
>
  {#each members as member, index (index)}
    <section
      id={`pokemon-slot-${index}`}
      class="min-w-0"
      style:--morph-name={`team-sprite-${index}`}
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
