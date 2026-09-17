<script lang="ts">
  import MemberCard, {
    type EditableSetField,
  } from '$lib/components/MemberCard.svelte';
  import type { Member } from '$lib/catalog';

  interface Props {
    member: Member;
    editing: boolean;
    pending?: boolean;
    class?: string;
    onedit: (field: EditableSetField) => void;
  }

  let {
    member,
    editing,
    pending = false,
    class: className = '',
    onedit,
  }: Props = $props();
</script>

<MemberCard
  {member}
  editable={true}
  {editing}
  {pending}
  class={className}
  {onedit}
/>
