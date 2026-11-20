<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Disclosure from '#lib/components/Disclosure.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import NotificationSettings from '#lib/components/NotificationSettings.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { BattleFormat } from '#lib/battle-format.js';
  import {
    catalogState,
    setBattleFormat,
  } from '#lib/catalog-runtime.svelte.js';
  import { isNativeApp } from '#lib/native.js';
  import { notify } from '#lib/notifications.js';
  import {
    copySyncLog,
    deleteAccount,
    syncProfile,
    syncPushToken,
  } from '#lib/sync.svelte.js';
  import { savedOpenTeam, savedOpenTeamKey } from '#lib/team-collections.js';
  import { browseStorageKey } from '#lib/workbench.js';

  let { onclose }: { onclose: () => void } = $props();
  const id = $props.id();
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

  function forgetBrowseFilters() {
    try {
      const filters = localStorage.getItem(browseStorageKey);
      localStorage.removeItem(browseStorageKey);
      return filters;
    } catch {
      return null;
    }
  }

  function restoreBrowseFilters(filters: string | null) {
    if (filters === null) return;
    try {
      localStorage.setItem(browseStorageKey, filters);
    } catch {
      return;
    }
  }

  function rememberOpenTeam(format: BattleFormat, team: string) {
    try {
      localStorage.setItem(savedOpenTeamKey(format), team);
    } catch {
      return;
    }
  }

  async function chooseFormat(format: BattleFormat) {
    if (format === catalogState.format) return;
    onclose();
    const filters = forgetBrowseFilters();
    const previous = catalogState.format;
    const route =
      page.route.id === '/'
        ? '/'
        : page.route.id === '/wishlist'
          ? '/wishlist'
          : '/saved';
    const open =
      page.route.id === '/saved' ? page.url.searchParams.get('team') : null;
    let target: string | null = null;
    try {
      if (open) target = savedOpenTeam(localStorage, format);
    } catch {
      target = null;
    }
    await goto(
      target
        ? resolve(`saved?team=${encodeURIComponent(target)}`)
        : resolve(route)
    ).catch(() => {});
    if (
      page.route.id !== route ||
      page.url.searchParams.get('team') !== target
    ) {
      restoreBrowseFilters(filters);
      return;
    }
    if (!setBattleFormat(format)) {
      restoreBrowseFilters(filters);
      notify('Battle format could not be saved on this device.');
      return;
    }
    if (open) rememberOpenTeam(previous, open);
    void syncProfile();
    void syncPushToken();
    notify(
      format === 'singles' ? 'Switched to Singles.' : 'Switched to Doubles.'
    );
  }
</script>

{#snippet formatChoice(value: BattleFormat, label: string)}
  <label class="flex min-h-11 cursor-pointer items-center gap-3">
    <input
      type="radio"
      name="battle-format"
      class="size-5 accent-primary"
      checked={catalogState.format === value}
      onchange={() => void chooseFormat(value)}
    />
    <span>{label}</span>
  </label>
{/snippet}

<Modal title="Settings" {onclose}>
  <div class="space-y-5">
    <section class="space-y-1">
      <h3 id="{id}-format" class="term">Battle format</h3>
      <fieldset aria-labelledby="{id}-format">
        {@render formatChoice('doubles', 'Doubles')}
        {@render formatChoice('singles', 'Singles')}
      </fieldset>
      <p class="provenance">
        Browse, Saved and Wishlist show this format's teams. In-game sets are
        shared.
      </p>
    </section>
    {#if isNativeApp}
      <section class="space-y-1 border-t border-base-300 pt-2">
        <h3 class="term">Notifications</h3>
        <NotificationSettings />
      </section>
    {/if}
    <Disclosure label="Troubleshooting" class="border-t border-base-300 pt-2">
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
