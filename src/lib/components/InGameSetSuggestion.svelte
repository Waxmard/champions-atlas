<script lang="ts">
  import { canonicalSnapshot, memberSnapshotDiff } from '$lib/team-history';
  import type { Member } from '$lib/catalog';

  interface Props {
    current: Member;
    saved: Member;
    reason?: string;
    onchoose: (displayed: Member) => void;
  }

  let { current, saved, reason = '', onchoose }: Props = $props();
  const id = $props.id();
  const changeSummaryId = `${id}-changes`;
  const differences = $derived(memberSnapshotDiff(current, saved));
  const identical = $derived(
    canonicalSnapshot(current) === canonicalSnapshot(saved)
  );
  const textChange = $derived(
    differences.find((row) => row.field === 'Set text')
  );
  const metadataChange = $derived(
    differences.find((row) => row.field === 'Saved metadata')
  );
  const structuredChanges = $derived(
    differences.filter(
      (row) => row.field !== 'Set text' && row.field !== 'Saved metadata'
    )
  );
  const changeSummary = $derived(
    identical
      ? 'Already matches this set.'
      : `${structuredChanges.length} structured changes${
          textChange || metadataChange
            ? ', with saved text or metadata changes'
            : ''
        }.`
  );
</script>

<li data-set-choice class="min-w-0">
  <button
    type="button"
    class="option-row min-h-11 w-full flex-wrap items-start text-left"
    aria-label={`My in-game set for ${saved.pokemon}`}
    aria-describedby={changeSummaryId}
    disabled={identical || !!reason}
    onpointerdown={(event) => event.preventDefault()}
    onclick={() => onchoose(saved)}
  >
    <span class="font-semibold">My in-game set</span>
    <span class="provenance wrap-break-word">Recorded for {saved.pokemon}</span>
    {#each structuredChanges as row (row.field)}
      <span class="w-full text-sm wrap-anywhere"
        >{row.field}: {row.before} → {row.after}</span
      >
    {/each}
    <span id={changeSummaryId} class="sr-only">
      {changeSummary}
      {#if reason}
        {reason}{/if}
    </span>
  </button>
  {#if identical}
    <p class="provenance mt-1 wrap-anywhere">Already matches this set.</p>
  {/if}
  {#if reason}
    <p
      class="provenance mt-1 wrap-anywhere"
      style="color: var(--color-error-content)"
    >
      {reason}
    </p>
  {/if}
  {#if textChange || metadataChange}
    <div class="mt-2 space-y-2">
      {#if textChange}
        <p class="provenance wrap-anywhere">
          Set text differs; review before choosing.
        </p>
        <details class="min-w-0 text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-medium">
            Show set text changes
          </summary>
          <div class="grid gap-2 pb-2">
            <div>
              <p class="term">Before</p>
              <pre
                class="mt-1 max-h-40 overflow-auto wrap-anywhere whitespace-pre-wrap">{textChange.before}</pre>
            </div>
            <div>
              <p class="term">After</p>
              <pre
                class="mt-1 max-h-40 overflow-auto wrap-anywhere whitespace-pre-wrap">{textChange.after}</pre>
            </div>
          </div>
        </details>
      {/if}
      {#if metadataChange}
        <p class="provenance wrap-anywhere">
          Saved metadata differs; review before choosing.
        </p>
        <details class="min-w-0 text-sm">
          <summary class="min-h-11 cursor-pointer py-2 font-medium">
            Show saved metadata changes
          </summary>
          <div class="grid gap-2 pb-2">
            <div>
              <p class="term">Before</p>
              <pre
                class="mt-1 max-h-40 overflow-auto wrap-anywhere whitespace-pre-wrap">{metadataChange.before}</pre>
            </div>
            <div>
              <p class="term">After</p>
              <pre
                class="mt-1 max-h-40 overflow-auto wrap-anywhere whitespace-pre-wrap">{metadataChange.after}</pre>
            </div>
          </div>
        </details>
      {/if}
    </div>
  {/if}
</li>
