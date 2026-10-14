<script lang="ts">
  import { onMount } from 'svelte';
  import { browsePokemon, pokemonId, type Member } from '$lib/catalog';
  import { isCompleteSpread, NATURES, parseChampionsSpread } from '$lib/paste';
  import {
    currentSetsKey,
    readCurrentSets,
    reuseCurrentSet,
    type CurrentSet,
    type CurrentSetScope,
  } from '$lib/current-sets';
  import { sync } from '$lib/sync.svelte';
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
  const ownerKey = 'champions-atlas:sync-owner:v2';
  const ownershipError =
    'Sync account changed in another tab. Reopen the editor to continue.';
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
        registryError = '';
        return;
      }
      sets = readCurrentSets(localStorage);
      registryError = '';
    } catch (error) {
      sets = null;
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

  function reuse(scope: CurrentSetScope) {
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
      registryError = '';
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
  aria-label="My in-game Pokémon set"
  class="mb-4 grid gap-2 border-b border-base-300 pb-4"
>
  <h3 class="text-sm font-semibold">
    My in-game {browsePokemon(member.pokemon)} set
  </h3>
  <div class="flex flex-wrap gap-2">
    {#if currentSet && view === 'overview'}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseSpread}
        onpointerdown={keepFocus}
        onclick={() => reuse('evs')}>Use my in-game EVs and nature</Button
      >
      {#if !canReuseSpread}
        <p class="provenance self-center">
          The recorded in-game set has no complete EV spread and standard
          nature.
        </p>
      {/if}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseMoves}
        onpointerdown={keepFocus}
        onclick={() => reuse('moves')}>Use my in-game moves</Button
      >
      {#if !canReuseMoves}
        <p class="provenance self-center">
          The recorded in-game set has no moves.
        </p>
      {/if}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        onpointerdown={keepFocus}
        onclick={() => reuse('all')}>Use my in-game set</Button
      >
    {:else if currentSet && view === 'spread'}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseSpread}
        onpointerdown={keepFocus}
        onclick={() => reuse('evs')}>Use my in-game EVs and nature</Button
      >
      {#if !canReuseSpread}
        <p class="provenance self-center">
          The recorded in-game set has no complete EV spread and standard
          nature.
        </p>
      {/if}
    {:else if currentSet && view === 'moves'}
      <Button
        variant="outline"
        class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
        disabled={!canReuseMoves}
        onpointerdown={keepFocus}
        onclick={() => reuse('moves')}>Use my in-game moves</Button
      >
      {#if !canReuseMoves}
        <p class="provenance self-center">
          The recorded in-game set has no moves.
        </p>
      {/if}
    {/if}
  </div>
  {#if sets && !currentSet}
    <p class="provenance">
      No in-game set recorded for {browsePokemon(member.pokemon)}.
    </p>
  {/if}
  {#if registryError}
    <p role="alert" class="text-sm" style="color: var(--color-error-content)">
      {registryError}
    </p>
  {/if}
</section>
