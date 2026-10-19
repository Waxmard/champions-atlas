<script lang="ts">
  import { localImageSrc } from '#lib/assets.js';

  let { pokemon, size = 32 }: { pokemon: string; size?: number } = $props();
  const src = $derived(localImageSrc('sprites', pokemon));

  function hide(event: Event) {
    (event.currentTarget as HTMLImageElement).hidden = true;
  }
</script>

{#if src}
  <img
    {src}
    alt=""
    aria-hidden="true"
    loading="lazy"
    decoding="async"
    width={size}
    height={size}
    class="shrink-0 object-contain"
    onerror={hide}
  />
{/if}
