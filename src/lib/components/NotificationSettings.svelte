<script lang="ts">
  import Modal from './Modal.svelte';
  import {
    readNotificationSettings,
    writeNotificationSettings,
  } from '#lib/catalog-news.js';
  import { syncPushToken } from '#lib/sync.svelte.js';

  let { onclose }: { onclose: () => void } = $props();

  let enabled = $state(readNotificationSettings(localStorage).newTeams);
  let busy = $state(false);
  let message = $state('');

  async function save(event: Event & { currentTarget: HTMLInputElement }) {
    const wanted = event.currentTarget.checked;
    busy = true;
    message = '';
    try {
      writeNotificationSettings(localStorage, { newTeams: wanted });
      const result = await syncPushToken();
      if (wanted && !(result?.granted && result.token)) {
        writeNotificationSettings(localStorage, { newTeams: false });
        if (result?.token) await syncPushToken();
        enabled = false;
        message =
          result && !result.granted
            ? 'Notifications are turned off for this app. Allow them in iPhone Settings, then turn this on again.'
            : 'Notifications could not be turned on. Try again.';
      }
    } catch {
      enabled = readNotificationSettings(localStorage).newTeams;
      message = 'This setting could not be saved.';
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="Notifications" {onclose}>
  <label class="flex min-h-11 cursor-pointer items-center gap-3">
    <input
      type="checkbox"
      class="size-5 accent-primary"
      bind:checked={enabled}
      disabled={busy}
      onchange={save}
    />
    <span class="min-w-0">
      <span class="block font-semibold">New teams</span>
      <span class="provenance block"
        >When teams are added to the current regulation.</span
      >
    </span>
  </label>
  {#if message}
    <p
      role="alert"
      class="mt-3 text-sm"
      style="color: var(--color-error-content)"
    >
      {message}
    </p>
  {/if}
</Modal>
