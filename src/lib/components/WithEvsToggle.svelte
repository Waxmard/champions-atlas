<script lang="ts">
  import HelpButton from '#lib/components/HelpButton.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    pressed,
    onchange,
    disabled = false,
  }: {
    pressed: boolean;
    onchange: (pressed: boolean) => void;
    disabled?: boolean;
  } = $props();
</script>

<Button
  type="button"
  variant="quiet"
  class={pressed
    ? 'bg-primary text-primary-content hover:bg-primary hover:text-primary-content'
    : ''}
  aria-pressed={pressed}
  {disabled}
  onclick={() => onchange(!pressed)}
>
  With EVs
</Button>
<HelpButton topic="ev-spreads" label="About the With EVs filter" />
