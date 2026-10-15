<script lang="ts">
  import { tick } from 'svelte';
  import { browsePokemon, type Member } from '$lib/catalog';
  import {
    currentSetsSnapshot,
    prepareCurrentSets,
    readCurrentSets,
    saveCurrentSets,
    type CurrentSetSavePlan,
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
  let pendingPlan = $state.raw<CurrentSetSavePlan | null>(null);
  let checkedIds = $state<string[]>([]);
  let dialogTrigger: HTMLButtonElement | null = null;
  let dialogTitle = $state<HTMLHeadingElement | null>(null);
  let saving = false;

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

  function openDialog(node: HTMLDialogElement) {
    const { scrollX, scrollY } = window;
    const body = document.body;
    const styles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const opener = dialogTrigger;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    node.showModal();
    void tick().then(() => dialogTitle?.focus());
    return {
      destroy() {
        if (node.open) node.close();
        body.style.position = styles.position;
        body.style.top = styles.top;
        body.style.left = styles.left;
        body.style.width = styles.width;
        body.style.overflow = styles.overflow;
        window.scrollTo(scrollX, scrollY);
        pendingPlan = null;
        checkedIds = [];
        dialogTrigger = null;
        void tick().then(() => {
          if (opener?.isConnected) opener.focus();
        });
      },
    };
  }

  function clearPending() {
    pendingPlan = null;
    checkedIds = [];
  }

  function handleDialogCancel(event: Event) {
    event.preventDefault();
    clearPending();
  }

  function reportError(caught: unknown) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    alertMessage =
      detail.startsWith(readErrorPrefix) || detail === raceError
        ? detail
        : `Could not save the current sets. Existing current-set data was not replaced. ${detail}`;
  }

  function record(
    plan: CurrentSetSavePlan,
    replacementIds: ReadonlySet<string>,
    checklist: boolean
  ) {
    if (saving) return;
    saving = true;
    try {
      if (!ownerMatches()) {
        alertMessage = ownershipError;
        return;
      }
      if (!liveTeam()) return;
      const before = currentSetsSnapshot(readCurrentSets(localStorage));
      if (disabled) {
        alertMessage = teamError;
        return;
      }
      const result = saveCurrentSets(localStorage, plan, replacementIds);
      const changed = before !== currentSetsSnapshot(result);
      const skippedConflict = plan.overwritten.some(
        ({ id }) => !replacementIds.has(id)
      );
      if (checklist && !changed) {
        statusMessage = 'No in-game sets changed.';
      } else if (checklist && skippedConflict) {
        statusMessage =
          'Recorded in-game sets on this device. Kept unselected Pokémon sets.';
      } else if (memberIndex === undefined) {
        statusMessage = "Recorded this team's in-game sets on this device.";
      } else {
        statusMessage = `Recorded the in-game ${browsePokemon(pokemon ?? plan.incoming[0]!.member.pokemon)} set on this device.`;
      }
      if (changed) void pushNow();
    } catch (caught) {
      reportError(caught);
    } finally {
      saving = false;
    }
  }

  function recordPending() {
    const plan = pendingPlan;
    if (!plan || saving) return;
    statusMessage = '';
    alertMessage = '';
    const replacementIds = new Set(checkedIds);
    try {
      record(plan, replacementIds, true);
    } finally {
      const error = alertMessage;
      clearPending();
      if (error) {
        alertMessage = '';
        void tick().then(() => (alertMessage = error));
      }
    }
  }

  function save(event: MouseEvent) {
    statusMessage = '';
    alertMessage = '';
    if (saving || pendingPlan || disabled) return;
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
      const plan = prepareCurrentSets(localStorage, members);
      if (memberIndex !== undefined && plan.overwritten.length > 0) {
        if (
          !window.confirm(
            `Replace my in-game ${browsePokemon(pokemon ?? members[0].pokemon)} set?`
          )
        )
          return;
        record(plan, new Set(plan.overwritten.map(({ id }) => id)), false);
        return;
      }
      if (memberIndex === undefined && plan.overwritten.length > 0) {
        dialogTrigger = event.currentTarget as HTMLButtonElement;
        checkedIds = [];
        pendingPlan = plan;
        return;
      }
      record(plan, new Set(plan.overwritten.map(({ id }) => id)), false);
    } catch (caught) {
      reportError(caught);
    }
  }
</script>

<div
  class={memberIndex === undefined
    ? 'max-w-sm min-w-0'
    : 'border-t border-base-300 px-3 py-3'}
>
  <Button
    variant="outline"
    class="h-auto min-h-11 max-w-full px-3 py-2 text-left whitespace-normal"
    {disabled}
    aria-describedby={`in-game-sets-description-${teamId}`}
    onpointerdown={keepFocus}
    onclick={save}
  >
    {memberIndex === undefined
      ? 'Set all as my in-game sets'
      : `Set as my in-game ${browsePokemon(pokemon ?? '')} set`}
  </Button>
  {#if memberIndex === undefined}
    <p id={`in-game-sets-description-${teamId}`} class="provenance mt-2">
      Record the sets currently in your Pokémon Champions box—one per Pokémon.
      This doesn’t change anything in the game.
    </p>
  {/if}
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
  {#if pendingPlan}
    <dialog
      use:openDialog
      oncancel={handleDialogCancel}
      aria-labelledby={`current-set-save-title-${teamId}`}
      aria-describedby={`current-set-save-description-${teamId}`}
      class="current-set-save-dialog fixed inset-0 z-50 m-auto flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 p-0 text-base-content shadow-xl"
    >
      <header class="shrink-0 border-b border-base-300 p-5">
        <h2
          bind:this={dialogTitle}
          id={`current-set-save-title-${teamId}`}
          tabindex="-1"
          class="text-lg font-semibold"
        >
          Choose in-game sets to replace
        </h2>
        <p
          id={`current-set-save-description-${teamId}`}
          class="provenance mt-2"
        >
          Select the Pokémon sets to replace. Any new Pokémon sets will also be
          recorded. Unchecked Pokémon keep their recorded sets. This doesn’t
          change anything in Pokémon Champions.
        </p>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
        <ul class="space-y-1">
          {#each pendingPlan.overwritten as entry (entry.id)}
            {@const name = browsePokemon(entry.member.pokemon)}
            {@const checkboxId = `replace-current-set-${teamId}-${entry.id}`}
            <li>
              <label
                for={checkboxId}
                class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-base-200"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  name={`replace-current-set-${teamId}`}
                  value={entry.id}
                  aria-label={`Replace my in-game ${name} set`}
                  class="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
                  checked={checkedIds.includes(entry.id)}
                  onchange={(event) => {
                    checkedIds = event.currentTarget.checked
                      ? [...checkedIds, entry.id]
                      : checkedIds.filter((id) => id !== entry.id);
                  }}
                />
                <span>{name}</span>
              </label>
            </li>
          {/each}
        </ul>
      </div>
      <footer
        class="flex shrink-0 justify-end gap-3 border-t border-base-300 p-4 sm:p-5"
      >
        <Button
          type="button"
          variant="outline"
          class="min-h-11"
          onclick={clearPending}
        >
          Cancel
        </Button>
        <Button type="button" class="min-h-11" onclick={recordPending}>
          Record sets
        </Button>
      </footer>
    </dialog>
  {/if}
</div>

<style>
  :global(dialog.current-set-save-dialog::backdrop) {
    background: rgb(0 0 0 / 0.5);
  }
</style>
