<script lang="ts">
  import { onMount } from 'svelte';
  import type { Member } from '#lib/catalog.js';
  import SetDetails from '#lib/components/SetDetails.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    title: string;
    member: Member;
    disabled?: boolean;
    onback: () => void;
    onapply: () => void;
  }

  let { title, member, disabled = false, onback, onapply }: Props = $props();
  let root = $state<HTMLDivElement>();
  let heading = $state<HTMLHeadingElement>();

  onMount(() => {
    if (root?.parentElement) root.parentElement.scrollTop = 0;
    heading?.focus({ preventScroll: true });
  });
</script>

<div bind:this={root} class="min-w-0 space-y-3">
  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
    <h3 bind:this={heading} tabindex="-1" class="term min-w-0 wrap-anywhere">
      {title}
    </h3>
    <div class="flex gap-2">
      <Button variant="quiet" onclick={onback}>Back</Button>
      <Button variant="primary" {disabled} onclick={onapply}>Apply swap</Button>
    </div>
  </div>
  <SetDetails {member} />
</div>
