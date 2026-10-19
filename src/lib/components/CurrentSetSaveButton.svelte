<script lang="ts">
  import Save from '@lucide/svelte/icons/save';
  import { tick } from 'svelte';
  import { browsePokemon, type Member } from '#lib/catalog.js';
  import {
    currentSetsChangedEvent,
    currentSetsSnapshot,
    currentSetsWouldChange,
    prepareCurrentSets,
    readCurrentSets,
    saveCurrentSets,
    type CurrentSetSavePlan,
  } from '#lib/current-sets.js';
  import {
    createCurrentSetRegistry,
    currentSetOwnerMatches,
  } from '#lib/current-set-registry.svelte.js';
  import { liveInUseTeam } from '#lib/team-collections.js';
  import { canonicalSnapshot } from '#lib/team-history.js';
  import { pushNow } from '#lib/sync.svelte.js';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    teamId: string;
    baseline: string;
    members: Member[];
    pokemon?: string;
    memberIndex?: number;
    disabled?: boolean;
  }

  let {
    teamId,
    baseline,
    members,
    pokemon,
    memberIndex,
    disabled = false,
  }: Props = $props();
  let alertMessage = $state('');
  let statusMessage = $state('');
  let pendingPlan = $state.raw<CurrentSetSavePlan | null>(null);
  let checkedIds = $state<string[]>([]);
  let dialogTrigger: HTMLButtonElement | null = null;
  let dialogTriggerWasFocused = false;
  let dialogTitle = $state<HTMLHeadingElement | null>(null);
  let saving = false;
  const registry = createCurrentSetRegistry();

  const teamError =
    'This team changed elsewhere. Reopen the team before saving its current sets.';
  const readErrorPrefix = 'Current Pokémon sets could not be read.';
  const raceError =
    'Current Pokémon sets changed while confirming. Try saving again.';

  export function canRecord(): boolean {
    if (disabled || registry.sets === null) return false;
    if (memberIndex !== undefined) {
      const member = members[memberIndex];
      return !!member && currentSetsWouldChange(registry.sets, [member]);
    }
    return currentSetsWouldChange(registry.sets, members);
  }

  function hasNewIncoming(plan: CurrentSetSavePlan): boolean {
    const currentIds = new Set(plan.current.map(({ id }) => id));
    return plan.incoming.some(({ id }) => !currentIds.has(id));
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

  function focusFallback(): HTMLElement | null {
    if (memberIndex !== undefined)
      return (
        document
          .getElementById(`pokemon-slot-${memberIndex}`)
          ?.querySelector<HTMLElement>('[data-set-field="set"]') ?? null
      );
    return document.querySelector<HTMLElement>('[data-team-action="copy"]');
  }

  function restoreFocus(trigger: HTMLButtonElement, wasFocused: boolean) {
    if (!wasFocused) return;
    void tick().then(() => {
      if (trigger.isConnected) return;
      if (
        document.activeElement !== trigger &&
        document.activeElement !== document.body &&
        document.activeElement !== document.documentElement
      )
        return;
      focusFallback()?.focus();
    });
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
    const restoreOpenerFocus = dialogTriggerWasFocused;
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
        dialogTriggerWasFocused = false;
        void tick().then(() => {
          const active = document.activeElement;
          const focusIsUnclaimed =
            active === opener ||
            active === document.body ||
            active === document.documentElement;
          if (opener?.isConnected) {
            if (restoreOpenerFocus && (active === opener || focusIsUnclaimed))
              opener.focus();
          } else if (restoreOpenerFocus && focusIsUnclaimed) {
            focusFallback()?.focus();
          }
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
    checklist: boolean,
    trigger?: HTMLButtonElement,
    triggerWasFocused = false
  ) {
    if (saving) return;
    saving = true;
    try {
      if (!currentSetOwnerMatches()) {
        registry.refresh();
        alertMessage = registry.error;
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
      if (changed) {
        void pushNow();
        window.dispatchEvent(new Event(currentSetsChangedEvent));
      } else {
        registry.refresh();
      }
    } catch (caught) {
      registry.refresh();
      reportError(caught);
    } finally {
      saving = false;
      if (trigger) restoreFocus(trigger, triggerWasFocused);
    }
  }

  function recordPending() {
    const plan = pendingPlan;
    if (!plan || saving || (!checkedIds.length && !hasNewIncoming(plan)))
      return;
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

  export function save(event: MouseEvent): void {
    statusMessage = '';
    alertMessage = '';
    if (saving || pendingPlan || disabled) return;
    const trigger = event.currentTarget as HTMLButtonElement;
    const triggerWasFocused = document.activeElement === trigger;
    try {
      if (!currentSetOwnerMatches()) {
        registry.refresh();
        alertMessage = registry.error;
        return;
      }
      const latest = liveTeam();
      if (!latest) return;
      const selectedMembers: Member[] =
        memberIndex === undefined
          ? latest.members
          : [latest.members[memberIndex]!];
      const plan = prepareCurrentSets(localStorage, selectedMembers);
      if (!plan.overwritten.length && !hasNewIncoming(plan)) {
        registry.refresh();
        statusMessage = 'No in-game sets changed.';
        restoreFocus(trigger, triggerWasFocused);
        return;
      }
      if (memberIndex !== undefined && plan.overwritten.length > 0) {
        if (
          !window.confirm(
            `Replace my in-game ${browsePokemon(pokemon ?? selectedMembers[0].pokemon)} set?`
          )
        )
          return;
        record(
          plan,
          new Set(plan.overwritten.map(({ id }) => id)),
          false,
          trigger,
          triggerWasFocused
        );
        return;
      }
      if (memberIndex === undefined && plan.overwritten.length > 0) {
        dialogTrigger = trigger;
        dialogTriggerWasFocused = triggerWasFocused;
        checkedIds = [];
        pendingPlan = plan;
        return;
      }
      record(
        plan,
        new Set(plan.overwritten.map(({ id }) => id)),
        false,
        trigger,
        triggerWasFocused
      );
    } catch (caught) {
      registry.refresh();
      reportError(caught);
    }
  }
</script>

<div class={memberIndex === undefined ? 'contents' : 'px-2.5'}>
  {#if memberIndex === undefined && canRecord()}
    <Button
      variant="secondary"
      size="touch"
      {disabled}
      aria-describedby={`in-game-sets-description-${teamId}`}
      onpointerdown={keepFocus}
      onclick={save}
    >
      <Save class="size-4" aria-hidden="true" />
      Record all in-game sets
    </Button>
    <span id={`in-game-sets-description-${teamId}`} class="sr-only">
      Record the sets currently in your Pokémon Champions box—one per Pokémon.
      This doesn’t change anything in the game.
    </span>
  {/if}
  <p
    role="alert"
    class="mt-2 text-sm {registry.error || alertMessage
      ? ''
      : 'sr-only'} {memberIndex === undefined ? 'order-last basis-full' : ''}"
    style="color: var(--color-error-content)"
  >
    {registry.error || alertMessage}
  </p>
  <p
    role="status"
    aria-live="polite"
    class="provenance mt-2 {statusMessage ? '' : 'sr-only'} {memberIndex ===
    undefined
      ? 'order-last basis-full'
      : ''}"
  >
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
          variant="quiet"
          size="touch"
          onclick={clearPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="touch"
          disabled={!checkedIds.length && !hasNewIncoming(pendingPlan)}
          onclick={recordPending}
        >
          <Save class="size-4" aria-hidden="true" />
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
