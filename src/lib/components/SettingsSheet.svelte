<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Modal from '#lib/components/Modal.svelte';
  import NotificationSettings from '#lib/components/NotificationSettings.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { isNativeApp } from '#lib/native.js';
  import { copySyncLog, deleteAccount } from '#lib/sync.svelte.js';

  let { onclose }: { onclose: () => void } = $props();

  function remove() {
    if (
      !confirm(
        'Permanently delete your account and its synced teams and sets from the cloud? Teams on this device stay.'
      )
    )
      return;
    onclose();
    void deleteAccount();
  }
</script>

<Modal title="Settings" {onclose}>
  <div class="space-y-5">
    {#if isNativeApp}
      <section class="space-y-3">
        <h3 class="term">Notifications</h3>
        <NotificationSettings />
      </section>
    {/if}
    <section
      class={['space-y-2', isNativeApp && 'border-t border-base-300 pt-4']}
    >
      <h3 class="term">Troubleshooting</h3>
      <p class="provenance">
        Copies this device's recent sync errors to send with a bug report.
      </p>
      <Button onclick={copySyncLog}>Copy sync log</Button>
    </section>
    <details class="group border-t border-base-300 pt-2">
      <summary
        class="option-row -mx-3 cursor-pointer list-none rounded-[var(--radius-field)] font-semibold [&::-webkit-details-marker]:hidden"
      >
        <span class="flex-1">Delete account</span>
        <ChevronDown
          class="size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="space-y-3 pb-2 text-sm text-base-content/70">
        <p>
          Permanently deletes your account, your synced teams and in-game sets,
          and your notification settings on every device. Teams saved on this
          device stay.
        </p>
        <p>You'll be asked to sign in with Google again first.</p>
        <Button variant="danger-quiet" onclick={remove}>Delete account</Button>
      </div>
    </details>
  </div>
</Modal>
