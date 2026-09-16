<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
  import Copy from '@lucide/svelte/icons/copy';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import { bestEvidence, evidence, type Team } from '$lib/catalog';
  import {
    activeTeamKey,
    exportPaste,
    newSavedTeam,
    saveTeam,
  } from '$lib/workbench';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const team: Team = $derived(data.team);
  const paste = $derived(team.paste ? exportPaste(team.members) : '');
  const strongest = $derived(bestEvidence(team, data.currentRegulation));
  let copyStatus = $state('');
  function useTeam() {
    try {
      const saved = newSavedTeam(team);
      saveTeam(localStorage, saved);
      localStorage.setItem(activeTeamKey, saved.id);
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
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = `${label} copied.`;
    } catch {
      copyStatus = 'Copy unavailable. Select and copy the text below.';
    }
  }
</script>

<svelte:head>
  <title>{team.name} — Champion's Atlas</title>
  <meta
    name="description"
    content={`${team.regulation} doubles team by ${team.creator}. View published team members, items, and result sources.`}
  />
</svelte:head>

<main id="main" class="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
  <a
    href={resolve(`/?${page.url.searchParams}`)}
    onclick={back}
    class="mb-7 inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-primary outline-none hover:underline focus-visible:ring-2"
    ><ArrowLeft class="size-4" aria-hidden="true" />Back to teams</a
  >
  <div class="flex flex-wrap items-center gap-2 text-xs">
    <span class="rounded-md border bg-card px-2 py-1 font-semibold"
      >Reg {team.regulation}</span
    >
    {#if team.regulation === data.currentRegulation}<span
        class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
        >Current regulation</span
      >{/if}
    {#if strongest.level <= 2}<span
        class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
        >Strong evidence</span
      >{/if}
    <span class="text-muted-foreground"
      >Shared {team.publishedAt || 'date unknown'} · Doubles</span
    >
  </div>
  <h1
    class="mt-4 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
  >
    {team.name}
  </h1>
  <p class="mt-3 text-muted-foreground">
    By {team.creator || 'an unlisted creator'}
  </p>
  <div class="mt-6 flex flex-wrap gap-3">
    <Button class="min-h-11 px-4" onclick={useTeam}>Use this team</Button>
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
  <p role="status" aria-live="polite" class="mt-2 min-h-6 text-sm text-primary">
    {copyStatus}
  </p>
  {#if team.replicaCode}<p class="text-sm text-muted-foreground">
      Replica code: <code class="font-semibold text-foreground select-all"
        >{team.replicaCode}</code
      >
      · {team.replicaStatus === '✔'
        ? 'Listed as available by source; availability may change.'
        : 'Source does not list this code as available.'}
    </p>{/if}
  <p
    role="alert"
    class="mt-5 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6"
  >
    <AlertTriangle
      class="mt-1 size-4 shrink-0 text-destructive"
      aria-hidden="true"
    />
    <span
      >Current-regulation legality is unverified. {team.regulation !==
      data.currentRegulation
        ? `This team was shared for ${team.regulation}; check it against ${data.currentRegulation} before using it.`
        : 'The regulation label comes from the source sheet.'} Missing set details
      remain unknown.</span
    >
  </p>
  {#if team.pasteError}<p class="mt-3 text-sm text-muted-foreground">
      Some published details could not be loaded. {team.pasteError}
    </p>{/if}

  <section
    aria-label="Pokémon sets"
    class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
  >
    {#each team.members as member, index (index)}
      <article class="rounded-2xl border bg-card p-5">
        <div class="flex items-center gap-3">
          <PokemonSprite pokemon={member.pokemon} size={64} />
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">
              Slot {index + 1}
            </p>
            <h2 class="mt-1 text-lg font-semibold wrap-break-word">
              {member.pokemon}
            </h2>
            <p
              class="mt-1 flex items-center gap-1 text-sm wrap-break-word text-primary"
            >
              {#if member.item}<ItemIcon
                  item={member.item}
                />{/if}{member.item || 'Item unknown'}
            </p>
          </div>
        </div>
        <dl
          class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t pt-4 text-xs"
        >
          <dt class="text-muted-foreground">Ability</dt>
          <dd>{member.ability || 'Unknown'}</dd>
          <dt class="text-muted-foreground">Nature</dt>
          <dd>{member.nature || 'Unknown'}</dd>
        </dl>
        {#if member.moves.length}
          <ul
            class="mt-4 space-y-1.5 text-sm"
            aria-label={`Moves for ${member.pokemon}`}
          >
            {#each member.moves as move (move)}<li
                class="rounded-md bg-secondary/70 px-3 py-2"
              >
                {move}
              </li>{/each}
          </ul>
        {:else}<p class="mt-5 text-sm text-muted-foreground">
            Moves not loaded. Check the original paste.
          </p>{/if}
        <p class="mt-4 text-xs leading-5 text-muted-foreground">
          Spread as published: <span class="text-foreground"
            >{member.spread || 'Unknown'}</span
          >
        </p>
      </article>
    {/each}
  </section>

  <section aria-labelledby="results-heading" class="mt-10">
    <h2 id="results-heading" class="text-lg font-semibold">
      Results & sources
    </h2>
    <p class="mt-2 text-sm text-muted-foreground">
      Claims transcribed from VGCPastes, not independently verified.
    </p>
    <ul class="mt-4 divide-y rounded-xl border bg-card">
      {#each team.reports as report, index (index)}
        {@const result = evidence(
          report,
          team.regulation,
          data.currentRegulation
        )}
        <li class="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p class="text-sm font-medium">{result.label}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {report.event || 'Event not listed'} · {result.platform}
            </p>
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
    <p class="mt-3 text-xs text-muted-foreground">
      Sheet entries: {team.sheetIds.join(', ')}. Pastes can use base species
      names while the sheet lists Mega forms.
    </p>
  </section>
  {#if paste}
    <details class="mt-8 rounded-xl border bg-card p-5">
      <summary class="cursor-pointer text-sm font-medium"
        >Published paste text</summary
      >
      {#if team.pasteNotes}<p class="mt-3 text-xs text-muted-foreground">
          Paste notes (may differ from sheet regulation): {team.pasteNotes}
        </p>{/if}
      <pre class="mt-4 overflow-x-auto text-xs leading-6">{paste}</pre>
    </details>
  {/if}
</main>
