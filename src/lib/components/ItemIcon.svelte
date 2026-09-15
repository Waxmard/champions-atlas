<script lang="ts">
  import { base } from '$app/paths';
  import { normalize } from '$lib/catalog';

  let { item, size = 24 }: { item: string; size?: number } = $props();

  function hide(event: Event) {
    (event.currentTarget as HTMLImageElement).hidden = true;
  }
</script>

<img
  src={`${base}/items/${normalize(item)}.png`}
  alt=""
  aria-hidden="true"
  loading="lazy"
  decoding="async"
  width={size}
  height={size}
  class="shrink-0 object-contain"
  onerror={hide}
/>
