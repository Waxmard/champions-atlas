<script lang="ts">
  import { onMount } from 'svelte';
  import { browsePokemon, pokemonId, type Member } from '$lib/catalog';
  import { isCompleteSpread, NATURES, parseChampionsSpread } from '$lib/paste';
  import {
    currentSetsKey,
    readCurrentSets,
    reuseCurrentSet,
    saveCurrentSet,
    type CurrentSet,
    type CurrentSetScope,
  } from '$lib/current-sets';
  import { pushNow, sync } from '$lib/sync.svelte';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    member: Member;
    view: string;
    onflush: () => boolean;
    getmember: () => Member;
    onreuse: (next: Member) => void;
  }

  let { member, view, onflush, getmember, onreuse }: Props = $props();
  let sets = $state<CurrentSet[] | null>(null);
  let registryError = $state('');
  let statusMessage = $state('');
  const ownerKey = 'champions-atlas:sync-owner:v2';
  const ownershipError =
    'Sync account changed in another tab. Reopen the editor to continue.';
  const readErrorPrefix = 'Current Pokémon sets could not be read.';
  const currentSet = $derived(
    sets?.find(({ id }) => id === pokemonId(member.pokemon)) ?? null
  );
  const canReuseSpread = $derived(
    !!currentSet && canReuseSavedSpread(currentSet.member)
  );

  const canReuseMoves = $derived(!!currentSet?.member.moves.length);
  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function clearReadError() {
    if (!registryError.startsWith('Could not save the current set.'))
      registryError = '';
  }

  function ownerMatches() {
    if (!sync.configured) return true;
    const owner = localStorage.getItem(ownerKey);
    const user = sync.user;
    if (!user) return owner === null;
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    return !!projectId && owner === `${projectId}:${user.uid}`;
  }

  function refreshRegistry() {
    try {
      if (!ownerMatches()) {
        sets = null;
        statusMessage = '';
        registryError = '';
        return;
      }
      sets = readCurrentSets(localStorage);
      clearReadError();
    } catch (error) {
      sets = null;
      statusMessage = '';
      registryError = errorMessage(error);
    }
  }

  $effect(() => {
    void sync.revision;
    void sync.authResolved;
    void sync.user;
    refreshRegistry();
  });

  onMount(() => {
    function onStorage(event: StorageEvent) {
      if (event.storageArea !== localStorage) return;
      if (event.key === currentSetsKey || event.key === ownerKey)
        refreshRegistry();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });

  function save() {
    statusMessage = '';
    try {
      if (!ownerMatches()) {
        refreshRegistry();
        registryError = ownershipError;
        return;
      }
      if (!onflush()) return;
      const member = $state.snapshot(getmember());
      const next = saveCurrentSet(localStorage, member);
      sets = next;
      registryError = '';
      statusMessage = `Current ${browsePokemon(member.pokemon)} set saved on this device.`;
      void pushNow();
    } catch (error) {
      const detail = errorMessage(error);
      registryError = detail.startsWith(readErrorPrefix)
        ? detail
        : `Could not save the current set. Existing current-set data was not replaced. ${detail}`;
    }
  }

  function reuse(scope: CurrentSetScope) {
    statusMessage = '';
    try {
      if (!ownerMatches()) {
        refreshRegistry();
        registryError = ownershipError;
        return;
      }
      if (!onflush()) return;
      const current = $state.snapshot(getmember());
      const latest = readCurrentSets(localStorage);
      sets = latest;
      clearReadError();
      const saved = latest.find(({ id }) => id === pokemonId(current.pokemon));
      if (!saved) return;
      if (scope === 'evs' && !canReuseSavedSpread(saved.member)) return;
      if (scope === 'moves' && !saved.member.moves.length) return;
      onreuse(reuseCurrentSet(current, saved.member, scope));
    } catch (error) {
      sets = null;
      registryError = errorMessage(error);
    }
  }

  function canReuseSavedSpread(saved: Member) {
    return (
      isCompleteSpread(parseChampionsSpread(saved.spread)) &&
      NATURES.some((nature) => nature === saved.nature)
    );
  }

  function keepFocus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

<section
  aria-label="Current Pokémon set"
  class="mb-4 grid gap-2 border-b border-base-300 pb-4"
>
  <h3 class="text-sm font-semibold">
    Current {browsePokemon(member.pokemon)} set
  </h3>
  <div class="flex flex-wrap gap-2">
    <Button
      variant="outline"
      class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
      onpointerdown={keepFocus}
      onclick={save}
    >
      Save as current {browsePokemon(member.pokemon)} set
    </Button>
    {#if currentSet && view === 'overview'}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseSpread}
        onpointerdown={keepFocus}
        onclick={() => reuse('evs')}>Use current EVs and nature</Button
      >
      {#if !canReuseSpread}
        <p class="provenance self-center">
          The current set has no complete EV spread and standard nature.
        </p>
      {/if}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseMoves}
        onpointerdown={keepFocus}
        onclick={() => reuse('moves')}>Use current moves</Button
      >
      {#if !canReuseMoves}
        <p class="provenance self-center">
          The current set has no saved moves.
        </p>
      {/if}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        onpointerdown={keepFocus}
        onclick={() => reuse('all')}>Use current set</Button
      >
    {:else if currentSet && view === 'spread'}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseSpread}
        onpointerdown={keepFocus}
        onclick={() => reuse('evs')}>Use current EVs and nature</Button
      >
      {#if !canReuseSpread}
        <p class="provenance self-center">
          The current set has no complete EV spread and standard nature.
        </p>
      {/if}
    {:else if currentSet && view === 'moves'}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseMoves}
        onpointerdown={keepFocus}
        onclick={() => reuse('moves')}>Use current moves</Button
      >
      {#if !canReuseMoves}
        <p class="provenance self-center">
          The current set has no saved moves.
        </p>
      {/if}
    {/if}
  </div>
  {#if sets && !currentSet}
    <p class="provenance">No current set saved.</p>
  {/if}
  {#if registryError}
    <p role="alert" class="text-sm" style="color: var(--color-error-content)">
      {registryError}
    </p>
  {/if}
  <p role="status" aria-live="polite" class="provenance min-h-5">
    {statusMessage}
  </p>
</section>
