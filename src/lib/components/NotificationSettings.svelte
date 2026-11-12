<script lang="ts">
  import Modal from './Modal.svelte';
  import {
    readNotificationSettings,
    writeNotificationSettings,
  } from '#lib/catalog-news.js';
  import { publishCatalogWatch } from '#lib/catalog-runtime.svelte.js';

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
      const result = await publishCatalogWatch();
      if (wanted && !result?.granted) {
        writeNotificationSettings(localStorage, { newTeams: false });
        await publishCatalogWatch();
        enabled = false;
        message = result
          ? 'Notifications are turned off for this app. Allow them in iPhone Settings, then turn this on again.'
          : 'Notifications could not be turned on. Try again.';
      } else if (wanted && result && !result.backgroundRefresh) {
        message =
          'Background App Refresh is off for this app in iPhone Settings. Notifications cannot arrive until it is on.';
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
  <p class="provenance mt-3">
    iPhone checks for new teams in the background, so a notification can arrive
    some hours after the teams are published.
  </p>
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
