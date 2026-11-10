<script lang="ts">
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import Modal from '#lib/components/Modal.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { recordSummary, type WinLossRecord } from '#lib/team-collections.js';

  interface Props {
    record: WinLossRecord;
    disabled: boolean;
    onstep: (key: keyof WinLossRecord, step: number) => boolean;
    onreset: () => boolean;
  }

  let { record, disabled, onstep, onreset }: Props = $props();
  let open = $state(false);
  let editing = $state(false);
  const summary = $derived(recordSummary(record));

  function close() {
    open = editing = false;
  }
  function log(key: keyof WinLossRecord) {
    onstep(key, 1);
    close();
  }
  function step(key: keyof WinLossRecord, by: number) {
    if (!onstep(key, by)) close();
  }
  function reset() {
    if (confirm('Reset this record to 0W – 0L?') && !onreset()) close();
  }
</script>

<button
  type="button"
  class="plate flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-start tabular-nums hover:bg-base-200 focus-visible:bg-base-200"
  aria-haspopup="dialog"
  onclick={() => (open = true)}
>
  <span class="term">Record</span>
  <span class="text-[0.9375rem] font-medium">
    <span aria-hidden="true">{summary.text}</span>
    <span class="sr-only">{summary.label}</span>
  </span>
</button>
{#if open}
  <Modal title="Record" onclose={close}>
    <div class="tabular-nums">
      <p class="text-center text-2xl font-bold">
        <span aria-hidden="true">{summary.text}</span>
        <span class="sr-only">{summary.label}</span>
      </p>
      {#if disabled}
        <p class="provenance mt-2 text-center">
          Unavailable while edits are pending or the team changed elsewhere.
        </p>
      {/if}
      <div class="mt-4 grid grid-cols-2 gap-2">
        {#each [['wins', 'Win'], ['losses', 'Loss']] as const as [key, label] (key)}
          <Button
            variant="primary"
            class="h-12 max-md:min-h-12"
            disabled={disabled || record[key] === 9999}
            onclick={() => log(key)}
          >
            <Plus class="size-4" aria-hidden="true" />
            {label}
          </Button>
        {/each}
      </div>
      <div class="mt-2 flex justify-end">
        <Button
          variant="quiet"
          aria-expanded={editing}
          onclick={() => (editing = !editing)}>Edit</Button
        >
      </div>
      {#if editing}
        <div
          role="group"
          aria-label="Edit record"
          class="flex flex-wrap items-center gap-x-1"
        >
          {#each [['wins', 'win', 'W'], ['losses', 'loss', 'L']] as const as [key, noun, mark] (key)}
            <div class="flex items-center">
              <Button
                variant="quiet"
                size="icon-compact"
                aria-label={`Remove a ${noun}`}
                disabled={disabled || record[key] === 0}
                onclick={() => step(key, -1)}
              >
                <Minus class="size-4" aria-hidden="true" />
              </Button>
              <span class="min-w-10 text-center text-[0.9375rem] font-medium">
                <span aria-hidden="true">{record[key]}{mark}</span>
                <span class="sr-only"
                  >{record[key]} {record[key] === 1 ? noun : key}</span
                >
              </span>
              <Button
                variant="quiet"
                size="icon-compact"
                aria-label={`Add a ${noun}`}
                disabled={disabled || record[key] === 9999}
                onclick={() => step(key, 1)}
              >
                <Plus class="size-4" aria-hidden="true" />
              </Button>
            </div>
          {/each}
          <Button
            variant="quiet"
            class="ms-auto"
            disabled={disabled || record.wins + record.losses === 0}
            onclick={reset}>Reset</Button
          >
        </div>
      {/if}
    </div>
  </Modal>
{/if}
