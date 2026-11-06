<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setContext, tick } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { twMerge } from 'tailwind-merge';

  interface Props {
    id: string;
    label: string;
    count: number;
    inputId?: string;
    empty?: string;
    moreLabel?: string;
    hasMore?: boolean;
    onshowmore?: () => void;
    class?: string;
    children?: Snippet;
  }

  let {
    id,
    label,
    count,
    inputId = '',
    empty = 'No matching suggestions.',
    moreLabel = 'Show 10 more',
    hasMore = false,
    onshowmore,
    class: className = '',
    children,
  }: Props = $props();
  setContext('suggestion-input-id', () => inputId);
  let section = $state<HTMLUListElement>();
  async function showMore() {
    const previous = count;
    onshowmore?.();
    await tick();
    section
      ?.querySelectorAll<HTMLElement>('[data-suggestion]')
      [previous]?.focus();
  }
</script>

<ul
  bind:this={section}
  {id}
  role="list"
  aria-label={label}
  class={twMerge('mt-1 divide-y divide-base-300/60', className)}
>
  {#if count === 0}
    <li class="option-row text-base-content/70">{empty}</li>
  {:else}
    {@render children?.()}
  {/if}
  {#if hasMore}
    <li class="border-t border-dashed border-base-300">
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-center gap-1.5 px-3 text-sm font-bold text-base-content/70 hover:bg-base-200/70 hover:text-base-content"
        data-show-more
        onpointerdown={(event) => event.preventDefault()}
        onclick={showMore}
      >
        {moreLabel}
        <ChevronDown class="size-4" aria-hidden="true" />
      </button>
    </li>
  {/if}
</ul>
