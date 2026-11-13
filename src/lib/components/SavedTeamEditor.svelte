<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import SavedTeamActions from '#lib/components/SavedTeamActions.svelte';
  import RecordPanel from '#lib/components/RecordPanel.svelte';
  import MemberCurrentSetControls from '#lib/components/MemberCurrentSetControls.svelte';
  import TeamSetGrid from '#lib/components/TeamSetGrid.svelte';
  import SwapSuggestions from '#lib/components/SwapSuggestions.svelte';
  import Star from '@lucide/svelte/icons/star';
  import Swords from '@lucide/svelte/icons/swords';
  import { Button } from '#lib/components/ui/button/index.js';
  import SetEditorSheet from '#lib/components/SetEditorSheet.svelte';
  import TeamSources from '#lib/components/TeamSources.svelte';
  import { canonicalSnapshot } from '#lib/team-history.js';
  import { copyText } from '#lib/clipboard.js';
  import { notify } from '#lib/notifications.js';
  import { type Member } from '#lib/catalog.js';
  import { parseTeamPaste } from '#lib/member-validation.js';
  import {
    exportPaste,
    readSavedTeams,
    rosterConflict,
    saveTeam,
    type SavedTeam,
  } from '#lib/workbench.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import { pushNow, sync } from '#lib/sync.svelte.js';
  import { lockBodyScroll } from '#lib/dialog-scroll-lock.js';
  import { dialogOut } from '#lib/motion.js';
  import * as collections from '#lib/team-collections.js';
  type TeamPanel = 'details' | 'swaps' | 'text';
  const panels = [
    ['details', 'Details'],
    ['swaps', 'Swaps'],
    ['text', 'Team text'],
  ] as const;
  let {
    teamId,
    busy,
    onchange,
    ondelete,
  }: {
    teamId: string;
    busy: boolean;
    onchange: () => void;
    ondelete: () => void;
  } = $props();
  let favorites = $state<SavedTeam[]>([]),
    draft = $state<SavedTeam | null>(null),
    baseline = $state(''),
    visitBaseline = $state<{ id: string; members: Member[] } | null>(null),
    ready = $state(false),
    errorMessage = $state(''),
    nameError = $state(''),
    storageError = $state(''),
    pasteText = $state(''),
    pasteError = $state(''),
    stale = $state(false),
    panel = $state<TeamPanel | null>(null),
    activeEditIndex = $state<number | null>(null),
    activeEditField = $state<EditableSetField>('set'),
    activeEditMoveSlot = $state(0),
    editorPending = $state(false),
    editorMember = $state<Member | null>(null),
    editorRef = $state<{
      focusInitialSection: () => void;
      flush: () => boolean;
      requestClose: () => boolean;
    }>(),
    appliedRevision = 0;
  const teams = $derived(catalogState.catalog.teams);
  const current = $derived(catalogState.catalog.currentRegulation);
  const editing = $derived(activeEditIndex !== null);
  const hasTeam = $derived(ready && !storageError && !!draft);
  const changed = $derived(!!draft && pasteText !== exportPaste(draft.members));
  const favoriteSources = $derived(
    favorites.filter((team) => team.id !== draft?.id)
  );
  const dirty = $derived(
    (!!draft && draft.name !== (baseline ? JSON.parse(baseline).name : '')) ||
      editorPending ||
      changed
  );
  const contentSnapshot = (team: Pick<SavedTeam, 'name' | 'members'>) =>
    canonicalSnapshot({ name: team.name, members: team.members });
  function load() {
    try {
      const allSaved = readSavedTeams(localStorage);
      const entry = allSaved.find(
        (team) => team.id === teamId && collections.isSavedTeam(team)
      );
      if (!entry) return;
      favorites = collections.favoriteTeams(allSaved);
      storageError = '';
      draft = structuredClone(entry);
      pasteText = exportPaste(draft.members);
      pasteError = '';
      baseline = contentSnapshot(entry);
      visitBaseline ??= {
        id: entry.id,
        members: structuredClone(entry.members),
      };
      editorPending = stale = false;
      activeEditIndex = editorMember = null;
      errorMessage = nameError = '';
    } catch {
      storageError =
        'Saved teams could not be read. Check app storage access. Existing data has been left untouched.';
    }
  }
  const persistDraft = () => (editorRef?.flush(), saveTeamName());
  onMount(() => {
    ready = true;
    load();
    const warn = (e: BeforeUnloadEvent) =>
      dirty && (e.preventDefault(), (e.returnValue = ''));
    const onVis = () => document.visibilityState === 'hidden' && persistDraft();
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', persistDraft);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', persistDraft);
      document.removeEventListener('visibilitychange', onVis);
    };
  });
  $effect(() => {
    if (
      !ready ||
      dirty ||
      editing ||
      busy ||
      (sync.revision === appliedRevision && !stale)
    )
      return;
    appliedRevision = sync.revision;
    untrack(load);
  });
  beforeNavigate(({ cancel, willUnload, shallow, type }) => {
    if ((shallow && type === 'goto') || willUnload || !dirty) return;
    try {
      if (!collections.liveSavedTeam(localStorage, teamId)) return;
    } catch {
      return;
    }
    if (!confirm('Discard unsaved input?')) cancel();
  });
  function setPanel(next: TeamPanel | null): boolean {
    if (changed) return false;
    if (panel === 'details' && next !== 'details') {
      saveTeamName();
      if (nameError) return false;
    }
    panel = next;
    return true;
  }
  function closePanel() {
    if (changed) {
      if (!confirm('Discard unsaved input?')) return;
      pasteText = draft ? exportPaste(draft.members) : '';
      pasteError = '';
    }
    setPanel(null);
  }
  function blurName(e: FocusEvent) {
    if (
      e.relatedTarget instanceof Element &&
      e.relatedTarget.closest('[data-preserve-team-name]')
    )
      return;
    saveTeamName();
  }
  function persistChange(
    patch: (team: SavedTeam) => SavedTeam,
    saveName = false,
    savePaste = false
  ): boolean {
    if (!draft || (changed && !savePaste)) return false;
    try {
      const latest = collections.liveSavedTeam(localStorage, draft.id);
      if (!latest || contentSnapshot(latest) !== baseline) {
        stale = true;
        errorMessage =
          'This team changed elsewhere. Close and reopen the editor before saving.';
        return false;
      }
      const next = patch(latest);
      const pendingName = draft.name;
      const allSaved = saveTeam(localStorage, next);
      favorites = collections.favoriteTeams(allSaved);
      const persisted = allSaved.find(({ id }) => id === next.id);
      if (!persisted) throw new Error('saved team is missing after saving');
      baseline = contentSnapshot(persisted);
      draft = structuredClone(persisted);
      if (!saveName) draft.name = pendingName;
      pasteText = exportPaste(draft.members);
      pasteError = '';
      storageError = nameError = errorMessage = '';
      void pushNow();
      onchange();
      return true;
    } catch {
      errorMessage =
        'Could not save changes. Check app storage access and available space. Your edits are still here; existing saved data was not replaced.';
      return false;
    }
  }
  const changeRecord = (key: 'wins' | 'losses', step: number) =>
    persistChange((team) => {
      const record = team.record ?? { wins: 0, losses: 0 };
      const count = Math.min(9999, Math.max(0, record[key] + step));
      return { ...team, record: { ...record, [key]: count } };
    });
  const resetRecord = () =>
    persistChange((team) => ({ ...team, record: { wins: 0, losses: 0 } }));
  const toggleFavorite = () =>
    persistChange(({ favorite, ...team }) =>
      favorite ? team : { ...team, favorite: true }
    );
  function toggleCurrent() {
    if (!draft) return;
    try {
      collections.setCurrentTeam(localStorage, draft.id, !draft.current);
      if (draft.current) delete draft.current;
      else draft.current = true;
      errorMessage = '';
      void pushNow();
      onchange();
    } catch (error) {
      errorMessage =
        error instanceof collections.SavedTeamError
          ? error.message
          : 'Could not update this team. Existing saved teams have been left untouched.';
    }
  }
  function saveTeamName() {
    if (!draft || changed) return;
    const name = draft.name.trim();
    if (!name) {
      errorMessage = '';
      nameError = 'Give this team a name.';
      return;
    }
    nameError = '';
    if (baseline && name === JSON.parse(baseline).name)
      return void (draft.name = name);
    persistChange((team) => ({ ...team, name }), true);
  }
  const replaceSlot = (members: Member[], index: number, next: Member) =>
    members.map((m, slot) => (slot === index ? structuredClone(next) : m));
  function saveMember(index: number, member: Member): boolean {
    return (
      !!draft &&
      persistChange((t) => ({
        ...t,
        members: replaceSlot(t.members, index, $state.snapshot(member)),
      }))
    );
  }
  function saveTeamPaste() {
    if (!draft || !changed || editing || busy || stale) return;
    try {
      const members = parseTeamPaste(pasteText, draft.members);
      if (persistChange((team) => ({ ...team, members }), false, true)) {
        panel = null;
        notify('Team text saved.');
      }
    } catch (e) {
      pasteError =
        e instanceof Error ? e.message : 'Invalid Showdown team text.';
    }
  }
  function slotRevertReason(index: number): string {
    const target = visitBaseline?.members[index];
    if (!draft || !target) return '';
    const conflict = rosterConflict(target, draft.members, index);
    if (conflict === 'duplicate')
      return `${target.pokemon} is already in another slot. Change that Pokémon first, then revert.`;
    return conflict === 'mega'
      ? 'Reverting this set would keep more than two Mega Pokémon. Change one of them first, then revert.'
      : '';
  }
  function canRevertSlot(index: number): boolean {
    const target = visitBaseline?.members[index];
    return (
      !!(draft && !changed && !editing && !busy && target) &&
      canonicalSnapshot(target) !== canonicalSnapshot(draft.members[index]) &&
      !slotRevertReason(index)
    );
  }
  function revertSlot(index: number) {
    const target = visitBaseline?.members[index];
    if (!target || !canRevertSlot(index)) return;
    if (
      persistChange((t) => ({
        ...t,
        members: replaceSlot(t.members, index, $state.snapshot(target)),
      }))
    ) {
      notify('Set changes reverted.');
      void tick().then(() => focusSetField(index, 'pokemon'));
    }
  }
  const focusSetField = (i: number, field: EditableSetField, move = 0) => {
    const slot = document.getElementById(`pokemon-slot-${i}`);
    const sel =
      field === 'moves'
        ? `[data-move-slot="${move}"]`
        : `[data-set-field="${field}"]`;
    (
      slot?.querySelector<HTMLElement>(sel) ??
      slot?.querySelector<HTMLElement>('[data-set-field="pokemon"]')
    )?.focus({ preventScroll: true });
  };
  const openSetEditor = (i: number, field: EditableSetField, move = 0) => {
    const member = !changed && !editing ? draft?.members[i] : null;
    if (!member) return;
    editorPending = false;
    [activeEditIndex, activeEditField, activeEditMoveSlot] = [i, field, move];
    editorMember = structuredClone($state.snapshot(member));
  };
  function openSetDialog(node: HTMLDialogElement) {
    const restoreScroll = lockBodyScroll();
    node.showModal();
    void tick().then(() => editorRef?.focusInitialSection());
    return { destroy: () => (node.open && node.close(), restoreScroll()) };
  }
  const handleDialogCancel = (e: Event) => (
    e.preventDefault(),
    (editorRef?.requestClose() ?? true) && closeSetEdit()
  );
  function closeSetEdit() {
    const [slot, field, move] = [
      activeEditIndex,
      activeEditField,
      activeEditMoveSlot,
    ];
    activeEditIndex = editorMember = null;
    editorPending = false;
    if (slot !== null) void tick().then(() => focusSetField(slot, field, move));
  }
  function applySwap(slot: number, member: Member): boolean {
    if (!draft || changed || editing || busy || stale) return false;
    const applied = persistChange((team) => ({
      ...team,
      members: replaceSlot(team.members, slot, $state.snapshot(member)),
    }));
    if (applied) {
      panel = null;
      notify('Swap applied.');
    }
    return applied;
  }
  async function copyPaste() {
    if (!draft || changed || editing) return;
    if (await copyText(exportPaste(draft.members))) {
      errorMessage = '';
      notify('Team text copied.');
    } else if (setPanel('text'))
      pasteError =
        'Clipboard unavailable. Select and copy the team text above.';
  }
