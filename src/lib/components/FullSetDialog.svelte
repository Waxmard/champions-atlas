<script lang="ts">
  import { tick } from 'svelte';
  import type { Member } from '#lib/catalog.js';
  import SetDetails from '#lib/components/SetDetails.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { lockBodyScroll } from '#lib/dialog-scroll-lock.js';

  let { member, onclose }: { member: Member; onclose: () => void } = $props();
  let heading = $state<HTMLHeadingElement>();

  function openDialog(node: HTMLDialogElement) {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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
    onclose();
  }}
  aria-labelledby="full-set-title"
  class="set-editor-dialog fixed inset-0 z-50 m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden overscroll-contain border-0 bg-base-100 p-0 text-base-content shadow-xl sm:top-8 sm:bottom-auto sm:mx-auto sm:h-auto sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-4rem)] sm:max-w-2xl sm:rounded-box sm:border"
>
  <header
    class="max-h-[30dvh] shrink-0 overflow-y-auto overscroll-contain border-b border-base-300 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 sm:pt-5"
  >
    <h2
      id="full-set-title"
      bind:this={heading}
      tabindex="-1"
      class="text-[1.375rem] leading-tight font-extrabold wrap-anywhere whitespace-pre-wrap"
    >
      {member.pokemon} set
    </h2>
  </header>
  <div
    class="min-h-0 flex-auto overflow-y-auto overscroll-contain px-5 py-4 sm:px-6"
  >
    <SetDetails {member} />
  </div>
  <footer
    class="flex shrink-0 justify-end border-t border-base-300 bg-base-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4"
  >
    <Button variant="quiet" class="h-auto min-h-11" onclick={onclose}
      >Close</Button
    >
  </footer>
</dialog>

<style>
  dialog::backdrop {
    overflow: hidden;
    overscroll-behavior: contain;
  }
</style>
