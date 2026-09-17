<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import EditableMemberCard from '$lib/components/EditableMemberCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import SetEditorSheet from '$lib/components/SetEditorSheet.svelte';
  import type { Member, Team } from '$lib/catalog';
  import {
    activeTeamKey,
    exportPaste,
    readSavedTeams,
    resolveSavedTeamId,
    saveTeam,
    type SavedTeam,
  } from '$lib/workbench';
  import type { PageData } from './$types';

  type EditableSetField =
    'pokemon' | 'item' | 'ability' | 'nature' | 'spread' | 'moves' | 'text';
  let { data }: { data: PageData } = $props();
  let saved = $state<SavedTeam[]>([]),
    draft = $state<SavedTeam | null>(null),
    baseline = $state('');
  let ready = $state(false),
    message = $state(''),
    storageError = $state('');
  let showExport = $state(false);
  let activeEditIndex = $state<number | null>(null),
    activeEditField = $state<EditableSetField>('item'),
    originalMember = $state<Member | null>(null),
    editorDirty = $state(false);
  let editorRef = $state<
    { apply: () => boolean; focus: () => void } | undefined
  >();
  let editorElement = $state<HTMLElement>();
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
    if (editing) {
      editorRef?.apply();
      return;
    }
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
  const focusSetField = (index: number, field: EditableSetField) =>
    document
      .getElementById(`pokemon-slot-${index}`)
      ?.querySelector<HTMLButtonElement>(`[data-set-field="${field}"]`)
      ?.focus();
  const openSetEditor = (index: number, field: EditableSetField) => {
    if (editing) return;
    activeEditIndex = index;
    activeEditField = field;
    originalMember = draft
      ? structuredClone($state.snapshot(draft.members[index]))
      : null;
    editorDirty = false;
    void tick().then(() => {
      scrollSmooth(document.getElementById(`pokemon-slot-${index}`), 'center');
      editorRef?.focus();
    });
  };
  function applySetEdit(index: number, member: Member) {
    if (!draft) return;
    const field = activeEditField;
    draft.members[index] = member;
    activeEditIndex = null;
    originalMember = null;
    editorDirty = false;
    persist($state.snapshot(draft));
    void tick().then(() => {
      scrollSmooth(document.getElementById(`pokemon-slot-${index}`), 'center');
      focusSetField(index, field);
    });
  }
  function cancelSetEdit() {
    if (draft && activeEditIndex !== null && originalMember) {
      draft.members[activeEditIndex] = originalMember;
    }
    const targetSlot = activeEditIndex;
    const field = activeEditField;
    activeEditIndex = null;
    originalMember = null;
    editorDirty = false;
    if (targetSlot !== null) {
      void tick().then(() => {
        scrollSmooth(
          document.getElementById(`pokemon-slot-${targetSlot}`),
          'center'
        );
        focusSetField(targetSlot, field);
      });
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
        <div class="mt-5 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each draft.members as member, index (index)}
            <section
              id={`pokemon-slot-${index}`}
              class="min-w-0 overflow-hidden rounded-2xl border bg-card transition-all duration-300 ease-out motion-reduce:transition-none {activeEditIndex ===
              index
                ? 'border-primary p-4 shadow-md ring-2 ring-primary/30'
                : 'hover:border-primary/30 hover:shadow-xs'}"
              aria-label={`${member.pokemon} set`}
            >
              {#if activeEditIndex === index}
                <SetEditorSheet
                  bind:this={editorRef}
                  {member}
                  teams={data.catalog.teams as Team[]}
                  currentRegulation={current}
                  initialField={activeEditField}
                  teammates={draft.members.filter((_, i) => i !== index)}
                  onapply={(next) => applySetEdit(index, next)}
                  oncancel={cancelSetEdit}
                  ondirtychange={(value) => (editorDirty = value)}
                />
              {:else}<EditableMemberCard
                  {member}
                  {editing}
                  onedit={(field) => openSetEditor(index, field)}
                />
              {/if}
            </section>
          {/each}
        </div>
        <p class="mt-4 text-xs leading-5 text-muted-foreground">
          Team text normalizes to Pokémon Champions format (EVs out of 32, no
          IVs); unknown details stay omitted.
        </p>
        {#if showExport}<label
            class="t-panel-slide mt-4 block text-sm font-medium"
            use:revealPanel
            >Export text<textarea
              readonly
              class="mt-2 min-h-72 w-full rounded-lg border p-3 font-mono text-xs"
              value={exportPaste(draft.members)}></textarea></label
          >{/if}
      </section>
    {/if}
  {/if}
</main>