</script>

<div
  class="team-workspace mt-2 grid min-w-0 items-start gap-2 {hasTeam
    ? 'team-band landscape:md:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] landscape:md:[direction:ltr]'
    : ready
      ? 'pt-2'
      : 'team-band'}"
>
  <div
    class="team-controls min-w-0 space-y-2 wrap-anywhere {hasTeam
      ? 'landscape:md:col-start-2 landscape:md:row-start-1'
      : ''}"
  >
    {#if storageError || errorMessage}<p
        role="alert"
        class="plate max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
        style="color: var(--color-error-content)"
      >
        {storageError || errorMessage}
      </p>{/if}
    {#if !storageError && draft}
      {@const heading = collections.savedTeamHeading(draft)}
      <div class="flex min-w-0 items-start gap-1">
        <div class="min-w-0 flex-1">
          <h1
            class="line-clamp-2 font-display text-xl leading-tight font-bold tracking-tight wrap-anywhere landscape:md:text-base"
          >
            {heading.title}
          </h1>
          {#if heading.context}<p class="provenance line-clamp-1 wrap-anywhere">
              {heading.context}
            </p>{/if}
        </div>
        <Button
          variant="quiet"
          size="icon-compact"
          class="min-h-11 min-w-11 {draft.current
            ? 'bg-info text-info-content hover:text-info-content'
            : ''}"
          aria-label="Current team"
          aria-pressed={!!draft.current}
          title={draft.current
            ? 'Stop using as current team'
            : 'Use as current team'}
          disabled={changed || editing || busy || stale}
          onclick={toggleCurrent}
        >
          <Swords class="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="quiet"
          size="icon-compact"
          class="min-h-11 min-w-11"
          aria-label="Favorite"
          aria-pressed={!!draft.favorite}
          title={draft.favorite ? 'Remove from favorites' : 'Add to favorites'}
          disabled={changed || editing || busy || stale}
          onclick={toggleFavorite}
        >
          <Star
            class="size-4 {draft.favorite ? 'fill-current' : ''}"
            aria-hidden="true"
          />
        </Button>
        <Button
          variant="quiet"
          size="icon-compact"
          class="min-h-11 min-w-11"
          aria-label="Copy team text"
          title="Copy team text"
          data-team-action="copy"
          disabled={changed || editing || busy}
          onclick={copyPaste}
        >
          <Copy class="size-4" aria-hidden="true" />
        </Button>
      </div>
      {#key draft.id}
        <RecordPanel
          record={draft.record ?? { wins: 0, losses: 0 }}
          disabled={changed || editing || busy || stale}
          onstep={changeRecord}
          onreset={resetRecord}
        />
        <SavedTeamActions
          teamId={draft.id}
          name={draft.name}
          {baseline}
          {dirty}
          edited={collections.hasSetEdits(draft)}
          members={draft.members}
          disabled={changed || editing || busy || stale}
          deleteDisabled={editing || busy}
          {ondelete}
        />
      {/key}
    {/if}
  </div>
  {#if ready && !storageError && draft}
    {@const activeTeam = draft}
    {#key draft.id}
      <section
        aria-label="Your team"
        class="enter-fade team-sheet min-w-0 landscape:md:col-start-1 landscape:md:row-start-1"
      >
        <TeamSetGrid members={draft.members}>
          {#snippet renderMember(index)}
            <MemberCurrentSetControls
              teamId={activeTeam.id}
              {baseline}
              members={activeTeam.members}
              memberIndex={index}
              disabled={changed || editing || busy || stale}
              {editing}
              onedit={(field, moveSlot) =>
                openSetEditor(index, field, moveSlot)}
              onrevert={() => revertSlot(index)}
              revertDisabled={!canRevertSlot(index)}
              revertReason={slotRevertReason(index)}
            />
          {/snippet}
        </TeamSetGrid>
      </section>
    {/key}
  {/if}
</div>
{#if ready && !storageError && draft}
  {@const team = draft}
  {#if changed}
    <p role="status" class="provenance mt-1">
      Save or reset team text before changing the team.
    </p>
  {/if}
  <div
    role="group"
    aria-label="Team tools"
    class="surface mt-2 grid min-w-0 grid-cols-3 items-center p-1"
  >
    {#each panels as [id, label] (id)}
      <button
        type="button"
        class="inline-flex min-h-9 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[calc(var(--radius-field)-4px)] px-1.5 text-xs font-bold text-base-content/70 transition-[color,background-color,scale] outline-none hover:bg-base-200 hover:text-base-content active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11 sm:gap-1.5 sm:px-3 sm:text-sm"
        aria-haspopup="dialog"
        disabled={changed && id !== 'text'}
        onclick={() => setPanel(id)}
      >
        {label}
      </button>
    {/each}
  </div>
  {#if panel}
    <Modal
      title={panels.find(([id]) => id === panel)?.[1] ?? ''}
      onclose={closePanel}
    >
      {#if errorMessage}
        <p
          role="alert"
          class="mb-3 text-sm"
          style="color: var(--color-error-content)"
        >
          {errorMessage}
        </p>
      {/if}
      {#if panel === 'details'}
        {@const match = collections.resolveCatalogTeam(team.original, teams)}
        <div class="min-w-0 space-y-3">
          <div class="min-w-0">
            <label class="term block"
              >Team name
              <input
                id="team-name"
                class="input mt-1.5 min-h-11 w-full text-base"
                maxlength="200"
                disabled={changed}
                aria-invalid={nameError ? 'true' : undefined}
                aria-describedby="team-name-error"
                bind:value={team.name}
                oninput={() => (nameError = '')}
                onblur={blurName}
                onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </label>
            <p id="team-name-error" class="mt-1 text-sm text-error-content">
              {nameError}
            </p>
          </div>
          <TeamSources {team} currentRegulation={current} />
          {#if match}<a
              class="inline-flex min-h-11 min-w-0 link items-center text-sm wrap-anywhere"
              href={resolve(`teams/${match.id}`)}>View catalog details</a
            >{/if}
          <div class="min-w-0 space-y-1">
            <p class="provenance">
              {dirty ? 'Unsaved input.' : 'Saved on this device.'}
            </p>
            {#if team.name !== team.original.name}
              <p class="provenance max-w-full min-w-0 wrap-anywhere">
                Original: {team.original.name}
              </p>
            {/if}
            <p class="provenance">
              Editing does not create a working rental code.
            </p>
          </div>
        </div>
      {:else if panel === 'swaps'}
        <SwapSuggestions
          members={team.members}
          {teams}
          currentRegulation={current}
          tags={catalogState.tags}
          favoriteTeams={favoriteSources}
          disabled={changed || editing || busy || stale}
          onapply={applySwap}
        />
      {:else}
        <p class="provenance max-w-[68ch]">
          Team text normalizes to Pokémon Champions format (EVs out of 32, no
          IVs); unknown details stay omitted.
        </p>
        <textarea
          aria-label="Showdown team text"
          class="textarea mt-1 min-h-72 w-full p-2 font-mono text-xs leading-5"
          bind:value={pasteText}
          oninput={() => (pasteError = '')}
          disabled={editing || busy || stale}></textarea>
        {#if pasteError}<p role="alert" class="mt-1 text-sm text-error-content">
            {pasteError}
          </p>{/if}
        <div class="mt-1 flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!changed || editing || busy || stale}
            onclick={saveTeamPaste}>Save team text</Button
          >
          <Button
            variant="quiet"
            disabled={!changed || editing || busy}
            onclick={() => {
              if (draft) pasteText = exportPaste(draft.members);
              pasteError = '';
            }}>Reset text</Button
          >
        </div>
      {/if}
    </Modal>
  {/if}
{/if}
{#if activeEditIndex !== null && draft && editorMember}
  {@const editIndex = activeEditIndex}
  <dialog
    use:openSetDialog
    out:dialogOut
    oncancel={handleDialogCancel}
    aria-label={`Edit ${editorMember.pokemon} set`}
    class="dialog-motion fixed inset-0 z-50 m-auto flex h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-h-[46rem] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 p-0 text-base-content shadow-xl"
  >
    <SetEditorSheet
      bind:this={editorRef}
      member={editorMember}
      originalMembers={draft.original.members}
      {teams}
      currentRegulation={current}
      initialField={activeEditField}
      initialMoveSlot={activeEditMoveSlot}
      teammates={draft.members.filter((_, i) => i !== editIndex)}
      tagIndex={catalogState.tags}
      favoriteTeams={favoriteSources}
      onchange={(next) => saveMember(editIndex, next)}
      onclose={closeSetEdit}
      onpendingchange={(value) => (editorPending = value)}
    />
  </dialog>
{/if}
