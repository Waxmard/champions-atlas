<script lang="ts">
  import type { Member } from '$lib/catalog';
  import CurrentSetActions from '$lib/components/CurrentSetActions.svelte';
  import CurrentSetSaveButton from '$lib/components/CurrentSetSaveButton.svelte';

  let {
    teamId,
    baseline,
    members,
    memberIndex,
    disabled = false,
    onreuse,
  }: {
    teamId: string;
    baseline: string;
    members: Member[];
    memberIndex: number;
    disabled?: boolean;
    onreuse: (next: Member) => void;
  } = $props();
  const member = $derived(members[memberIndex]);
  const teammates = $derived(
    members.filter((_, index) => index !== memberIndex)
  );
</script>

<CurrentSetSaveButton
  {teamId}
  {baseline}
  {memberIndex}
  pokemon={member.pokemon}
  {disabled}
/>
<CurrentSetActions
  {member}
  {teammates}
  view="overview"
  card
  {disabled}
  onflush={() => true}
  getmember={() => member}
  {onreuse}
/>
