<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import { page } from '$app/state';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import MyTeamCollectionActions from '#lib/components/MyTeamCollectionActions.svelte';
  import RecordPanel from '#lib/components/RecordPanel.svelte';
  import TeamActionsMenu from '#lib/components/TeamActionsMenu.svelte';
  import MemberCurrentSetControls from '#lib/components/MemberCurrentSetControls.svelte';
  import TeamSetGrid from '#lib/components/TeamSetGrid.svelte';
  import TeamPicker from '#lib/components/TeamPicker.svelte';
  import SwapSuggestions from '#lib/components/SwapSuggestions.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Star from '@lucide/svelte/icons/star';
  import { Button } from '#lib/components/ui/button/index.js';
  import SetEditorSheet from '#lib/components/SetEditorSheet.svelte';
  import TeamSources from '#lib/components/TeamSources.svelte';
  import { canonicalSnapshot } from '#lib/team-history.js';
  import { copyText } from '#lib/clipboard.js';
  import { notify } from '#lib/notifications.js';
  import { type Member } from '#lib/catalog.js';
  import { parseTeamPaste } from '#lib/member-validation.js';
  import {
    activeTeamKey,
    deleteTeam,
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
  let saved = $state<SavedTeam[]>([]),
    favorites = $state<SavedTeam[]>([]),
    draft = $state<SavedTeam | null>(null),
    baseline = $state(''),
    visitBaseline = $state<{ id: string; members: Member[] } | null>(null),
    ready = $state(false),
    message = $state(''),
    errorMessage = $state(''),
    nameError = $state(''),
    storageError = $state(''),
    deleting = $state(false),
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
  const teamRoute = (id?: string | null) =>
    (id
      ? resolve('my-teams') + '?team=' + encodeURIComponent(id)
      : resolve('my-teams')) as ResolvedPathname;
  function openSaved(
    id: string | null,
    activeOverride?: string | null,
    navigate = true
  ) {
    try {
      const allSaved = readSavedTeams(localStorage);
      saved = collections.teamsInUse(allSaved);
      favorites = collections.favoriteTeams(allSaved);
      storageError = '';
      const activeId =
        activeOverride === undefined
          ? localStorage.getItem(activeTeamKey)
          : activeOverride;
      const resolvedId = collections.resolveSavedTeamId(saved, id, activeId);
      const entry = saved.find((team) => team.id === resolvedId);
      if (draft?.id !== entry?.id) panel = null;
      draft = entry ? structuredClone($state.snapshot(entry)) : null;
      pasteText = draft ? exportPaste(draft.members) : '';
      pasteError = '';
      baseline = entry ? contentSnapshot(entry) : '';
      if (!entry) visitBaseline = null;
      else if (visitBaseline?.id !== entry.id)
        visitBaseline = {
          id: entry.id,
          members: structuredClone($state.snapshot(entry.members)),
        };
      if (entry && activeOverride === undefined)
        localStorage.setItem(activeTeamKey, entry.id);
      if (!entry && activeOverride === undefined && !saved.length)
        localStorage.removeItem(activeTeamKey);
      if (navigate && (entry || !id)) {
        const dest = teamRoute(entry?.id);
        if (page.url.pathname + page.url.search !== dest)
          void goto(dest, { replace: true });
      }
      editorPending = stale = false;
      activeEditIndex = editorMember = null;
      message =
        id && !entry && !collections.resolveSavedTeamId(saved, null, activeId)
          ? 'This team is not in My Teams on this device. Choose a current team or browse the catalog.'
          : '';
      errorMessage = nameError = '';
    } catch {
      storageError =
        'Saved teams could not be read. Check app storage access. Existing data has been left untouched.';
    }
  }
  const persistDraft = () => (editorRef?.flush(), saveTeamName());
  onMount(() => {
    ready = true;
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
    if (!ready) return;
    const id = page.url.searchParams.get('team');
    untrack(() => openSaved(id));
  });
  $effect(() => {
    if (
      !ready ||
      dirty ||
      editing ||
      deleting ||
      (sync.revision === appliedRevision && !stale)
    )
      return;
    appliedRevision = sync.revision;
    untrack(() => openSaved(draft?.id ?? page.url.searchParams.get('team')));
  });
  beforeNavigate(({ cancel, willUnload, shallow, type }) => {
    if (!(shallow && type === 'goto') && !willUnload && dirty)
      if (!confirm('Discard unsaved input?')) cancel();
  });
  let picker = $state<{ focus: () => void } | undefined>();
  let pickerPress = false;
  async function selectTeam(id: string): Promise<boolean> {
    if (changed) return false;
    persistDraft();
    try {
      await goto(resolve(`my-teams?team=${encodeURIComponent(id)}`));
    } catch {
      errorMessage =
        'Could not open that team. Your current team is unchanged.';
      return false;
    }
    await tick();
    return draft?.id === id;
  }
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
      pickerPress ||
      (e.relatedTarget instanceof Element &&
        e.relatedTarget.closest(
          '[data-team-picker], [data-preserve-team-name]'
        ))
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
      const latest = collections.liveInUseTeam(localStorage, draft.id);
      if (!latest || contentSnapshot(latest) !== baseline) {
        stale = true;
        message = '';
        errorMessage =
          'This team changed elsewhere. Close and reopen the editor before saving.';
        return false;
      }
      const next = patch(latest);
      const pendingName = draft.name;
      const allSaved = saveTeam(localStorage, next);
      saved = collections.teamsInUse(allSaved);
      favorites = collections.favoriteTeams(allSaved);
      const persisted = saved.find(({ id }) => id === next.id);
      if (!persisted) throw new Error('saved team is missing after saving');
      baseline = contentSnapshot(persisted);
      draft = structuredClone($state.snapshot(persisted));
      if (!saveName) draft.name = pendingName;
      pasteText = exportPaste(draft.members);
      pasteError = '';
      storageError = nameError = errorMessage = message = '';
      void pushNow();
      return true;
    } catch {
      message = '';
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
  function saveTeamName() {
    if (!draft || changed) return;
    const name = draft.name.trim();
    if (!name) {
      message = errorMessage = '';
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
    if (!draft || !changed || editing || deleting || stale) return;
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
      !!(draft && !changed && !editing && !deleting && target) &&
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
    if (!draft || changed || editing || deleting || stale) return false;
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
  async function removeSelectedTeam() {
    if (!draft || editing || deleting) return;
    const id = draft.id;
    const warn = dirty
      ? ' Unsaved changes to this team will also be discarded.'
      : '';
    if (!confirm(`Delete “` + draft.name + `”? This cannot be undone.` + warn))
      return;
    deleting = true;
    message = errorMessage = '';
    let prevActive: string | null;
    try {
      prevActive = localStorage.getItem(activeTeamKey);
    } catch {
      prevActive = null;
    }
    let remaining: SavedTeam[];
    try {
      if (!collections.liveInUseTeam(localStorage, id)) {
        errorMessage =
          'This team changed elsewhere. Reopen My Teams before deleting.';
        deleting = false;
        return;
      }
      remaining = collections.teamsInUse(deleteTeam(localStorage, id));
    } catch {
      errorMessage =
        'Could not delete team. Existing saved teams have been left untouched.';
      deleting = false;
      return;
    }
    draft = activeEditIndex = editorMember = null;
    baseline = pasteText = pasteError = '';
    editorPending = false;
    panel = null;
    const nextId = collections.resolveSavedTeamId(remaining, null, prevActive);
    let activeFailed = false;
    try {
      if (nextId) localStorage.setItem(activeTeamKey, nextId);
      else localStorage.removeItem(activeTeamKey);
    } catch {
      activeFailed = true;
    }
    openSaved(nextId, null, false);
    await goto(teamRoute(nextId), { replace: true }).catch(
      () => (activeFailed = true)
    );
    notify('Team deleted.');
    errorMessage = activeFailed
      ? 'Team deleted, but the active team could not be remembered.'
      : '';
    void pushNow();
    deleting = false;
    await tick();
    (nextId
      ? picker
      : document.querySelector<HTMLElement>('a[href$="/my-teams/new"]')
    )?.focus();
  }
</script>

<svelte:head><title>My Teams — Champion's Atlas</title></svelte:head>
<main id="main" class="app-container pb-2">
  <h1 class="sr-only">My Teams</h1>
  <div
    class="team-workspace grid min-w-0 items-start gap-2 {hasTeam
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
      {#if !ready}
        <p class="text-[0.9375rem] text-base-content/70">
          Loading current teams…
        </p>
      {:else if !storageError}
        {#if saved.length}
          <div class="flex min-w-0 items-start gap-1">
            <div
              data-team-picker
              class="min-w-0 flex-1"
              onpointerdowncapture={() => {
                pickerPress = true;
                setTimeout(() => (pickerPress = false));
              }}
            >
              <TeamPicker
                bind:this={picker}
                teams={saved}
                value={draft?.id ?? ''}
                onselect={selectTeam}
                disabled={changed || editing || deleting}
              />
            </div>
            {#if draft}
              <Button
                variant="quiet"
                size="icon-compact"
                class="min-h-11 min-w-11"
                aria-label="Favorite"
                aria-pressed={!!draft.favorite}
                title={draft.favorite
                  ? 'Remove from favorites'
                  : 'Add to favorites'}
                disabled={changed || editing || deleting || stale}
                onclick={toggleFavorite}
              >
                <Star
                  class="size-4 {draft.favorite ? 'fill-current' : ''}"
                  aria-hidden="true"
                />
              </Button>
              <TeamActionsMenu
                oncopy={copyPaste}
                disabled={changed || editing || deleting}
              />
            {/if}
          </div>
        {:else}
          <div class="plate max-w-xl px-4 py-3">
            <p class="text-[0.9375rem] leading-relaxed">
              No current teams yet. Open a catalog team and choose “Use this
              team”.
            </p>
            <Button
              href={resolve('my-teams/new')}
              variant="quiet"
              class="-ms-2 mt-1 h-auto min-h-11 max-w-full whitespace-normal"
            >
              <Plus class="size-4" aria-hidden="true" />
              <span>Add custom team</span>
            </Button>
          </div>
        {/if}
        {#if draft}
          {#key draft.id}
            <RecordPanel
              record={draft.record ?? { wins: 0, losses: 0 }}
              disabled={changed || editing || deleting || stale}
              onstep={changeRecord}
              onreset={resetRecord}
            />
            <MyTeamCollectionActions
              teamId={draft.id}
              name={draft.name}
              {baseline}
              {dirty}
              edited={collections.hasSetEdits(draft)}
              members={draft.members}
              disabled={changed || editing || deleting || stale}
              deleteDisabled={editing || deleting}
              ondelete={removeSelectedTeam}
            />
          {/key}
        {/if}
        {#if message}<p
            role="status"
            class="text-[0.9375rem] text-base-content/70"
          >
            {message}
          </p>{/if}
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
                disabled={changed || editing || deleting || stale}
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
            disabled={changed || editing || deleting || stale}
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
            disabled={editing || deleting || stale}></textarea>
          {#if pasteError}<p
              role="alert"
              class="mt-1 text-sm text-error-content"
            >
              {pasteError}
            </p>{/if}
          <div class="mt-1 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!changed || editing || deleting || stale}
              onclick={saveTeamPaste}>Save team text</Button
            >
            <Button
              variant="quiet"
              disabled={!changed || editing || deleting}
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
</main>
