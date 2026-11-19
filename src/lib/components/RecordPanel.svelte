<script lang="ts">
  import type { Snippet } from 'svelte';
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import Modal from '#lib/components/Modal.svelte';
  import { slide } from 'svelte/transition';
  import { dur } from '#lib/motion.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { recordSummary, type WinLossRecord } from '#lib/team-collections.js';

  interface Props {
    record: WinLossRecord;
    disabled: boolean;
    onstep: (key: keyof WinLossRecord, step: number) => boolean;
    onreset: () => boolean;
    reminder?: Snippet;
  }

  let { record, disabled, onstep, onreset, reminder }: Props = $props();
  let open = $state(false);
  let editing = $state(false);
  let logged = $state<{ key: keyof WinLossRecord; id: number }>();
  const summary = $derived(recordSummary(record));
  const games = $derived(record.wins + record.losses);
  const digits = $derived(`${record.wins}${record.losses}`.length);
  const scoreSize = $derived(
    digits <= 2 ? 'text-7xl' : digits <= 4 ? 'text-5xl' : 'text-4xl'
  );

  function close() {
    open = editing = false;
    logged = undefined;
  }
  function step(key: keyof WinLossRecord, by: number) {
    if (!onstep(key, by)) return close();
    logged = by > 0 ? { key, id: (logged?.id ?? 0) + 1 } : undefined;
  }
  function reset() {
    if (!confirm('Reset this record to 0W – 0L?')) return;
    logged = undefined;
    if (!onreset()) close();
  }
</script>

<button
  type="button"
  class="plate flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-start tabular-nums hover:bg-base-200 focus-visible:bg-base-200"
  aria-haspopup="dialog"
  onclick={() => (open = true)}
>
  <span class="term">Win–loss record</span>
  <span class="text-[0.9375rem] font-medium">
    <span aria-hidden="true">{summary.text}</span>
    <span class="sr-only">{summary.label}</span>
  </span>
</button>
{#if open}
  <Modal title="Win–loss record" onclose={close}>
    <div class="tabular-nums">
      {#key logged?.id}
        <p
          aria-hidden="true"
          class="flex min-w-0 items-baseline justify-center font-display leading-none font-bold tracking-tight {scoreSize}"
        >
          <span class="text-success-content" class:win={logged?.key === 'wins'}
            >{record.wins}<span class="ms-0.5 text-[0.33em] opacity-60">W</span
            ></span
          >
          <span class="mx-[0.15em] opacity-30">–</span>
          <span class="text-error-content" class:loss={logged?.key === 'losses'}
            >{record.losses}<span class="ms-0.5 text-[0.33em] opacity-60"
              >L</span
            ></span
          >
        </p>
      {/key}
      <p class="sr-only" role="status">{summary.label}</p>
      <div
        aria-hidden="true"
        class="mt-4 h-2 overflow-hidden rounded-full {games
          ? 'bg-error'
          : 'bg-base-200'}"
      >
        <div
          class="h-full rounded-full bg-success-content {logged
            ? 'transition-[width] duration-300 ease-out'
            : ''}"
          style:width={`${summary.rate ?? 0}%`}
        ></div>
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
            class="inline-flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-field text-[0.9375rem] font-bold transition-[filter,scale] hover:brightness-95 focus-visible:brightness-95 not-disabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-content/40 {tone}"
            disabled={disabled || record[key] === 9999}
            onclick={() => step(key, 1)}
          >
            <Plus class="size-4" aria-hidden="true" />
            {label}
          </button>
        {/each}
      </div>
      {#if logged && reminder}<div
          class="mt-3 flex flex-col items-center gap-1 text-center"
        >
          {@render reminder()}
        </div>{/if}
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
          transition:slide={{ duration: dur(200) }}
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

<style>
  .win,
  .loss {
    position: relative;
    isolation: isolate;
  }
  .win {
    animation: win-pop 450ms var(--motion-ease);
  }
  .loss {
    animation: loss-shake 400ms ease-in-out;
  }
  .win::before {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: -1;
    width: 0.09em;
    height: 0.09em;
    margin: -0.045em;
    border-radius: 50%;
    opacity: 0;
    animation: win-burst 600ms var(--motion-ease);
  }
  @keyframes win-pop {
    40% {
      scale: 1.2;
      translate: 0 -0.06em;
    }
  }
  @keyframes loss-shake {
    20% {
      translate: -0.06em 0;
    }
    40% {
      translate: 0.06em 0;
    }
    60% {
      translate: -0.04em 0;
    }
    80% {
      translate: 0.03em 0;
    }
  }
  @keyframes win-burst {
    from {
      opacity: 1;
      box-shadow:
        0 0 currentColor,
        0 0 currentColor,
        0 0 currentColor,
        0 0 currentColor,
        0 0 currentColor,
        0 0 currentColor,
        0 0 currentColor,
        0 0 currentColor;
    }
    60% {
      opacity: 1;
    }
    to {
      opacity: 0;
      box-shadow:
        0 -0.55em currentColor,
        0.45em -0.4em currentColor,
        0.7em 0 currentColor,
        0.45em 0.4em currentColor,
        0 0.55em currentColor,
        -0.45em 0.4em currentColor,
        -0.7em 0 currentColor,
        -0.45em -0.4em currentColor;
    }
  }
</style>
