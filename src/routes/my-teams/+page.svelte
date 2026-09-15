<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import TeamDifferences from '$lib/components/TeamDifferences.svelte';
  import { bestEvidence, type Team } from '$lib/catalog';
  import { parsePaste } from '$lib/paste';
  import {
    exportPaste,
    readSavedTeams,
    saveTeam,
    setText,
    similarTeams,
    useCandidate,
    type SavedTeam,
    replacementMembers,
  } from '$lib/workbench';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let saved = $state<SavedTeam[]>([]);
  let draft = $state<SavedTeam | null>(null);
  let baseline = $state('');
  let sets = $state<string[]>([]);
  let ready = $state(false);
  let message = $state('');
  let storageError = $state('');
  let candidateId = $state('');
  let limit = $state(12);
  let showExport = $state(false);
  let comparisonElement: HTMLElement | undefined = $state();
  let editorElement: HTMLElement | undefined = $state();
  const current = $derived(data.catalog.currentRegulation);
  const results = $derived(
    draft ? similarTeams(draft, data.catalog.teams as Team[], current) : []
  );
  const candidate = $derived(
    results.find((result) => result.id === candidateId)
  );
  const comparisonMembers = $derived(
    draft && candidate
      ? candidate.member
        ? replacementMembers(draft, candidate.member)
        : candidate.team.members
      : []
  );
  const dirty = $derived(
    !!draft &&
      (JSON.stringify(draft) !== baseline ||
        sets.join('\n\n') !== exportPaste(draft.members))
  );
  const editingSets = $derived(
    !!draft && sets.join('\n\n') !== exportPaste(draft.members)
  );

  function openSaved(id: string | null) {
    try {
      saved = readSavedTeams(localStorage);
      storageError = '';
      const entry = saved.find((team) => team.id === id);
      draft = entry ? JSON.parse(JSON.stringify(entry)) : null;
      baseline = JSON.stringify(draft);
      sets = draft ? draft.members.map(setText) : [];
      candidateId = '';
      limit = 12;
      showExport = false;
      message =
        id && !entry
          ? 'This saved team is not on this device. Choose a saved team or browse the catalog.'
          : '';
    } catch {
      storageError =
        'Saved teams could not be read. Check browser storage access. Existing data has been left untouched.';
    }
  }
  onMount(() => {
    ready = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  $effect(() => {
    if (!ready) return;
    const id = page.url.searchParams.get('team');
    untrack(() => openSaved(id));
  });
  beforeNavigate(({ cancel, willUnload }) => {
    if (willUnload) return;
    if (dirty && !confirm('Discard unsaved team changes?')) cancel();
  });

  function persist(next: SavedTeam) {
    try {
      saved = saveTeam(localStorage, next);
      draft = JSON.parse(JSON.stringify(next));
      baseline = JSON.stringify(draft);
      sets = next.members.map(setText);
      storageError = '';
      message = 'Changes saved on this device.';
    } catch {
      message =
        'Could not save changes. Check browser storage access and available space. Your edits are still here; existing saved data was not replaced.';
    }
  }
  function saveChanges() {
    if (!draft) return;
    if (!draft.name.trim()) {
      message = 'Give this team a name.';
      return;
    }
    try {
      const next = $state.snapshot(draft);
      if (editingSets) {
        const parsed = parsePaste(sets.join('\n\n'));
        const previous = parsePaste(exportPaste(next.members));
        next.members = parsed.map((member, index) =>
          sets[index] === setText(next.members[index])
            ? next.members[index]
            : {
                ...member,
                pokemon:
                  member.pokemon === previous[index].pokemon &&
                  member.item === previous[index].item
                    ? next.members[index].pokemon
                    : member.pokemon,
              }
        );
      }
      persist(next);
    } catch (error) {
      message =
        error instanceof Error
          ? error.message
          : 'Invalid set text. Changes were not saved.';
    }
  }
  function togglePokemon(index: number) {
    if (!draft) return;
    draft.changeSlot = draft.changeSlot === index ? null : index;
    candidateId = '';
    limit = 12;
  }
  async function applyCandidate() {
    if (!draft || !candidate || editingSets) return;
    try {
      draft = useCandidate($state.snapshot(draft), candidate);
      sets = draft.members.map(setText);
      candidateId = '';
      showExport = false;
      message =
        'Replacement loaded. Other five sets are unchanged. Review, then Save changes.';
      await tick();
      editorElement?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    } catch (error) {
      message =
        error instanceof Error ? error.message : 'Could not use candidate.';
    }
  }
  async function copyPaste() {
    if (!draft || editingSets) return;
    showExport = true;
    try {
      await navigator.clipboard.writeText(exportPaste(draft.members));
      message =
        'Team text copied. Unknown fields are omitted; no stats were guessed.';
    } catch {
      message = 'Clipboard unavailable. Select and copy the export text below.';
    }
  }
  async function selectCandidate(id: string) {
    candidateId = id;
    await tick();
    comparisonElement?.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
</script>

<svelte:head><title>My teams — Champion's Atlas</title></svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">My teams</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Keep your original. Explore changes. Save your own version.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button href={resolve('/my-teams/new')} class="min-h-11"
        >Add custom team</Button
      >
      <Button href={resolve('/')} variant="outline" class="min-h-11"
        >Browse teams</Button
      >
    </div>
  </div>
  {#if storageError}<p role="alert" class="mt-5 rounded-xl border p-4 text-sm">
      {storageError}
    </p>{/if}
  {#if !ready}<p class="mt-8 text-muted-foreground">Loading saved teams…</p>
  {:else if !storageError}
    <label class="mt-6 block max-w-xl text-sm font-medium"
      >Saved team
      <select
        class="filter-select mt-2"
        value={draft?.id || ''}
        onchange={(event) => {
          void goto(resolve(`/my-teams?team=${event.currentTarget.value}`));
        }}
      >
        <option value="">Choose a team</option>
        {#each saved as team (team.id)}<option value={team.id}
            >{team.name}</option
          >{/each}
      </select>
    </label>
    {#if !saved.length}<p
        class="mt-8 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
      >
        No saved teams yet. Open a catalog team and choose “Use this team”.
      </p>{/if}
    <p
      role="status"
      aria-live="polite"
      class="mt-4 min-h-6 text-sm text-primary"
    >
      {message}
    </p>
    {#if draft}
      <section
        aria-label="Your team"
        bind:this={editorElement}
        class="mt-4 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <label class="block w-full max-w-xl text-sm font-medium"
            >Team name<input
              class="filter-select mt-2"
              maxlength="200"
              bind:value={draft.name}
            /></label
          >
          <div class="flex flex-wrap gap-2">
            <Button class="min-h-11" onclick={saveChanges}>Save changes</Button
            ><Button
              variant="outline"
              class="min-h-11"
              disabled={editingSets}
              onclick={copyPaste}>Copy team text</Button
            >
          </div>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          {dirty ? 'Unsaved changes.' : 'Saved on this device.'} Original: {draft
            .original.name} · {draft.original.regulation}. Editing does not
          create a working rental code.
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each draft.members as member, index (index)}
            <section
              class="min-w-0 rounded-xl border p-4"
              aria-label={`${member.pokemon} set`}
            >
              <div class="flex items-center gap-3">
                <PokemonSprite pokemon={member.pokemon} size={64} />
                <div class="min-w-0">
                  <h2 class="font-semibold wrap-break-word">
                    {member.pokemon}
                  </h2>
                  <p class="mt-1 text-sm wrap-break-word text-primary">
                    {member.item || 'Item unknown'}
                  </p>
                </div>
              </div>
              <Button
                variant={draft.changeSlot === index ? 'default' : 'outline'}
                class="mt-3 min-h-11"
                aria-pressed={draft.changeSlot === index}
                disabled={editingSets}
                onclick={() => togglePokemon(index)}
                >Change {member.pokemon}</Button
              >
              <details class="mt-3">
                <summary class="cursor-pointer py-2 text-sm text-primary"
                  >Edit set</summary
                >
                <label class="mt-2 block text-xs text-muted-foreground"
                  >Set text for {member.pokemon}<textarea
                    class="mt-2 min-h-64 w-full rounded-lg border bg-background p-3 font-mono text-xs leading-5"
                    maxlength="8000"
                    bind:value={sets[index]}></textarea></label
                >
              </details>
            </section>
          {/each}
        </div>
        <p class="mt-4 text-xs leading-5 text-muted-foreground">
          {draft.changeSlot === null
            ? 'Keeping all six. Choose one Pokémon above to explore replacements.'
            : `Changing ${draft.members[draft.changeSlot].pokemon} only. Other five sets stay unchanged.`}
          Save set edits before comparing. Published text preserves IVs and other
          extra lines; unknown details stay omitted.
        </p>
        {#if showExport}<label class="mt-4 block text-sm font-medium"
            >Export text<textarea
              readonly
              class="mt-2 min-h-72 w-full rounded-lg border p-3 font-mono text-xs"
              value={exportPaste(draft.members)}></textarea></label
          >{/if}
        <details class="mt-5">
          <summary class="cursor-pointer py-2 text-sm font-medium"
            >Original & source history</summary
          >
          <p class="mt-2 text-xs text-muted-foreground">
            Sources document where sets came from. Manual changes are your
            draft, not claims about the original team.
          </p>
          {#if draft.sources.length}<ul class="mt-3 space-y-3 text-sm">
              {#each draft.sources as source (source.pasteUrl)}<li>
                  <Button
                    href={source.pasteUrl}
                    variant="outline"
                    class="min-h-11 whitespace-normal"
                    rel="external noreferrer"
                    target="_blank"
                    ><ExternalLink aria-hidden="true" />{source.name}</Button
                  >
                </li>{/each}
            </ul>
          {:else}<p class="mt-3 text-sm text-muted-foreground">
              No published sources; created from your team text.
            </p>{/if}
          <pre
            class="mt-4 overflow-x-auto rounded-lg bg-secondary p-3 text-xs leading-5">{draft
              .original.paste || exportPaste(draft.original.members)}</pre>
          <TeamDifferences
            before={draft.original.members}
            after={draft.members}
            beforeLabel="Original"
            afterLabel="Your version"
          />
        </details>
      </section>

      <section aria-label="Similar teams" class="mt-8">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="text-2xl font-semibold">Find similar teams</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {draft.changeSlot === null
                ? 'Similar teams for reference. Your team stays unchanged until you choose a Pokémon to change.'
                : 'Alternative builds first, then different species from similar teams. Only the selected slot changes.'}
              Shared Pokémon first, matching known set details next, reported results
              break ties. All regulations included; alternatives are not proven upgrades.
            </p>
          </div>
        </div>
        <p class="mt-4 text-sm" aria-live="polite">
          {results.length} matching alternatives. Current-regulation legality remains
          unverified.
        </p>
        {#if editingSets}<p class="mt-4 rounded-lg border p-4 text-sm">
            Save set edits to update comparisons.
          </p>{/if}
        {#if candidate}
          {@const evidence = bestEvidence(candidate.team, current)}
          <section
            aria-label="Selected comparison"
            bind:this={comparisonElement}
            class="mt-5 rounded-2xl border bg-card p-5"
          >
            <h3 class="text-lg font-semibold">
              {candidate.member
                ? `Replace ${draft.members[draft.changeSlot!].pokemon} with ${candidate.member.pokemon}`
                : `Compare with ${candidate.team.name}`}
            </h3>
            <p class="mt-2 text-sm text-muted-foreground">
              {candidate.team.regulation} · {evidence.label} · {evidence.event ||
                'No event reported'}
            </p>
            <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
              {#if candidate.team.regulation === current}<span
                  class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
                  >Current regulation</span
                >{/if}
              {#if evidence.level <= 2}<span
                  class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
                  >Strong evidence</span
                >{/if}
            </div>
            <TeamDifferences before={draft.members} after={comparisonMembers} />
            <div class="mt-5 flex flex-wrap gap-3">
              {#if candidate.member}<Button
                  class="min-h-11"
                  disabled={editingSets}
                  onclick={applyCandidate}>Use replacement</Button
                >{/if}<Button
                href={candidate.team.pasteUrl}
                variant="outline"
                class="min-h-11"
                rel="external noreferrer"
                target="_blank"
                ><ExternalLink aria-hidden="true" />Candidate source</Button
              >
            </div>
            <p class="mt-3 text-xs text-muted-foreground">
              {candidate.member
                ? 'Only the selected slot will change. Original and source history stay saved.'
                : 'Reference comparison only. Choose one Pokémon above to explore a replacement.'}
            </p>
          </section>
        {/if}
        <div class="mt-5 grid gap-3 md:grid-cols-2">
          {#each results.slice(0, limit) as result (result.id)}
            {@const evidence = bestEvidence(result.team, current)}
            <article
              class="min-w-0 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <p class="text-xs text-primary">
                Source: {result.shared}/6 Pokémon shared · {result.details} matching
                set details · {result.team.regulation}
              </p>
              <div class="mt-2 flex items-center gap-3">
                {#if result.member}<PokemonSprite
                    pokemon={result.member.pokemon}
                    size={32}
                  />{:else}<ul
                    class="grid shrink-0 grid-cols-3 gap-1"
                    aria-label="Team members"
                  >
                    {#each result.team.members as member (member.pokemon)}<li>
                        <PokemonSprite pokemon={member.pokemon} size={24} />
                      </li>{/each}
                  </ul>{/if}
                <h3 class="min-w-0 font-semibold wrap-break-word">
                  {result.member
                    ? `${result.member.pokemon} · ${result.member.item || 'Item unknown'}`
                    : result.team.name}
                </h3>
              </div>
              <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
                {#if result.team.regulation === current}<span
                    class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
                    >Current regulation</span
                  >{/if}
                {#if evidence.level <= 2}<span
                    class="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary"
                    >Strong evidence</span
                  >{/if}
              </div>
              {#if result.member}<p class="mt-2 text-xs text-muted-foreground">
                  {result.member.moves.join(' · ') || 'Moves unknown'}
                </p>
                <p class="mt-2 text-xs">From {result.team.name}</p>{/if}
              <p class="mt-2 text-xs leading-5 text-muted-foreground">
                {result.team.members
                  .map((member) => member.pokemon)
                  .join(' · ')}
              </p>
              <p class="mt-3 text-xs">
                {evidence.label} · {evidence.event || 'No event reported'}
              </p>
              {#if !result.team.paste}<p
                  class="mt-2 text-xs text-muted-foreground"
                >
                  Set details incomplete.
                </p>{/if}
              <Button
                variant="outline"
                class="mt-4 min-h-11"
                disabled={editingSets}
                onclick={() => selectCandidate(result.id)}
                >{result.member
                  ? `Compare ${result.member.pokemon}`
                  : `Compare ${result.team.creator || 'team'}`}</Button
              >
            </article>
          {/each}
        </div>
        {#if !results.length}<p
            class="mt-5 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
          >
            No alternatives found in this catalog. {draft.changeSlot === null
              ? 'Choose one Pokémon to explore individual replacements.'
              : 'Try choosing another Pokémon to change.'}
          </p>{/if}
        {#if results.length > limit}<Button
            variant="outline"
            class="mt-5 min-h-11"
            onclick={() => (limit += 12)}>Show more alternatives</Button
          >{/if}
      </section>
    {/if}
  {/if}
</main>
