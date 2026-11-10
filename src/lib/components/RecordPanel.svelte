<script lang="ts">
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import { Button } from '#lib/components/ui/button/index.js';
  import { recordSummary, type WinLossRecord } from '#lib/team-collections.js';

  interface Props {
    record: WinLossRecord;
    disabled: boolean;
    onstep: (key: keyof WinLossRecord, step: number) => void;
    onreset: () => void;
  }

  let { record, disabled, onstep, onreset }: Props = $props();
  let editing = $state(false);
  const summary = $derived(recordSummary(record));

  function reset() {
    if (confirm('Reset this record to 0W – 0L?')) onreset();
  }
</script>

<details class="plate min-w-0 px-3 tabular-nums">
  <summary class="min-h-11 cursor-pointer content-center">
    <span class="term">Record</span>
    <span class="ms-2 text-[0.9375rem] font-medium">
      <span aria-hidden="true">{summary.text}</span>
      <span class="sr-only">{summary.label}</span>
    </span>
  </summary>
  <div class="flex flex-wrap items-center gap-x-1 pb-1">
    {#each [['wins', 'Win'], ['losses', 'Loss']] as const as [key, label] (key)}
      <Button
        variant="quiet"
        disabled={disabled || record[key] === 9999}
        onclick={() => onstep(key, 1)}
      >
        <Plus class="size-4" aria-hidden="true" />
        {label}
      </Button>
    {/each}
    <Button
      variant="quiet"
      class="ms-auto"
      aria-expanded={editing}
      onclick={() => (editing = !editing)}>Edit</Button
    >
  </div>
  {#if editing}
    <div
      role="group"
      aria-label="Edit record"
      class="flex flex-wrap items-center gap-x-1 pb-1"
    >
      {#each [['wins', 'win', 'W'], ['losses', 'loss', 'L']] as const as [key, noun, mark] (key)}
        <div class="flex items-center">
          <Button
            variant="quiet"
            size="icon-compact"
            aria-label={`Remove a ${noun}`}
            disabled={disabled || record[key] === 0}
            onclick={() => onstep(key, -1)}
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
            onclick={() => onstep(key, 1)}
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
</details>
