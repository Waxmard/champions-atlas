<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { clearNotification, notification } from '#lib/notifications.js';

  let message = $state('');

  onMount(() => {
    let version = 0;
    const unsubscribe = notification.subscribe((notice) => {
      const current = ++version;
      message = '';
      if (!notice) return;
      if (document.hidden || notice.expiresAt <= Date.now()) {
        clearNotification();
        return;
      }
      void tick().then(() => {
        if (
          current === version &&
          !document.hidden &&
          notice.expiresAt > Date.now()
        )
          message = notice.message;
      });
    });

    function onVisibilityChange() {
      const notice = get(notification);
      if (document.hidden || (notice && notice.expiresAt <= Date.now()))
        clearNotification();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      version++;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
      clearNotification();
    };
  });
</script>

<div
  role="status"
  aria-atomic="true"
  class="pointer-events-none fixed top-[calc(var(--app-header-height,0px)+0.5rem)] right-[calc(1rem+env(safe-area-inset-right))] left-[calc(1rem+env(safe-area-inset-left))] z-[45] flex justify-center"
>
  {#if message}
    <div
      class="max-w-sm min-w-0 rounded-[var(--radius-field)] border border-base-300 bg-base-100 px-3 py-2 text-sm leading-normal font-normal wrap-anywhere text-base-content shadow-sm"
    >
      {message}
    </div>
  {/if}
</div>
