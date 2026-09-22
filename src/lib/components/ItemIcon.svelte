<script lang="ts">
  import { base } from '$app/paths';
  import { normalize } from '$lib/catalog';

  let { item, size = 24 }: { item: string; size?: number } = $props();
  const src = $derived(item ? `${base}/items/${normalize(item)}.png` : '');
  let failedSrc = $state('');
</script>

<span
  class="inline-flex shrink-0 items-center justify-center"
  style="width: {size}px; height: {size}px;"
>
  {#if src && failedSrc !== src}
    <img
      {src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      class="shrink-0 object-contain"
      onerror={() => (failedSrc = src)}
    />
  {/if}
  {#if !src || failedSrc === src}
    <span class="block h-px w-3 bg-base-content/30" aria-hidden="true"></span>
  {/if}
</span>
