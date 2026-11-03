<script lang="ts">
  import { resolve } from '$app/paths';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Copy from '@lucide/svelte/icons/copy';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import FullSetDialog from '#lib/components/FullSetDialog.svelte';
  import TeamSetGrid from '#lib/components/TeamSetGrid.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { regulationLabel, type Team } from '#lib/catalog.js';
  import { copyText } from '#lib/clipboard.js';
  import { notify } from '#lib/notifications.js';
  import { exportPaste, type SavedTeam } from '#lib/workbench.js';

  let {
    entry,
    match,
    disabled,
    onuse,
    onremove,
  }: {
    entry: SavedTeam;
    match: Team | undefined;
    disabled: boolean;
    onuse: () => void;
    onremove: () => void;
  } = $props();
  let selectedIndex = $state<number | null>(null);
  let failedCopyText = $state('');
  const selectedMember = $derived(
    selectedIndex === null ? null : (entry.members[selectedIndex] ?? null)
  );

  async function copyTeam() {
    const text = exportPaste(entry.members);
    const copied = await copyText(text);
    failedCopyText = copied ? '' : text;
    if (copied) notify('Team text copied.');
  }

  function safeSourceUrl(value: string): boolean {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
</script>

<div
  class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
>
  <h1
    class="min-w-0 text-[1.75rem] leading-tight font-extrabold wrap-anywhere sm:text-4xl"
  >
    {entry.name}
  </h1>
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="quiet" class="min-h-11" {disabled} onclick={onuse}>
      <ArrowRight class="size-4" aria-hidden="true" />
      <span>Move to My teams</span>
    </Button>
    <Button variant="quiet" class="min-h-11" {disabled} onclick={onremove}>
      <Trash2 class="size-4" aria-hidden="true" />
      <span>Remove from Wishlist</span>
    </Button>
  </div>
</div>

<section aria-label="Pokémon sets" class="mt-8">
  <div
    class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-2.5"
  >
    <h2 class="text-[1.375rem] leading-tight font-extrabold">Pokémon sets</h2>
    <Button variant="quiet" class="min-h-11" onclick={copyTeam}>
      <Copy aria-hidden="true" />Copy team text
    </Button>
  </div>
  {#if failedCopyText}
    <p role="alert" class="mb-2 text-sm text-error-content">
      Copy unavailable. Select and copy the team text below.
    </p>
    <label class="mb-3 block text-sm text-base-content/70">
      Team text to copy
      <textarea
        class="textarea mt-1.5 min-h-28 w-full font-mono text-xs"
        readonly
        onclick={(event) => event.currentTarget.select()}
        value={failedCopyText}></textarea>
    </label>
  {/if}
  <TeamSetGrid
    members={entry.members}
    onopen={(index) => (selectedIndex = index)}
  />
</section>

<section aria-labelledby="original-evidence-heading" class="mt-10">
  <h2
    id="original-evidence-heading"
    class="border-b border-base-300 pb-2 text-[1.375rem] font-extrabold"
  >
    Original evidence
  </h2>
  <div class="plate mt-4 space-y-3 px-4 py-3">
    <p class="provenance">Source details belong to the original team.</p>
    <dl class="grid gap-3 sm:grid-cols-2">
      <div class="min-w-0">
        <dt class="term">Original name</dt>
        <dd class="wrap-anywhere">{entry.original.name}</dd>
      </div>
      <div>
        <dt class="term">Original regulation</dt>
        <dd>{regulationLabel(entry.original.regulation)}</dd>
      </div>
      {#if entry.original.creator}
        <div class="min-w-0">
          <dt class="term">Creator</dt>
          <dd class="wrap-anywhere">{entry.original.creator}</dd>
        </div>
      {/if}
      {#if entry.original.publishedAt}
        <div>
          <dt class="term">Published</dt>
          <dd>{entry.original.publishedAt}</dd>
        </div>
      {/if}
    </dl>
    {#if entry.original.regulationInference}
      <a
        class="inline-flex min-h-11 link items-center"
        href={entry.original.regulationInference.sourceUrl}
        target="_blank"
        rel="external noreferrer"
      >
        Regulation inferred from video date
      </a>
    {/if}
    {#if entry.original.pasteUrl}
      <a
        class="inline-flex min-h-11 link items-center gap-1.5 wrap-anywhere"
        href={entry.original.pasteUrl}
        target="_blank"
        rel="external noreferrer"
      >
        <ExternalLink class="size-4" aria-hidden="true" />Open original paste
      </a>
    {/if}
    {#if entry.original.sheetIds?.length}
      <p class="provenance wrap-anywhere">
        Source sheet IDs: {entry.original.sheetIds.join(', ')}
      </p>
    {/if}
    {#if entry.original.replicaCode || entry.original.replicaStatus}
      <div>
        <p class="font-bold">Original replica code</p>
        {#if entry.original.replicaCode}<code
            class="font-mono text-sm wrap-anywhere select-all"
            >{entry.original.replicaCode}</code
          >{/if}
        {#if entry.original.replicaStatus}<p class="provenance">
            Source status: {entry.original.replicaStatus}
          </p>{/if}
        <p class="provenance">
          This code belongs to the original team. Availability may change.
        </p>
      </div>
    {/if}
    {#if entry.original.reports?.length}
      <ul class="divide-y divide-base-300">
        {#each entry.original.reports as report, index (index)}
          <li class="space-y-1 py-3 wrap-anywhere">
            <p class="font-bold">{report.event || 'Event not listed'}</p>
            {#if report.rank}<p>{report.rank}</p>{/if}
            {#if report.entrants}<p class="provenance">
                {report.entrants} players
              </p>{/if}
            {#if report.sourceUrl}
              {#if safeSourceUrl(report.sourceUrl)}
                <a
                  class="inline-flex min-h-11 link items-center"
                  href={report.sourceUrl}
                  target="_blank"
                  rel="external noreferrer">Original source {index + 1}</a
                >
              {:else}
                <p class="provenance wrap-anywhere">{report.sourceUrl}</p>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {:else if entry.origin !== 'custom'}
      <p class="provenance">No original results were retained.</p>
    {/if}
    {#if entry.original.pasteNotes}<p
        class="provenance wrap-anywhere whitespace-pre-wrap"
      >
        {entry.original.pasteNotes}
      </p>{/if}
    {#if entry.original.pasteError}<p class="provenance wrap-anywhere">
        Some original published details could not be loaded. {entry.original
          .pasteError}
      </p>{/if}
    {#if match}
      <a
        class="inline-flex min-h-11 link items-center"
        href={resolve(`teams/${match.id}`)}>View catalog details</a
      >
    {/if}
  </div>
</section>

{#if selectedMember}
  <FullSetDialog
    member={selectedMember}
    onclose={() => (selectedIndex = null)}
  />
{/if}
