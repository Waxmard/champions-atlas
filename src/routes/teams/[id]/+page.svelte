<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
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
    type Team,
  } from '$lib/catalog';
  import {
    activeTeamKey,
    exportPaste,
    newSavedTeam,
    saveTeam,
  } from '$lib/workbench';
  import { pushNow } from '$lib/sync.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const team: Team = $derived(data.team);
  const paste = $derived(team.paste ? exportPaste(team.members) : '');
  const strongest = $derived(bestEvidence(team, data.currentRegulation));
  let ready = $state(false);
  let copyStatus = $state('');
  onMount(() => {
    ready = true;
  });
  function useTeam() {
    try {
      const saved = newSavedTeam(team);
      saveTeam(localStorage, saved);
      localStorage.setItem(activeTeamKey, saved.id);
      void pushNow();
      void goto(resolve(`/my-teams?team=${saved.id}`));
    } catch {
      copyStatus =
        'Could not save this team. Check browser storage access and available space. Existing saved teams were not replaced.';
    }
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
  <a
    href={resolve(`/?${page.url.searchParams}`)}
    onclick={back}
    class="provenance inline-flex min-h-11 items-center gap-2 text-[0.8125rem] outline-none hover:text-base-content focus-visible:ring-2 focus-visible:ring-primary"
    ><ArrowLeft class="size-4" aria-hidden="true" />Back to teams</a
  >

  <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span
      class="rounded-[var(--radius-selector)] border border-base-300 bg-base-100 px-2.5 py-0.5 text-[0.8125rem] leading-tight font-bold"
      >Reg {team.regulation}</span
    >
    <span class="stamp" data-grade={evidenceGrade(strongest.level)}
      >{strongest.label}</span
    >
    {#if strongest.event}<span class="provenance">{strongest.event}</span>{/if}
    <span class="provenance">Shared {team.publishedAt || 'date unknown'}</span>
  </div>

  <h1
    class="mt-4 max-w-3xl text-[1.75rem] leading-tight font-extrabold tracking-tight wrap-break-word sm:text-4xl"
  >
    {team.name}
  </h1>
  <p class="provenance mt-2.5">By {team.creator || 'an unlisted creator'}</p>

  <div class="mt-6 flex flex-wrap gap-2.5">
    <Button class="min-h-11 px-4" disabled={!ready} onclick={useTeam}
      >Use this team</Button
    >
    <Button
      href={team.pasteUrl}
      variant="outline"
      class="min-h-11 px-4"
      target="_blank"
      rel="external noreferrer"
      ><ExternalLink aria-hidden="true" />Open original paste</Button
    >
    {#if paste}<Button
        variant="outline"
        class="min-h-11 px-4"
        onclick={() => copy(paste, 'Team paste')}
        ><Copy aria-hidden="true" />Copy team</Button
      >{/if}
    {#if team.replicaCode && team.replicaStatus === '✔'}<Button
        variant="outline"
        class="min-h-11 px-4"
        onclick={() => copy(team.replicaCode || '', 'Replica code')}
        ><Copy aria-hidden="true" />Copy replica code</Button
      >{/if}
  </div>
  <p role="status" aria-live="polite" class="mt-2 min-h-6 text-[0.9375rem]">
    {copyStatus}
  </p>
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
                data-grade={evidenceGrade(result.level)}>{result.label}</span
              >{/if}
            <div class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p class="value">
                {report.event || 'Event not listed'}
              </p>
              <p class="term">{result.platform}</p>
            </div>
          </div>
          {#if report.sourceUrl}<Button
              href={report.sourceUrl}
              variant="outline"
              class="min-h-11"
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
