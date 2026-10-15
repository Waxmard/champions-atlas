<script lang="ts">
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
  import Save from '@lucide/svelte/icons/save';
  import type { Member } from '$lib/catalog';
  import type { CurrentSetScope } from '$lib/current-sets';
  import CurrentSetActions from '$lib/components/CurrentSetActions.svelte';
  import CurrentSetSaveButton from '$lib/components/CurrentSetSaveButton.svelte';
  import MemberCard from '$lib/components/MemberCard.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import { Button } from '$lib/components/ui/button';

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
    onreuse,
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
    onreuse: (next: Member) => void;
  } = $props();
  const member = $derived(members[memberIndex]);
  const teammates = $derived(
    members.filter((_, index) => index !== memberIndex)
  );
  let record = $state<{ save: (event: MouseEvent) => void }>();
  let reuseActions = $state<{
    reuse: (scope: CurrentSetScope) => void;
    canApply: () => boolean;
  }>();
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
    <Button
      variant="quiet"
      {disabled}
      aria-label={`Record in-game set for ${member.pokemon}`}
      onclick={(event) => record?.save(event)}
    >
      <Save class="size-3" aria-hidden="true" /><span>Record in-game set</span>
    </Button>
    <Button
      variant="quiet"
      disabled={disabled || !reuseActions?.canApply()}
      aria-label={`Use in-game set for ${member.pokemon}`}
      onclick={() => reuseActions?.reuse('all')}
    >
      <ArrowDownToLine class="size-3" aria-hidden="true" /><span
        >Use in-game set</span
      >
    </Button>
  {/snippet}
</MemberCard>
<CurrentSetSaveButton
  bind:this={record}
  {teamId}
  {baseline}
  {memberIndex}
  pokemon={member.pokemon}
  {disabled}
/>
<CurrentSetActions
  bind:this={reuseActions}
  {member}
  {teammates}
  view="overview"
  card
  {disabled}
  onflush={() => true}
  getmember={() => member}
  {onreuse}
/>
