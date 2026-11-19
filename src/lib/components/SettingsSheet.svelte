<script lang="ts">
  import Disclosure from '#lib/components/Disclosure.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import NotificationSettings from '#lib/components/NotificationSettings.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { isNativeApp } from '#lib/native.js';
  import { copySyncLog, deleteAccount } from '#lib/sync.svelte.js';

  let { onclose }: { onclose: () => void } = $props();
  let copyStatus = $state('');

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
      <section class="space-y-1">
        <h3 class="term">Notifications</h3>
        <NotificationSettings />
      </section>
    {/if}
    <Disclosure
      label="Troubleshooting"
      class={isNativeApp ? 'border-t border-base-300 pt-2' : undefined}
    >
      <div class="space-y-2 pb-2">
        <p class="provenance">
          Copies this device's recent sync errors to send with a bug report.
        </p>
        <Button onclick={async () => (copyStatus = await copySyncLog())}>
          Copy sync log
        </Button>
        <p role="status" class="provenance">{copyStatus}</p>
      </div>
    </Disclosure>
    <Disclosure label="Delete account" class="border-t border-base-300 pt-2">
      <div class="space-y-3 pb-2 text-sm text-base-content/70">
        <p>
          Permanently deletes your account, your synced teams and in-game sets,
          and your notification settings on every device. Teams saved on this
          device stay.
        </p>
        <p>You'll be asked to sign in with Google again first.</p>
        <Button variant="danger-quiet" onclick={remove}>Delete account</Button>
      </div>
    </Disclosure>
  </div>
</Modal>
