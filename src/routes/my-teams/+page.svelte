<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import TeamDifferences from '$lib/components/TeamDifferences.svelte';
  import SimilarTeamCard from '$lib/components/SimilarTeamCard.svelte';
  import SetEditorSheet from '$lib/components/SetEditorSheet.svelte';
  import { bestEvidence, type Member, type Team } from '$lib/catalog';
  import {
    activeTeamKey,
    exportPaste,
    readSavedTeams,
    resolveSavedTeamId,
    saveTeam,
    similarTeams,
    useCandidate,
    type SavedTeam,
    replacementMembers,
  } from '$lib/workbench';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let saved = $state<SavedTeam[]>([]),
    draft = $state<SavedTeam | null>(null),
    baseline = $state('');
  let ready = $state(false),
    message = $state(''),
    storageError = $state('');
  let candidateId = $state(''),
    limit = $state(12),
    showExport = $state(false);
  let activeEditIndex = $state<number | null>(null),
    originalMember = $state<Member | null>(null),
    editorDirty = $state(false);
  let editorRef = $state<{ apply: () => boolean } | undefined>();
  let comparisonElement = $state<HTMLElement>(),
    editorElement = $state<HTMLElement>();
  const current = $derived(data.catalog.currentRegulation);
  const results = $derived(
    draft ? similarTeams(draft, data.catalog.teams as Team[], current) : []
  );
  const candidate = $derived(results.find((r) => r.id === candidateId));
  const comparisonMembers = $derived(
    draft && candidate
      ? candidate.member
        ? replacementMembers(draft, candidate.member)
        : candidate.team.members
      : []
  );
  const editing = $derived(activeEditIndex !== null);
  const dirty = $derived(
    (!!draft && JSON.stringify(draft) !== baseline) || editorDirty
  );

  function openSaved(id: string | null) {
    try {
      saved = readSavedTeams(localStorage);
      storageError = '';
      const activeId = localStorage.getItem(activeTeamKey);
      const resolvedId = resolveSavedTeamId(saved, id, activeId);
      const entry = saved.find((team) => team.id === resolvedId);
      draft = entry ? JSON.parse(JSON.stringify(entry)) : null;
      baseline = JSON.stringify(draft);
      if (entry) {
        localStorage.setItem(activeTeamKey, entry.id);
        if (page.url.searchParams.get('team') !== entry.id) {
          void goto(resolve(`/my-teams?team=${entry.id}`), {
            replaceState: true,
          });
        }
      }
      candidateId = '';
      limit = 12;
      showExport = false;
      activeEditIndex = null;
      originalMember = null;
      editorDirty = false;
      message =
        id && !entry && !resolveSavedTeamId(saved, null, activeId)
          ? 'This saved team is not on this device. Choose a saved team or browse the catalog.'
          : '';
    } catch {
      storageError =
        'Saved teams could not be read. Check browser storage access. Existing data has been left untouched.';
    }
  }
  function persistIfDirty() {
    if (
      draft &&
      !editing &&
      draft.name.trim() &&
      JSON.stringify(draft) !== baseline
    ) {
      persist($state.snapshot(draft));
    }
  }
  onMount(() => {
    ready = true;
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onHide = () => persistIfDirty();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistIfDirty();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (activeEditIndex === null) return;
      const target = e.target as HTMLElement | null;
      const card = document.getElementById(`pokemon-slot-${activeEditIndex}`);
      if (
        target &&
        card &&
        !card.contains(target) &&
        !target.closest(
          '[data-bits-combobox-content], [role="listbox"], [role="dialog"]'
        )
      ) {
        editorRef?.apply();
      }
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onPointerDown);
    };
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
      localStorage.setItem(activeTeamKey, next.id);
      draft = JSON.parse(JSON.stringify(next));
      baseline = JSON.stringify(draft);
      storageError = '';
      message = 'Changes saved on this device.';
    } catch {
      message =
        'Could not save changes. Check browser storage access and available space. Your edits are still here; existing saved data was not replaced.';
    }
  }
  function saveChanges() {
    if (!draft || editing) return;
    if (!draft.name.trim()) {
      message = 'Give this team a name.';
      return;
    }
    persist($state.snapshot(draft));
  }
  const scrollSmooth = (
    el?: HTMLElement | null,
    block: ScrollLogicalPosition = 'start'
  ) =>
    el?.scrollIntoView({
      block,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  const openSetEditor = (index: number) => {
    if (editing) return;
    activeEditIndex = index;
    originalMember = draft
      ? structuredClone($state.snapshot(draft.members[index]))
      : null;
    editorDirty = false;
    void tick().then(() =>
      scrollSmooth(document.getElementById(`pokemon-slot-${index}`), 'center')
    );
  };
  function applySetEdit(index: number, member: Member) {
    if (!draft) return;
    draft.members[index] = member;
    activeEditIndex = null;
    originalMember = null;
    editorDirty = false;
    persist($state.snapshot(draft));
    void tick().then(() =>
      scrollSmooth(document.getElementById(`pokemon-slot-${index}`), 'center')
    );
  }
  function cancelSetEdit() {
    if (draft && activeEditIndex !== null && originalMember) {
      draft.members[activeEditIndex] = originalMember;
    }
    const targetSlot = activeEditIndex;
    activeEditIndex = null;
    originalMember = null;
    editorDirty = false;
    if (targetSlot !== null) {
      void tick().then(() =>
        scrollSmooth(
          document.getElementById(`pokemon-slot-${targetSlot}`),
          'center'
        )
      );
    }
  }
  function togglePokemon(index: number) {
    if (!draft || editing) return;
    draft.changeSlot = draft.changeSlot === index ? null : index;
    candidateId = '';
    limit = 12;
  }
  async function applyCandidate() {
    if (!draft || !candidate || editing) return;
    try {
      draft = useCandidate($state.snapshot(draft), candidate);
      candidateId = '';
      showExport = false;
      message =
        'Replacement loaded. Other five sets are unchanged. Review, then Save changes.';
      await tick();
      scrollSmooth(editorElement);
    } catch (error) {
      message =
        error instanceof Error ? error.message : 'Could not use candidate.';
    }
  }
  async function copyPaste() {
    if (!draft || editing) return;
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
    if (editing) return;
    candidateId = id;
    await tick();
    scrollSmooth(comparisonElement);
  }
</script>

<svelte:head><title>My teams — Champion's Atlas</title></svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  {#if activeEditIndex !== null}
    <div
      class="pointer-events-none fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 motion-reduce:transition-none"
      aria-hidden="true"
    ></div>
  {/if}
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
    {#if saved.length}
      <label class="mt-6 block max-w-xl text-sm font-medium"
        >Saved team
        <select
          class="filter-select mt-2"
          value={draft?.id || ''}
          onchange={(event) => {
            void goto(resolve(`/my-teams?team=${event.currentTarget.value}`));
          }}
        >
          {#each saved as team (team.id)}<option value={team.id}
              >{team.name}</option
            >{/each}
        </select>
      </label>
    {:else}
      <p
        class="mt-8 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
      >
        No saved teams yet. Open a catalog team and choose “Use this team”.
      </p>
    {/if}
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
            <Button class="min-h-11" disabled={editing} onclick={saveChanges}
              >Save changes</Button
            ><Button
              variant="outline"
              class="min-h-11"
              disabled={editing}
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
              id={`pokemon-slot-${index}`}
              class="min-w-0 rounded-xl border p-4 transition-[grid-column,border-color,background-color] duration-200 motion-reduce:transition-none {activeEditIndex ===
              index
                ? 'relative z-50 bg-card shadow-2xl ring-1 ring-primary sm:col-span-2 lg:col-span-3'
                : ''}"
              aria-label={`${member.pokemon} set`}
            >
              {#if activeEditIndex === index}
                <SetEditorSheet
                  bind:this={editorRef}
                  {member}
                  teams={data.catalog.teams as Team[]}
                  currentRegulation={current}
                  onapply={(next) => applySetEdit(index, next)}
                  oncancel={cancelSetEdit}
                  ondirtychange={(value) => (editorDirty = value)}
                />
              {:else}<div class="flex items-center gap-3">
                  <PokemonSprite pokemon={member.pokemon} size={64} />
                  <div class="min-w-0">
                    <h2 class="font-semibold wrap-break-word">
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
                <div class="mt-3 min-w-0 text-sm">
                  <p class="wrap-break-word">
                    {#if member.ability}<span class="text-muted-foreground"
                        >Ability:</span
                      >
                      {member.ability}{:else}<span class="text-muted-foreground"
                        >Ability unknown</span
                      >{/if}
                  </p>
                  {#if member.moves.length}
                    <ul
                      class="mt-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1"
                      aria-label={`${member.pokemon} moves`}
                    >
                      {#each member.moves as move (move)}
                        <li class="min-w-0 wrap-break-word">{move}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="mt-2 text-muted-foreground">Moves unknown</p>
                  {/if}
                </div>
                <div class="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant={draft.changeSlot === index ? 'default' : 'outline'}
                    class="min-h-11 min-w-0"
                    aria-label={`Change ${member.pokemon}`}
                    aria-pressed={draft.changeSlot === index}
                    disabled={editing}
                    onclick={() => togglePokemon(index)}>Change</Button
                  >
                  <Button
                    variant="outline"
                    class="min-h-11 min-w-0"
                    aria-label={`Edit ${member.pokemon} set`}
                    disabled={editing}
                    onclick={() => openSetEditor(index)}>Edit set</Button
                  >
                </div>
              {/if}
            </section>
          {/each}
        </div>
        <p class="mt-4 text-xs leading-5 text-muted-foreground">
          {draft.changeSlot === null
            ? 'Keeping all six. Choose one Pokémon above to explore replacements.'
            : `Changing ${draft.members[draft.changeSlot].pokemon} only. Other five sets stay unchanged.`}
          Team text normalizes to Pokémon Champions format (EVs out of 32, no IVs);
          unknown details stay omitted.
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
            class="mt-4 overflow-x-auto rounded-lg bg-secondary p-3 text-xs leading-5">{exportPaste(
              draft.original.members
            )}</pre>
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
                  disabled={editing}
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
            <SimilarTeamCard
              {result}
              {current}
              {editing}
              onselect={selectCandidate}
            />
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
            disabled={editing}
            onclick={() => (limit += 12)}>Show more alternatives</Button
          >{/if}
      </section>
    {/if}
  {/if}
</main>
