<script lang="ts">
  import { getTypeIcon } from '$lib/types';

  interface Props {
    type: string;
    size?: 'sm' | 'md';
    class?: string;
  }

  let { type, size = 'sm', class: className = '' }: Props = $props();
</script>

<img
  src={getTypeIcon(type)}
  alt={type}
  class="shrink-0 object-contain {size === 'md'
    ? 'size-4'
    : 'size-3.5'} {className}"
/>
