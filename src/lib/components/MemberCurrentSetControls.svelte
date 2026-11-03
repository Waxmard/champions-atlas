<script lang="ts">
  import { tick } from 'svelte';
  import { Popover } from 'bits-ui';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Save from '@lucide/svelte/icons/save';
  import type { Member } from '#lib/catalog.js';
  import CurrentSetSaveButton from '#lib/components/CurrentSetSaveButton.svelte';
  import MemberCard, {
    type EditableSetField,
  } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { activeSpreadSource } from '#lib/spread-provenance.js';

  let {
    teamId,
    baseline,
    members,
    memberIndex,
    disabled = false,
    editing = false,
    onedit,
    onrevert,
    revertDisabled = false,
    revertReason = '',
  }: {
    teamId: string;
    baseline: string;
    members: Member[];
    memberIndex: number;
    disabled?: boolean;
    editing?: boolean;
    onedit: (field: EditableSetField) => void;
    onrevert: () => void;
    revertDisabled?: boolean;
    revertReason?: string;
  } = $props();
  const member = $derived(members[memberIndex]);
  const spreadSource = $derived(activeSpreadSource(member));
  let record = $state<{
    save: (event: MouseEvent) => void;
    canRecord: () => boolean;
  }>();
  const canRecord = $derived(record?.canRecord() ?? false);
  const hasActions = $derived(
    canRecord || !revertDisabled || !!revertReason || !!spreadSource
  );
  let actionsOpen = $state(false);
  let setButton = $state<HTMLButtonElement | null>(null);
  let returnToSet = false;

  function keepFocus(event: PointerEvent) {
    event.preventDefault();
  }

  function focusActionTrigger(event: MouseEvent) {
    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
  }

  function recordSet(event: MouseEvent) {
    returnToSet = true;
    record?.save(event);
    actionsOpen = false;
  }

  function revertSet() {
    returnToSet = true;
    actionsOpen = false;
    onrevert();
  }

  function restoreSetFocus(event: Event) {
    if (!returnToSet) return;
    event.preventDefault();
    void tick().then(() => {
      setButton?.focus({ preventScroll: true });
      returnToSet = false;
    });
  }
</script>

<MemberCard
  {member}
  disabled={disabled || editing}
  onopen={() => onedit('set')}
  bind:openButton={setButton}
>
  {#snippet actions()}
    <Popover.Root bind:open={actionsOpen}>
      <Popover.Trigger onclick={focusActionTrigger}>
        {#snippet child({ props })}
          {#if hasActions}
            <Button
              {...props}
              variant="quiet"
              size="icon-compact"
              class="size-11 shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
              aria-label={`More actions for ${member.pokemon}`}
              data-preserve-team-name
            >
              <Ellipsis class="size-4" aria-hidden="true" />
            </Button>
          {/if}
        {/snippet}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label={`More actions for ${member.pokemon}`}
          data-preserve-team-name
          align="end"
          sideOffset={8}
          trapFocus={false}
          onCloseAutoFocus={restoreSetFocus}
          class="z-50 flex max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] min-w-0 flex-col gap-1 overflow-y-auto overscroll-contain rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-2 text-base-content shadow-lg"
        >
          {#if canRecord}
            <Button
              variant="quiet"
              class="h-auto min-h-11 w-full justify-start text-start whitespace-normal"
              disabled={disabled || editing}
              aria-label={`Record in-game set for ${member.pokemon}`}
              onpointerdown={keepFocus}
              onclick={recordSet}
            >
              <Save class="size-4" aria-hidden="true" />
              <span>Record in-game set</span>
            </Button>
          {/if}
          {#if !revertDisabled}
            <Button
              variant="quiet"
              class="h-auto min-h-11 w-full justify-start text-start whitespace-normal"
              disabled={disabled || editing}
              aria-label={`Revert changes for ${member.pokemon}`}
              onclick={revertSet}
            >
              <RotateCcw class="size-4" aria-hidden="true" />
              <span>Revert changes</span>
            </Button>
          {/if}
          {#if revertReason}
            <p class="provenance min-w-0 wrap-anywhere">{revertReason}</p>
          {/if}
          {#if spreadSource}
            <a
              class="inline-flex min-h-11 min-w-0 link items-center text-sm leading-[1.4] wrap-anywhere focus-visible:ring-2 focus-visible:ring-primary"
              href={spreadSource.pasteUrl}
              target="_blank"
              rel="external noreferrer"
            >
              {spreadSource.borrowedNature
                ? 'EVs and Nature from linked creator paste'
                : 'EVs from linked creator paste'}
            </a>
            {#each spreadSource.videoUrls as videoUrl, index (videoUrl)}
              <a
                class="inline-flex min-h-11 min-w-0 link items-center text-sm leading-[1.4] wrap-anywhere focus-visible:ring-2 focus-visible:ring-primary"
                href={videoUrl}
                target="_blank"
                rel="external noreferrer"
                aria-label={`Video provenance ${index + 1} for ${member.pokemon}'s linked creator paste`}
              >
                Video provenance {index + 1}
              </a>
            {/each}
          {/if}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  {/snippet}
</MemberCard>
<div class="record-status">
  <CurrentSetSaveButton
    bind:this={record}
    {teamId}
    {baseline}
    {memberIndex}
    pokemon={member.pokemon}
    {disabled}
    {members}
  />
</div>

<style>
  .record-status :global(p[role='alert']:not(.sr-only)) {
    padding: 0.5rem;
    border: 1px solid var(--color-base-300);
    border-radius: var(--radius-field);
    background: var(--color-base-100);
    overflow-wrap: anywhere;
  }
</style>
