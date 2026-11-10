<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { Button } from '#lib/components/ui/button/index.js';
  import { lockBodyScroll } from '#lib/dialog-scroll-lock.js';

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
  }

  let { title, onclose, children }: Props = $props();
  const id = $props.id();
  let heading = $state<HTMLHeadingElement>();

  function close() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    onclose();
  }

  function openDialog(node: HTMLDialogElement) {
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement &&
      !active.matches('input, textarea, select')
        ? active
        : null;
    if (!opener && active instanceof HTMLElement) active.blur();
    const restoreScroll = lockBodyScroll();
    node.showModal();
    void tick().then(() => {
      if (node.open) heading?.focus({ preventScroll: true });
    });
    return {
      destroy() {
        if (node.open) node.close();
        restoreScroll();
        void tick().then(() => {
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        });
      },
    };
  }
</script>

<dialog
  use:openDialog
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) close();
  }}
  aria-labelledby={id}
  class="fixed inset-0 z-50 m-auto flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 p-0 text-base-content shadow-xl"
>
  <header
    class="flex shrink-0 items-center gap-2 border-b border-base-300 py-1 ps-4 pe-1"
  >
    <h2
      {id}
      bind:this={heading}
      tabindex="-1"
      class="min-w-0 flex-1 font-display text-lg leading-tight font-semibold tracking-tight wrap-anywhere"
    >
      {title}
    </h2>
    <Button
      variant="quiet"
      size="icon-compact"
      aria-label="Close"
      onclick={close}
    >
      <X class="size-4" aria-hidden="true" />
    </Button>
  </header>
  <div class="min-h-0 flex-auto overflow-y-auto overscroll-contain p-4">
    {@render children()}
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
    overflow: hidden;
    overscroll-behavior: contain;
  }
</style>
