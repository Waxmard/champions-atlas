<script lang="ts">
  import { base } from '$app/paths';
  import { normalize } from '$lib/catalog';

  let { item, size = 24 }: { item: string; size?: number } = $props();
  let failed = $state(false);

  function hide(event: Event) {
    failed = true;
    (event.currentTarget as HTMLImageElement).hidden = true;
  }
</script>

<span
  class="inline-flex shrink-0 items-center justify-center"
  style="width: {size}px; height: {size}px;"
>
  {#if item && !failed}
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
  {/if}
  {#if !item || failed}
    <span class="text-xs opacity-40 select-none">🎒</span>
  {/if}
</span>
