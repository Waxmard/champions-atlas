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
  const games = $derived(record.wins + record.losses);
  const digits = $derived(`${record.wins}${record.losses}`.length);
  const scoreSize = $derived(
    digits <= 3 ? 'text-7xl' : digits <= 5 ? 'text-5xl' : 'text-4xl'
  );

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
      <p
        aria-hidden="true"
        class="flex min-w-0 items-baseline justify-center font-display leading-none font-bold tracking-tight {scoreSize}"
      >
        <span class="text-success-content"
          >{record.wins}<span class="ms-0.5 text-[0.33em] opacity-60">W</span
          ></span
        >
        <span class="mx-[0.15em] opacity-30">–</span>
        <span class="text-error-content"
          >{record.losses}<span class="ms-0.5 text-[0.33em] opacity-60">L</span
          ></span
        >
      </p>
      <p class="sr-only">{summary.label}</p>
      <div
        aria-hidden="true"
        class="mt-4 h-2 overflow-hidden rounded-full {games
          ? 'bg-error'
          : 'bg-base-200'}"
      >
        {#if summary.rate !== null}
          <div
            class="h-full rounded-full bg-success-content"
            style:width={`${summary.rate}%`}
          ></div>
        {/if}
      </div>
      <p aria-hidden="true" class="term mt-2 text-center">
        {summary.rate === null
          ? 'No games yet'
          : `${summary.rate}% win rate · ${games} ${games === 1 ? 'game' : 'games'}`}
      </p>
      {#if disabled}
        <p class="provenance mt-2 text-center">
          Unavailable while edits are pending or the team changed elsewhere.
        </p>
      {/if}
      <div class="mt-4 grid grid-cols-2 gap-2">
        {#each [['wins', 'Win', 'bg-success text-success-content'], ['losses', 'Loss', 'bg-error text-error-content']] as const as [key, label, tone] (key)}
          <button
            type="button"
            class="inline-flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-field text-[0.9375rem] font-bold transition-[filter] hover:brightness-95 focus-visible:brightness-95 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-content/40 {tone}"
            disabled={disabled || record[key] === 9999}
            onclick={() => log(key)}
          >
            <Plus class="size-4" aria-hidden="true" />
            {label}
          </button>
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
