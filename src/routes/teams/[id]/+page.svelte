<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import BookmarkCheck from '@lucide/svelte/icons/bookmark-check';
  import Copy from '@lucide/svelte/icons/copy';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import MemberCard from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { copyText } from '#lib/clipboard.js';
  import {
    bestEvidence,
    evidence,
    evidenceGrade,
    isCustomRulesTeam,
    isPasteUrl,
    listingReason,
    regulationLabel,
    sourceRows,
    youtubeChannelNames,
    type Team,
  } from '#lib/catalog.js';
  import { activeSpreadSource } from '#lib/spread-provenance.js';
  import { exportPaste, type SavedTeam } from '#lib/workbench.js';
  import { normalizeSet } from '#lib/paste.js';
  import {
    openCatalogTeam,
    readSavedTeamsState,
    toggleCatalogWishlist,
  } from '#lib/saved-team-actions.js';
  import { wishlistedCatalogEntries } from '#lib/team-collections.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { sync } from '#lib/sync.svelte.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const team: Team = $derived(
    catalogState.catalog.teams.find((entry) => entry.id === data.team.id) ??
      data.team
  );
  const currentRegulation = $derived(catalogState.catalog.currentRegulation);
  const paste = $derived(team.paste ? exportPaste(team.members) : '');
  const hasActiveEnrichment = $derived(
    team.members.some((member) => activeSpreadSource(member) !== null)
  );
  const originalPaste = $derived(
    team.paste
      ? team.paste
          .split(/\n\s*\n/)
          .map((set) => normalizeSet(set))
          .join('\n\n')
      : ''
  );
  const strongest = $derived(bestEvidence(team, currentRegulation));
  const custom = $derived(isCustomRulesTeam(team));
  const reason = $derived(strongest.none ? listingReason(team) : null);
  const channels = $derived(youtubeChannelNames(team.reports));
  const summaryContext = $derived(
    strongest.entrants === undefined
      ? strongest.event
      : `${strongest.event} (${strongest.entrants} players)`
  );
  let ready = $state(false);
  let copyStatus = $state('');
  let saved = $state.raw<SavedTeam[]>([]);
  let failedCopyText = $state('');
  let savedError = $state('');
  let actionError = $state('');
  let status = $state('');
  let pending = $state(false);
  const wishlisted = $derived(wishlistedCatalogEntries(saved, team).length > 0);
  onMount(() => {
    ready = true;
  });
  $effect(() => {
    void sync.revision;
    if (ready) refreshSaved();
  });
  function refreshSaved() {
    const state = readSavedTeamsState();
    saved = state.saved;
    savedError = state.error;
  }
  function wishlist() {
    if (pending) return;
    pending = true;
    status = actionError = '';
    const result = toggleCatalogWishlist(team);
    refreshSaved();
    actionError = result.error;
    status = result.status;
    pending = false;
  }
  async function useTeam() {
    if (pending) return;
    pending = true;
    status = actionError = '';
    const error = await openCatalogTeam(team);
    if (error) actionError = error;
    else refreshSaved();
    pending = false;
  }

  function back(event: MouseEvent) {
    if (
      !page.state.fromCatalog ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    history.back();
  }
  async function copy(text: string, label: string) {
    const ok = await copyText(text);
    copyStatus = ok
      ? `${label} copied.`
      : 'Copy unavailable. Select and copy the text in the field below.';
    failedCopyText = ok ? '' : text;
  }
</script>

<svelte:head>
  <title>{team.name} — Champion's Atlas</title>
</svelte:head>

<main id="main" class="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
  <div
    class="sticky top-[var(--app-header-height,0px)] z-30 -mx-4 border-b border-base-300 bg-base-200 px-4 py-1 sm:-mx-8 sm:px-8"
  >
    <a
      href={resolve(`?${page.url.searchParams}`)}
      onclick={back}
      class="provenance inline-flex min-h-11 items-center gap-2 text-[0.8125rem] outline-none hover:text-base-content focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
      Back to teams
    </a>
  </div>

  <div
    class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
  >
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          class="rounded-[var(--radius-selector)] border border-base-300 bg-base-100 px-2.5 py-0.5 text-[0.8125rem] leading-tight font-bold"
          >{regulationLabel(team.regulation)}</span
        >
        <span
          class="stamp"
          data-grade={evidenceGrade(custom ? 3 : strongest.level)}
          >{reason?.label ?? strongest.label}</span
        >
        {#if reason}<span class="provenance">{reason.detail}</span
          >{:else if strongest.event}<span class="provenance"
            >{summaryContext}</span
          >{/if}
        {#if team.regulationInference}
          <a
            class="provenance inline-flex min-h-11 link items-center gap-1.5"
            href={team.regulationInference.sourceUrl}
            target="_blank"
            rel="external noreferrer"
          >
            Regulation inferred from video date ({team.regulationInference
              .publishedAt})
            <ExternalLink class="size-3.5" aria-hidden="true" />
          </a>
        {/if}
        <span class="provenance"
          >Shared {team.publishedAt || 'date unknown'}</span
        >
      </div>

      <h1
        class="mt-4 max-w-3xl text-[1.75rem] leading-tight font-extrabold tracking-tight wrap-break-word sm:text-4xl"
      >
        {team.name}
      </h1>
      <p class="provenance mt-2">
        {team.creator
          ? `By ${team.creator}`
          : channels.length
            ? `Shared by ${channels.join(', ')}`
            : 'By an unlisted creator'}
      </p>
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        variant="primary"
        size="touch"
        disabled={!ready || savedError !== '' || pending}
        onclick={useTeam}>Use this team</Button
      >
      <Button
        variant="quiet"
        size="touch"
        class="catalog-wishlist-button"
        aria-label="Wishlist"
        aria-pressed={wishlisted}
        title={wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
        disabled={!ready || savedError !== '' || pending}
        onclick={wishlist}
      >
        {#if wishlisted}
          <BookmarkCheck class="size-4" aria-hidden="true" />
        {:else}
          <Bookmark class="size-4" aria-hidden="true" />
        {/if}
        <span>Wishlist</span>
      </Button>
    </div>
  </div>

  <p role="status" aria-live="polite" class="sr-only">{status}</p>
  {#if custom}<p class="term mt-3">
      Custom-rule event: this team was shared for a tournament with additional
      Pokémon restrictions. Hidden from normal recommendations.
    </p>{/if}
  {#if savedError || actionError}<p
      role="alert"
      class="mt-3 text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {savedError || actionError}
    </p>{/if}

  {#if team.replicaCode}
    <div
      class="plate mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
    >
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="term">Replica code</span>
        <code
          class="rounded bg-base-200 px-2 py-0.5 font-mono text-sm font-bold text-base-content select-all"
          >{team.replicaCode}</code
        >
        <span class="provenance">
          {team.replicaStatus === '✔'
            ? 'Listed as available by the source; availability may change.'
            : 'The source does not list this code as available.'}
        </span>
      </div>
      {#if team.replicaStatus === '✔'}
        <Button
          variant="secondary"
          size="compact"
          onclick={() => copy(team.replicaCode || '', 'Replica code')}
          ><Copy aria-hidden="true" />Copy replica code</Button
        >
      {/if}
    </div>
  {/if}

  <section aria-label="Pokémon sets" class="mt-8">
    <div
      class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-2.5"
    >
      <h2 class="text-[1.375rem] leading-tight font-extrabold">Pokémon sets</h2>
      {#if paste || isPasteUrl(team.pasteUrl)}
        <div class="flex flex-wrap items-center gap-2">
          {#if paste}
            <Button
              variant="secondary"
              size="compact"
              onclick={() =>
                copy(
                  paste,
                  isPasteUrl(team.pasteUrl) ? 'Team paste' : 'Published sets'
                )}
            >
              <Copy aria-hidden="true" />
              {isPasteUrl(team.pasteUrl) ? 'Copy team' : 'Copy published sets'}
            </Button>
          {/if}
          {#if isPasteUrl(team.pasteUrl)}
            <Button
              href={team.pasteUrl}
              variant="quiet"
              size="compact"
              target="_blank"
              rel="external noreferrer"
            >
              <ExternalLink aria-hidden="true" />
              Open original paste
            </Button>
          {/if}
        </div>
      {/if}
    </div>

    <p
      role="status"
      aria-live="polite"
      class="mb-3 text-sm text-base-content/70 empty:hidden"
    >
      {copyStatus}
    </p>
    {#if failedCopyText}
      <label class="mb-3 block text-sm text-base-content/70">
        Team text to copy
        <textarea
          class="textarea mt-1.5 min-h-28 w-full font-mono text-xs"
          readonly
          onclick={(event) => event.currentTarget.select()}
          value={failedCopyText}></textarea>
      </label>
    {/if}

    {#if team.pasteError}<p class="provenance mb-3">
        Some published details could not be loaded. {team.pasteError}
      </p>{/if}

    {#if !isPasteUrl(team.pasteUrl)}<p class="provenance mb-3">
        {team.paste
          ? 'Only published details are included; missing set fields remain unknown.'
          : 'Only the published roster is available; set details are unknown.'}
      </p>{/if}

    <div class="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each team.members as member, index (index)}
        <div class="plate overflow-hidden">
          <MemberCard {member} slot={index + 1} editable={false} />
        </div>
      {/each}
    </div>
  </section>

  <section aria-labelledby="results-heading" class="mt-10">
    <h2
      id="results-heading"
      class="border-b border-base-300 pb-2 text-[1.375rem] font-extrabold wrap-break-word"
    >
      Results & sources
    </h2>
    <ul class="plate mt-4 divide-y">
      {#each sourceRows(team.reports) as row, index (index)}
        {#if row.kind === 'youtube'}
          <li
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <p class="value">
              {row.watch ? 'Video' : 'Channel'} · {row.channel}
            </p>
            <Button
              href={row.url}
              variant="quiet"
              target="_blank"
              rel="external noreferrer"
              ><ExternalLink aria-hidden="true" />{row.watch
                ? 'Watch on YouTube'
                : 'View channel'}</Button
            >
          </li>
        {:else}
          {@const report = row.report}
          {@const result = evidence(report, team.regulation, currentRegulation)}
          <li
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              {#if team.reports.length > 1 && !result.none}<span
                  class="stamp"
                  data-grade={evidenceGrade(custom ? 3 : result.level)}
                  >{result.label}</span
                >{/if}
              <div
                class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
              >
                <p class="value">
                  {report.event || 'Event not listed'}
                </p>
                {#if result.platform !== 'Unknown'}<p class="term">
                    {result.platform}
                  </p>{/if}
                {#if report.entrants !== undefined}<p class="provenance">
                    {report.entrants} players
                  </p>{/if}
              </div>
            </div>
            {#if report.sourceUrl}<Button
                href={report.sourceUrl}
                variant="quiet"
                target="_blank"
                rel="external noreferrer"
                ><ExternalLink aria-hidden="true" />Original source</Button
              >{/if}
          </li>
        {/if}
      {/each}
    </ul>
    {#if team.sheetIds.length > 0}
      <p class="provenance mt-3">
        Sheet entries: {team.sheetIds.join(', ')}. Pastes can use base species
        names while the sheet lists Mega forms.
      </p>
    {/if}
  </section>
  {#if paste}
    <details class="plate mt-8 px-5 py-4">
      <summary class="cursor-pointer text-[0.9375rem] font-semibold"
        >Published paste text</summary
      >
      {#if team.pasteNotes}<p class="term mt-3">
          Paste notes (may differ from the listed regulation): {team.pasteNotes}
        </p>{/if}
      {#if hasActiveEnrichment}<p class="provenance mt-3">
          Copy and Save include linked creator additions; the original paste
          text below does not.
        </p>{/if}
      <pre
        class="mt-4 overflow-x-auto font-mono text-xs leading-6">{originalPaste}</pre>
    </details>
  {/if}
</main>
