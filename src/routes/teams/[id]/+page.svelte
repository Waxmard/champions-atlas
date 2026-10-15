<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Copy from '@lucide/svelte/icons/copy';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import MemberCard from '$lib/components/MemberCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import { copyText } from '$lib/clipboard';
  import {
    bestEvidence,
    evidence,
    evidenceGrade,
    isCustomRulesTeam,
    isPasteUrl,
    regulationLabel,
    type Team,
  } from '$lib/catalog';
  import { exportPaste, type SavedTeam } from '$lib/workbench';
  import {
    openCatalogTeam,
    readSavedTeamsState,
    wishlistCatalogTeam,
  } from '$lib/saved-team-actions';
  import { sync } from '$lib/sync.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const team: Team = $derived(data.team);
  const paste = $derived(team.paste ? exportPaste(team.members) : '');
  const strongest = $derived(bestEvidence(team, data.currentRegulation));
  const custom = $derived(isCustomRulesTeam(team));
  const summaryContext = $derived(
    strongest.entrants === undefined
      ? strongest.event
      : `${strongest.event} (${strongest.entrants} players)`
  );
  let ready = $state(false);
  let copyStatus = $state('');
  let saved = $state.raw<SavedTeam[]>([]);
  let savedError = $state('');
  let actionError = $state('');
  let status = $state('');
  let pending = $state(false);
  const wishlisted = $derived(
    saved.some(
      (entry) =>
        entry.collection === 'wishlist' && entry.original.id === team.id
    )
  );
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
    const error = wishlistCatalogTeam(team);
    if (error) actionError = error;
    else {
      refreshSaved();
      status = 'Added to Wishlist.';
    }
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
      : 'Copy unavailable. Select and copy the text below.';
  }
</script>

<svelte:head>
  <title>{team.name} — Champion's Atlas</title>
  <meta
    name="description"
    content={`${team.regulation} team by ${team.creator || 'an unlisted creator'}. View published team members, items, and result sources.`}
  />
</svelte:head>

<main id="main" class="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
  <div
    class="sticky top-[var(--app-header-height,0px)] z-30 -mx-4 border-b border-base-300 bg-base-200 px-4 py-1 sm:-mx-8 sm:px-8"
  >
    <a
      href={resolve(`/?${page.url.searchParams}`)}
      onclick={back}
      class="provenance inline-flex min-h-11 items-center gap-2 text-[0.8125rem] outline-none hover:text-base-content focus-visible:ring-2 focus-visible:ring-primary"
      ><ArrowLeft class="size-4" aria-hidden="true" />Back to teams</a
    >
  </div>

  <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span
      class="rounded-[var(--radius-selector)] border border-base-300 bg-base-100 px-2.5 py-0.5 text-[0.8125rem] leading-tight font-bold"
      >{regulationLabel(team.regulation)}</span
    >
    <span class="stamp" data-grade={evidenceGrade(custom ? 3 : strongest.level)}
      >{strongest.label}</span
    >
    {#if strongest.event}<span class="provenance">{summaryContext}</span>{/if}
    <span class="provenance">Shared {team.publishedAt || 'date unknown'}</span>
  </div>

  <h1
    class="mt-4 max-w-3xl text-[1.75rem] leading-tight font-extrabold tracking-tight wrap-break-word sm:text-4xl"
  >
    {team.name}
  </h1>
  <p class="provenance mt-2.5">By {team.creator || 'an unlisted creator'}</p>

  {#if custom}<p class="term mt-3">
      Custom-rule event: this team was shared for a tournament with additional
      Pokémon restrictions. Hidden from normal recommendations.
    </p>{/if}

  <div class="mt-6 flex flex-wrap gap-2.5">
    <Button
      variant="primary"
      disabled={!ready || savedError !== '' || pending}
      onclick={useTeam}>Use this team</Button
    >
    <Button
      variant="secondary"
      disabled={!ready || savedError !== '' || pending || wishlisted}
      onclick={wishlist}>{wishlisted ? 'Wishlisted' : 'Wishlist'}</Button
    >
    {#if isPasteUrl(team.pasteUrl)}<Button
        href={team.pasteUrl}
        variant="secondary"
        target="_blank"
        rel="external noreferrer"
        ><ExternalLink aria-hidden="true" />Open original paste</Button
      >{/if}
    {#if paste}<Button
        variant="secondary"
        onclick={() =>
          copy(
            paste,
            isPasteUrl(team.pasteUrl) ? 'Team paste' : 'Published sets'
          )}
        ><Copy aria-hidden="true" />{isPasteUrl(team.pasteUrl)
          ? 'Copy team'
          : 'Copy published sets'}</Button
      >{/if}
    {#if team.replicaCode && team.replicaStatus === '✔'}<Button
        variant="secondary"
        onclick={() => copy(team.replicaCode || '', 'Replica code')}
        ><Copy aria-hidden="true" />Copy replica code</Button
      >{/if}
  </div>
  <p role="status" aria-live="polite" class="mt-2 min-h-6 text-[0.9375rem]">
    {copyStatus}
  </p>
  <p role="status" aria-live="polite" class="sr-only">{status}</p>
  {#if savedError || actionError}<p
      role="alert"
      class="text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {savedError || actionError}
    </p>{/if}
  {#if team.replicaCode}<p class="provenance">
      Replica code:
      <code class="font-mono text-sm text-base-content select-all"
        >{team.replicaCode}</code
      >
      <span class="mx-1.5"></span>{team.replicaStatus === '✔'
        ? 'Listed as available by the source; availability may change.'
        : 'The source does not list this code as available.'}
    </p>{/if}

  {#if team.pasteError}<p class="provenance mt-3">
      Some published details could not be loaded. {team.pasteError}
    </p>{/if}

  {#if !isPasteUrl(team.pasteUrl)}<p class="provenance mt-3">
      {team.paste
        ? 'Only published details are included; missing set fields remain unknown.'
        : 'Only the published roster is available; set details are unknown.'}
    </p>{/if}

  <section
    aria-label="Pokémon sets"
    class="mt-8 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"
  >
    {#each team.members as member, index (index)}
      <div class="plate overflow-hidden">
        <MemberCard {member} slot={index + 1} editable={false} />
      </div>
    {/each}
  </section>

  <section aria-labelledby="results-heading" class="mt-10">
    <h2
      id="results-heading"
      class="border-b border-base-300 pb-2 text-[1.375rem] font-extrabold wrap-break-word"
    >
      Results & sources
    </h2>
    <ul class="plate mt-4 divide-y">
      {#each team.reports as report, index (index)}
        {@const result = evidence(
          report,
          team.regulation,
          data.currentRegulation
        )}
        <li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div class="min-w-0">
            {#if team.reports.length > 1}<span
                class="stamp"
                data-grade={evidenceGrade(custom ? 3 : result.level)}
                >{result.label}</span
              >{/if}
            <div class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p class="value">
                {report.event || 'Event not listed'}
              </p>
              <p class="term">{result.platform}</p>
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
      <pre
        class="mt-4 overflow-x-auto font-mono text-xs leading-6">{paste}</pre>
    </details>
  {/if}
</main>
