<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import MemberCard from '$lib/components/MemberCard.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import { Button } from '$lib/components/ui/button';
  import SetEditorSheet from '$lib/components/SetEditorSheet.svelte';
  import { copyText } from '$lib/clipboard';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    activeTeamKey,
    exportPaste,
    readSavedTeams,
    resolveSavedTeamId,
    saveTeam,
    speciesMember,
    type SavedTeam,
  } from '$lib/workbench';
  import { pushNow } from '$lib/sync.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let saved = $state<SavedTeam[]>([]),
    draft = $state<SavedTeam | null>(null),
    baseline = $state('');
  let ready = $state(false),
    message = $state(''),
    storageError = $state('');
  let showExport = $state(false);
  let activeEditIndex = $state<number | null>(null),
    activeEditField = $state<EditableSetField>('set'),
    editorDirty = $state(false);
  let editedSlots = new SvelteSet<number>();
  let editorRef = $state<
    | {
        focusInitialSection: () => void;
        requestCancel: () => boolean;
      }
    | undefined
  >();
  let pendingSpecies = $state<string | null>(null);
  const teams = $derived(data.catalog.teams as Team[]);
  const allSpecies = $derived(
    [
      ...new Set(teams.flatMap((team) => team.members.map((m) => m.pokemon))),
    ].sort()
  );
  const availableSpecies = $derived(
    allSpecies.filter(
      (p) =>
        !(draft?.members ?? []).some(
          (m) => normalize(m.pokemon) === normalize(p)
        )
    )
  );
  const current = $derived(data.catalog.currentRegulation);
  const editing = $derived(activeEditIndex !== null);
  const dirty = $derived(
    (!!draft && JSON.stringify(draft) !== baseline) || editorDirty
  );

  function revealPanel(node: HTMLElement) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.dataset.motionReady = 'true';
    node.dataset.open = 'false';
    const frame = requestAnimationFrame(() => (node.dataset.open = 'true'));
    return { destroy: () => cancelAnimationFrame(frame) };
  }

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
      showExport = false;
      activeEditIndex = null;
      editorDirty = false;
      editedSlots.clear();
      pendingSpecies = null;
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
    if (editing) return;
    saveTeamName();
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
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
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

  function saveTeamName() {
    if (!draft || editing) return;
    const trimmed = draft.name.trim();
    if (!trimmed) {
      message = 'Give this team a name.';
      return;
    }
    const currentBase = baseline ? (JSON.parse(baseline) as SavedTeam) : null;
    if (currentBase && draft.name === currentBase.name) return;
    try {
      const currentSaved = saved.find((t) => t.id === draft!.id);
      const teamToSave: SavedTeam = {
        ...(currentSaved ?? $state.snapshot(draft)),
        name: draft.name,
      };
      saved = saveTeam(localStorage, teamToSave);
      localStorage.setItem(activeTeamKey, teamToSave.id);
      void pushNow();
      if (currentBase) {
        currentBase.name = draft.name;
        baseline = JSON.stringify(currentBase);
      }
      message = 'Team name saved.';
    } catch {
      message = 'Could not save team name.';
    }
  }

  function applyPokemon(index: number) {
    if (!draft) return;
    const pokemonName = draft.members[index]?.pokemon || 'Pokémon';
    try {
      const currentSaved = saved.find((t) => t.id === draft!.id);
      const baseMembers = currentSaved
        ? currentSaved.members
        : (JSON.parse(baseline).members as Member[]);
      const updatedMembers = [...baseMembers];
      updatedMembers[index] = $state.snapshot(draft.members[index]);

      const teamToSave: SavedTeam = {
        ...(currentSaved ?? $state.snapshot(draft)),
        name: draft.name.trim() || currentSaved?.name || draft.name,
        members: updatedMembers,
      };

      saved = saveTeam(localStorage, teamToSave);
      localStorage.setItem(activeTeamKey, teamToSave.id);
      void pushNow();

      if (baseline) {
        const nextBase = JSON.parse(baseline) as SavedTeam;
        nextBase.members[index] = JSON.parse(
          JSON.stringify(updatedMembers[index])
        );
        nextBase.name = teamToSave.name;
        baseline = JSON.stringify(nextBase);
      } else {
        baseline = JSON.stringify(teamToSave);
      }

      editedSlots.delete(index);

      storageError = '';
      message = `${pokemonName} changes applied and saved.`;
    } catch {
      message =
        'Could not save changes. Check browser storage access and available space. Your edits are still here; existing saved data was not replaced.';
    }
  }

  function discardPokemon(index: number) {
    if (!draft) return;
    const pokemonName = draft.members[index]?.pokemon || 'Pokémon';
    try {
      const base = JSON.parse(baseline) as SavedTeam;
      if (base?.members?.[index]) {
        draft.members[index] = JSON.parse(JSON.stringify(base.members[index]));
      }
      editedSlots.delete(index);
      message = `${pokemonName} changes discarded.`;
    } catch {
      message = 'Could not discard changes.';
    }
  }
  const focusSetField = (index: number, field: EditableSetField) =>
    document
      .getElementById(`pokemon-slot-${index}`)
      ?.querySelector<HTMLButtonElement>(`[data-set-field="${field}"]`)
      ?.focus({ preventScroll: true });
  const openSetEditor = (index: number, field: EditableSetField) => {
    if (editing) return;
    pendingSpecies = null;
    activeEditIndex = index;
    activeEditField = field;
    editorDirty = false;
  };
  function openSetDialog(node: HTMLDialogElement) {
    const { scrollX, scrollY } = window;
    const body = document.body;
    const styles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    node.showModal();
    void tick().then(() => editorRef?.focusInitialSection());
    return {
      destroy() {
        if (node.open) node.close();
        body.style.position = styles.position;
        body.style.top = styles.top;
        body.style.left = styles.left;
        body.style.width = styles.width;
        body.style.overflow = styles.overflow;
        window.scrollTo(scrollX, scrollY);
      },
    };
  }
  function handleDialogCancel(event: Event) {
    event.preventDefault();
    if (editorRef?.requestCancel() ?? true) cancelSetEdit();
  }
  function applySetEdit(index: number, member: Member) {
    if (!draft) return;
    const field = activeEditField;
    draft.members[index] = member;
    editedSlots.add(index);
    activeEditIndex = null;
    editorDirty = false;
    message = 'Set changes staged. Apply on the card to save.';
    void tick().then(() => {
      focusSetField(index, field);
    });
  }
  function cancelSetEdit() {
    const targetSlot = activeEditIndex;
    const field = activeEditField;
    activeEditIndex = null;
    editorDirty = false;
    if (targetSlot !== null) {
      void tick().then(() => {
        focusSetField(targetSlot, field);
      });
    }
  }
  function startSpeciesSwap(pokemon: string) {
    if (editing) return;
    pendingSpecies = pokemon;
  }
  function cancelSpeciesSwap() {
    pendingSpecies = null;
  }
  function applySpeciesSwap(index: number) {
    if (!draft || !pendingSpecies) return;
    const teammates = draft.members.filter((_, i) => i !== index);
    draft.members[index] = speciesMember(
      pendingSpecies,
      teammates,
      teams,
      current
    ) ?? {
      pokemon: pendingSpecies,
      item: null,
      ability: null,
      nature: null,
      spread: null,
      moves: [],
    };
    editedSlots.add(index);
    pendingSpecies = null;
    message = 'Pokémon swapped. Apply on the card to save.';
  }
  async function copyPaste() {
    if (!draft || editing) return;
    showExport = true;
    const ok = await copyText(exportPaste(draft.members));
    message = ok
      ? 'Team text copied. Unknown fields are omitted; no stats were guessed.'
      : 'Clipboard unavailable. Select and copy the export text below.';
  }
