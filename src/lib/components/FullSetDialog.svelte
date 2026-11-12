<script lang="ts">
  import type { Member } from '#lib/catalog.js';
  import Modal from '#lib/components/Modal.svelte';
  import SetDetails from '#lib/components/SetDetails.svelte';

  let { member, onclose }: { member: Member; onclose: () => void } = $props();
</script>

<Modal title={`${member.pokemon} set`} {onclose}>
  <SetDetails {member} />
</Modal>
