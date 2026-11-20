<script lang="ts">
  import HelpButton from '#lib/components/HelpButton.svelte';

  let {
    pressed,
    onchange,
  }: {
    pressed: boolean;
    onchange: (pressed: boolean) => void;
  } = $props();
</script>

<div class="flex items-center gap-1">
  <label class="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
    <input
      type="checkbox"
      class="size-5 accent-primary"
      checked={pressed}
      onchange={(event) => onchange(event.currentTarget.checked)}
    />
    <span class="font-semibold">With EVs only</span>
  </label>
  <HelpButton topic="ev-spreads" label="About the With EVs filter" />
</div>
