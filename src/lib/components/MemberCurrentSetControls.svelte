<script lang="ts">
  import Save from '@lucide/svelte/icons/save';
  import type { Member } from '#lib/catalog.js';
  import CurrentSetSaveButton from '#lib/components/CurrentSetSaveButton.svelte';
  import MemberCard from '#lib/components/MemberCard.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    teamId,
    baseline,
    members,
    memberIndex,
    disabled = false,
    editing = false,
    onedit,
    onrevert,
    revertDisabled = false,
    revertReason = '',
  }: {
    teamId: string;
    baseline: string;
    members: Member[];
    memberIndex: number;
    disabled?: boolean;
    editing?: boolean;
    onedit: (field: EditableSetField) => void;
    onrevert: () => void;
    revertDisabled?: boolean;
    revertReason?: string;
  } = $props();
  const member = $derived(members[memberIndex]);
  let record = $state<{
    save: (event: MouseEvent) => void;
    canRecord: () => boolean;
  }>();
  function keepFocus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

<MemberCard
  {member}
  editable
  {editing}
  {onedit}
  {onrevert}
  {revertDisabled}
  {revertReason}
>
  {#snippet actions()}
    {#if record?.canRecord()}
      <Button
        variant="quiet"
        size="compact"
        {disabled}
        aria-label={`Record in-game set for ${member.pokemon}`}
        onpointerdown={keepFocus}
        onclick={(event) => record?.save(event)}
      >
        <Save class="size-4" aria-hidden="true" />
        <span>Record in-game set</span>
      </Button>
    {/if}
  {/snippet}
</MemberCard>
<CurrentSetSaveButton
  bind:this={record}
  {teamId}
  {baseline}
  {memberIndex}
  pokemon={member.pokemon}
  {disabled}
  {members}
/>
