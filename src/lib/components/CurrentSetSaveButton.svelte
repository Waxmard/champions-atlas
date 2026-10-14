<script lang="ts">
  import { browsePokemon, type Member } from '$lib/catalog';
  import {
    currentSetsSnapshot,
    readCurrentSets,
    saveCurrentSets,
  } from '$lib/current-sets';
  import { liveInUseTeam } from '$lib/team-collections';
  import { canonicalSnapshot } from '$lib/team-history';
  import { pushNow, sync } from '$lib/sync.svelte';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    teamId: string;
    baseline: string;
    pokemon?: string;
    memberIndex?: number;
    disabled?: boolean;
  }

  let {
    teamId,
    baseline,
    pokemon,
    memberIndex,
    disabled = false,
  }: Props = $props();
  let alertMessage = $state('');
  let statusMessage = $state('');

  const ownerKey = 'champions-atlas:sync-owner:v2';
  const ownershipError =
    'Sync account changed in another tab. Reopen My teams to continue.';
  const teamError =
    'This team changed elsewhere. Reopen the team before saving its current sets.';
  const readErrorPrefix = 'Current Pokémon sets could not be read.';
  const raceError =
    'Current Pokémon sets changed while confirming. Try saving again.';

  function ownerMatches() {
    if (!sync.configured) return true;
    const owner = localStorage.getItem(ownerKey);
    const user = sync.user;
    if (!user) return owner === null;
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    return !!projectId && owner === `${projectId}:${user.uid}`;
  }

  function liveTeam() {
    const latest = liveInUseTeam(localStorage, teamId);
    if (
      !latest ||
      canonicalSnapshot({ name: latest.name, members: latest.members }) !==
        baseline ||
      (memberIndex !== undefined &&
        (!Number.isInteger(memberIndex) || !latest.members[memberIndex]))
    ) {
      alertMessage = teamError;
      return null;
    }
    return latest;
  }

  function keepFocus(event: PointerEvent) {
    event.preventDefault();
  }

  function save() {
    statusMessage = '';
    alertMessage = '';
    if (disabled) return;
    try {
      if (!ownerMatches()) {
        alertMessage = ownershipError;
        return;
      }
      const latest = liveTeam();
      if (!latest) return;
      const members: Member[] =
        memberIndex === undefined
          ? latest.members
          : [latest.members[memberIndex]!];
      const before = currentSetsSnapshot(readCurrentSets(localStorage));
      const result = saveCurrentSets(localStorage, members, (overwritten) => {
        const names = overwritten.map(({ member }) =>
          browsePokemon(member.pokemon)
        );
        const prompt =
          memberIndex === undefined
            ? `Replace current sets for ${names.join(', ')}? Other saved Pokémon sets will be kept.`
            : `Replace the current ${browsePokemon(pokemon ?? members[0].pokemon)} set?`;
        if (!window.confirm(prompt)) return false;
        if (!ownerMatches()) {
          alertMessage = ownershipError;
          return false;
        }
        return !!liveTeam();
      });
      if (!result) return;
      statusMessage =
        memberIndex === undefined
          ? 'All current team sets saved on this device.'
          : `Current ${browsePokemon(pokemon ?? members[0].pokemon)} set saved on this device.`;
      if (before !== currentSetsSnapshot(result)) void pushNow();
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      alertMessage =
        detail.startsWith(readErrorPrefix) || detail === raceError
          ? detail
          : `Could not save the current sets. Existing current-set data was not replaced. ${detail}`;
    }
  }
</script>

<div
  class={memberIndex === undefined ? '' : 'border-t border-base-300 px-3 py-3'}
>
  <Button
    variant="outline"
    class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
    {disabled}
    onpointerdown={keepFocus}
    onclick={save}
  >
    {memberIndex === undefined
      ? 'Save All Sets'
      : `Save as current ${browsePokemon(pokemon ?? '')} set`}
  </Button>
  <p
    role="alert"
    class="mt-2 min-h-5 text-sm"
    style="color: var(--color-error-content)"
  >
    {alertMessage}
  </p>
  <p role="status" aria-live="polite" class="provenance mt-2 min-h-5">
    {statusMessage}
  </p>
</div>