</script>

<svelte:head><title>My teams — Champion's Atlas</title></svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">My teams</h1>
      <p class="mt-2 text-sm text-base-content/70">
        Keep your original. Explore changes. Save your own version.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button href={resolve('/my-teams/new')} class="min-h-11"
        >Add custom team</Button
      >
      <Button href={resolve('/?browse=all')} variant="outline" class="min-h-11"
        >Browse teams</Button
      >
    </div>
  </div>
  {#if storageError}<p role="alert" class="mt-5 alert alert-error">
      {storageError}
    </p>{/if}
  {#if !ready}<p class="mt-8 text-base-content/70">Loading saved teams…</p>
  {:else if !storageError}
    {#if saved.length}
      <label class="mt-6 block max-w-xl text-sm font-medium"
        >Saved team
        <select
          class="select mt-2 min-h-11 w-full"
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
        class="mt-8 rounded-xl border border-dashed p-6 text-sm text-base-content/70"
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
        class="card mt-4 bg-base-100 p-5 card-border sm:p-6"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <label class="block w-full max-w-xl text-sm font-medium"
            >Team name<input
              class="input mt-2 min-h-11 w-full"
              maxlength="200"
              bind:value={draft.name}
              onblur={saveTeamName}
              onkeydown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            /></label
          >
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              class="min-h-11"
              disabled={editing}
              onclick={copyPaste}>Copy team text</Button
            >
          </div>
        </div>
        <p class="mt-3 text-xs text-base-content/70">
          {dirty ? 'Unsaved changes.' : 'Saved on this device.'} Original: {draft
            .original.name} · {draft.original.regulation}. Editing does not
          create a working rental code.
        </p>
        <div class="mt-5 flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <PokemonPicker
              options={availableSpecies}
              onselect={startSpeciesSwap}
              disabled={editing}
              label="Change a Pokémon"
              placeholder="Choose a Pokémon to swap in…"
              disabledPlaceholder="Finish editing first"
            />
          </div>
          {#if pendingSpecies}
            <Button
              variant="outline"
              class="min-h-11 shrink-0"
              onclick={cancelSpeciesSwap}>Cancel</Button
            >
          {/if}
        </div>
        {#if pendingSpecies}
          <p class="mt-2 text-sm text-primary" role="status">
            Choose which Pokémon to replace with <strong
              >{pendingSpecies}</strong
            >.
          </p>
        {/if}
        <div class="mt-5 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each draft.members as member, index (index)}
            <section
              id={`pokemon-slot-${index}`}
              class="min-w-0 overflow-hidden rounded-2xl border bg-base-100 transition-all duration-300 ease-out motion-reduce:transition-none {activeEditIndex ===
              index
                ? 'border-primary p-4 shadow-md ring-2 ring-primary/30'
                : 'hover:border-primary/30 hover:shadow-xs'}"
              aria-label={`${member.pokemon} set`}
            >
              <MemberCard
                {member}
                editable={true}
                {editing}
                pending={editedSlots.has(index)}
                onedit={(field) => openSetEditor(index, field)}
              />
              {#if pendingSpecies}
                <Button
                  variant="outline"
                  class="mt-3 min-h-11 w-full"
                  aria-label={`Replace ${member.pokemon} with ${pendingSpecies}`}
                  onclick={() => applySpeciesSwap(index)}
                  >Swap in {pendingSpecies}</Button
                >
              {/if}
              {#if editedSlots.has(index)}
                <div
                  class="flex items-center justify-between border-t border-base-300/60 bg-base-200/40 px-3.5 py-2.5"
                >
                  <span class="text-xs font-medium text-primary"
                    >Unsaved set</span
                  >
                  <div class="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-8 min-h-8 px-2.5 text-xs"
                      aria-label={`Discard changes to ${member.pokemon}`}
                      onclick={() => discardPokemon(index)}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      class="h-8 min-h-8 px-3 text-xs"
                      aria-label={`Apply changes to ${member.pokemon}`}
                      onclick={() => applyPokemon(index)}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              {/if}
            </section>
          {/each}
        </div>
        <p class="mt-4 text-xs leading-5 text-base-content/70">
          Team text normalizes to Pokémon Champions format (EVs out of 32, no
          IVs); unknown details stay omitted.
        </p>
        {#if showExport}<label
            class="t-panel-slide mt-4 block text-sm font-medium"
            use:revealPanel
            >Export text<textarea
              readonly
              class="textarea mt-2 min-h-72 w-full p-3 font-mono text-xs"
              value={exportPaste(draft.members)}></textarea></label
          >{/if}
      </section>
    {/if}
  {/if}

  {#if activeEditIndex !== null && draft}
    {@const editIndex = activeEditIndex!}
    <dialog
      use:openSetDialog
      oncancel={handleDialogCancel}
      aria-label={`Edit ${draft.members[editIndex].pokemon} set`}
      class="set-editor-dialog fixed inset-0 z-50 m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-base-100 p-0 text-base-content shadow-xl sm:m-auto sm:h-[calc(100dvh-4rem)] sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-4rem)] sm:max-w-2xl sm:rounded-2xl sm:border"
    >
      <SetEditorSheet
        bind:this={editorRef}
        member={draft.members[editIndex]}
        teams={data.catalog.teams as Team[]}
        currentRegulation={current}
        initialField={activeEditField}
        teammates={draft.members.filter((_, i) => i !== editIndex)}
        onapply={(next) => applySetEdit(editIndex, next)}
        oncancel={cancelSetEdit}
        ondirtychange={(value) => (editorDirty = value)}
      />
    </dialog>
  {/if}
</main>

<style>
  :global(dialog.set-editor-dialog::backdrop) {
    background: rgb(0 0 0 / 0.5);
  }
</style>
