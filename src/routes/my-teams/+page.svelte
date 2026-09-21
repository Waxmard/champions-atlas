<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import MemberCard from '$lib/components/MemberCard.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import TeamDifferences from '$lib/components/TeamDifferences.svelte';
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
  let editedSlots = $state(new Set<number>());
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
      editedSlots = new Set();
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
    if (draft && draft.name.trim() && JSON.stringify(draft) !== baseline) {
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

  function persist(next: SavedTeam) {
    try {
      saved = saveTeam(localStorage, next);
      localStorage.setItem(activeTeamKey, next.id);
      void pushNow();
      draft = JSON.parse(JSON.stringify(next));
      baseline = JSON.stringify(draft);
      editedSlots = new Set();
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
  function discardChanges() {
    if (!draft) return;
    openSaved(draft.id);
    message = 'Changes discarded.';
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
    editedSlots = new Set([...editedSlots, index]);
    activeEditIndex = null;
    editorDirty = false;
    message = 'Set changes applied. Save changes to keep them.';
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
    editedSlots = new Set([...editedSlots, index]);
    pendingSpecies = null;
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
            /></label
          >
          <div class="flex flex-wrap gap-2">
            {#if dirty && !editing}
              <Button
                variant="outline"
                class="min-h-11"
                onclick={discardChanges}>Discard changes</Button
              >
            {/if}
            <Button
              class="min-h-11"
              disabled={!dirty || editing}
              onclick={saveChanges}
              aria-label="Save changes">Save changes</Button
            ><Button
              variant="outline"
              class="min-h-11"
              disabled={editing}
              onclick={copyPaste}>Copy team text</Button
            >
          </div>
        </div>
        {#if dirty && !editing}
          <TeamDifferences
            before={JSON.parse(baseline).members}
            after={draft.members}
            beforeLabel="Current"
            afterLabel="With changes"
          />
        {/if}
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
