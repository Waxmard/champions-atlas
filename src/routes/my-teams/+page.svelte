<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
  import { page } from '$app/state';
  import MemberCard from '$lib/components/MemberCard.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import X from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button';
  import SetEditorSheet from '$lib/components/SetEditorSheet.svelte';
  import TeamHistoryPanel from '$lib/components/TeamHistoryPanel.svelte';
  import { canonicalSnapshot, restoreTeam } from '$lib/team-history';
  import { copyText } from '$lib/clipboard';
  import {
    bestEvidence,
    evidenceGrade,
    normalize,
    regulationLabel,
    type Member,
    type Team,
  } from '$lib/catalog';
  import { getPokemonTypes, TYPE_COLORS } from '$lib/types';
  import type { TeamTagsIndex } from '$lib/tags';
  import {
    activeTeamKey,
    deleteTeam,
    exportPaste,
    generateUUID,
    isMegaSpecies,
    MAX_TEAM_MEGAS,
    readSavedTeams,
    resolveSavedTeamId,
    saveTeam,
    swapSuggestions,
    type SavedTeam,
  } from '$lib/workbench';
  import { pushNow, sync } from '$lib/sync.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let saved = $state<SavedTeam[]>([]),
    draft = $state<SavedTeam | null>(null),
    baseline = $state('');
  let ready = $state(false),
    message = $state(''),
    storageError = $state('');
  let deleting = $state(false);
  let showExport = $state(false);
  let activeEditIndex = $state<number | null>(null),
    activeEditField = $state<EditableSetField>('set'),
    editorPending = $state(false);
  let editorMember = $state<Member | null>(null);
  let editorGroup: { id: string; label: string } | undefined;
  let operationGroups: Record<string, { id: string; label: string }> = {};
  let stale = $state(false);
  let editorRef = $state<
    | {
        focusInitialSection: () => void;
        flush: () => boolean;
        requestClose: () => boolean;
      }
    | undefined
  >();
  let pendingSpecies = $state<string | null>(null);
  let showSwapPicker = $state(false);
  let swapUnavailable = $state(false);
  let appliedRevision = 0;
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
        ) &&
        !(
          isMegaSpecies(p) &&
          (draft?.members ?? []).filter((m) => isMegaSpecies(m.pokemon))
            .length >= MAX_TEAM_MEGAS
        )
    )
  );
  const current = $derived(data.catalog.currentRegulation);
  const editing = $derived(activeEditIndex !== null);
  const dirty = $derived(
    (!!draft && draft.name !== (baseline ? JSON.parse(baseline).name : '')) ||
      editorPending
  );
  const contentSnapshot = (team: Pick<SavedTeam, 'name' | 'members'>) =>
    canonicalSnapshot({ name: team.name, members: team.members });

  function revealPanel(node: HTMLElement) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.dataset.motionReady = 'true';
    node.dataset.open = 'false';
    const frame = requestAnimationFrame(() => (node.dataset.open = 'true'));
    return { destroy: () => cancelAnimationFrame(frame) };
  }

  function openSaved(
    id: string | null,
    activeOverride?: string | null,
    navigate = true
  ) {
    try {
      saved = readSavedTeams(localStorage);
      storageError = '';
      const activeId =
        activeOverride === undefined
          ? localStorage.getItem(activeTeamKey)
          : activeOverride;
      const resolvedId = resolveSavedTeamId(saved, id, activeId);
      const entry = saved.find((team) => team.id === resolvedId);
      draft = entry ? structuredClone($state.snapshot(entry)) : null;
      baseline = entry ? contentSnapshot(entry) : '';
      if (entry && activeOverride === undefined)
        localStorage.setItem(activeTeamKey, entry.id);
      if (!entry && activeOverride === undefined && !saved.length)
        localStorage.removeItem(activeTeamKey);
      if (navigate && (entry || !id)) {
        const destination = entry
          ? resolve('/my-teams') + '?team=' + encodeURIComponent(entry.id)
          : resolve('/my-teams');
        if (page.url.pathname + page.url.search !== destination)
          void goto(destination as ResolvedPathname, { replaceState: true });
      }
      showExport = false;
      activeEditIndex = null;
      editorPending = false;
      editorMember = null;
      editorGroup = undefined;
      operationGroups = {};
      stale = false;
      pendingSpecies = null;
      showSwapPicker = false;
      swapUnavailable = false;
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
    editorRef?.flush();
    const input = document.querySelector<HTMLInputElement>('[data-team-name]');
    if (draft && input) draft.name = input.value;
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
  beforeNavigate(({ cancel, willUnload }) => {
    if (willUnload) return;
    if (dirty && !confirm('Discard unsaved input?')) cancel();
  });

  function groupFor(key: string, label: string) {
    return (operationGroups[key] ??= { id: generateUUID(), label });
  }
  function persistChange(
    patch: (team: SavedTeam) => SavedTeam,
    checkpoint: { id: string; label: string },
    saveName = false
  ): boolean {
    if (!draft) return false;
    try {
      const latest = readSavedTeams(localStorage).find(
        ({ id }) => id === draft!.id
      );
      if (!latest || contentSnapshot(latest) !== baseline) {
        stale = true;
        message =
          'This team changed elsewhere. Close and reopen the editor before saving.';
        return false;
      }
      const next = patch(latest);
      const pendingName = draft.name;
      saved = saveTeam(localStorage, next, checkpoint);
      const persisted = saved.find(({ id }) => id === next.id)!;
      baseline = contentSnapshot(persisted);
      draft = structuredClone($state.snapshot(persisted));
      if (!saveName) draft.name = pendingName;
      storageError = '';
      message = 'Saved on this device.';
      void pushNow();
      return true;
    } catch (error) {
      message =
        error instanceof Error &&
        error.message === 'This restore point is no longer available.'
          ? error.message
          : 'Could not save changes. Check browser storage access and available space. Your edits are still here; existing saved data was not replaced.';
      return false;
    }
  }
  function saveTeamName() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      message = 'Give this team a name.';
      return;
    }
    if (baseline && name === JSON.parse(baseline).name) {
      draft.name = name;
      return;
    }
    if (
      persistChange(
        (team) => ({ ...team, name }),
        groupFor('rename', 'Renamed team'),
        true
      )
    )
      delete operationGroups.rename;
  }
  function saveMember(index: number, member: Member): boolean {
    if (!editorGroup || !draft) return false;
    const restoresOriginal =
      canonicalSnapshot(member) ===
        canonicalSnapshot(draft.original.members[index]) &&
      canonicalSnapshot(member) !==
        canonicalSnapshot(JSON.parse(baseline).members[index]);
    const key = 'slot:' + index;
    const checkpoint = restoresOriginal
      ? groupFor(key, 'Restored ' + member.pokemon)
      : editorGroup;
    const saved = persistChange(
      (team) => ({
        ...team,
        members: team.members.map((existing, slot) =>
          slot === index ? structuredClone($state.snapshot(member)) : existing
        ),
      }),
      checkpoint
    );
    if (saved && restoresOriginal) {
      delete operationGroups[key];
      editorGroup = { id: generateUUID(), label: editorGroup.label };
    }
    return saved;
  }
  function restoreVersion(revisionId: string | 'original') {
    if (
      !draft ||
      editing ||
      deleting ||
      !confirm(
        'Restore this version? Your current team will remain in history.'
      )
    )
      return;
    const group = groupFor(
      'restore:' + revisionId,
      revisionId === 'original' ? 'Restored original' : 'Restored version'
    );
    if (persistChange((team) => restoreTeam(team, revisionId), group, true))
      delete operationGroups['restore:' + revisionId];
  }
  function restoreSlot(index: number) {
    if (!draft || editing || deleting) return;
    const member = $state.snapshot(draft.original.members[index]);
    if (!member) return;
    const group = groupFor('slot:' + index, 'Restored ' + member.pokemon);
    if (
      persistChange((team) => {
        const others = team.members.filter((_, slot) => slot !== index);
        if (
          others.some(
            (other) => normalize(other.pokemon) === normalize(member.pokemon)
          )
        )
          throw new Error('This Pokémon is already in another slot.');
        if (
          isMegaSpecies(member.pokemon) &&
          others.filter((other) => isMegaSpecies(other.pokemon)).length >=
            MAX_TEAM_MEGAS
        )
          throw new Error('This team already has two Mega Pokémon.');
        return {
          ...team,
          members: team.members.map((existing, slot) =>
            slot === index ? structuredClone(member) : existing
          ),
        };
      }, group)
    )
      delete operationGroups['slot:' + index];
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
    editorPending = false;
    editorMember = structuredClone($state.snapshot(draft!.members[index]));
    editorGroup = {
      id: generateUUID(),
      label: 'Edited ' + editorMember.pokemon,
    };
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
    if (editorRef?.requestClose() ?? true) closeSetEdit();
  }
  function closeSetEdit() {
    const targetSlot = activeEditIndex;
    const field = activeEditField;
    activeEditIndex = null;
    editorPending = false;
    editorMember = null;
    editorGroup = undefined;
    if (targetSlot !== null) {
      void tick().then(() => {
        focusSetField(targetSlot, field);
      });
    }
  }
  function startSpeciesSwap(pokemon: string) {
    if (!draft || editing) return;
    pendingSpecies = pokemon;
    showSwapPicker = false;
    const best = swapSuggestions(
      draft.members,
      teams,
      current,
      pokemon,
      data.tags as TeamTagsIndex
    )[0];
    swapUnavailable = !best;
    if (!best) return;
    if (
      persistChange(
        (team) => ({
          ...team,
          members: team.members.map((member, index) =>
            index === best.slot
              ? structuredClone($state.snapshot(best.member))
              : member
          ),
        }),
        groupFor('swap:' + pokemon, 'Changed Pokémon')
      )
    )
      delete operationGroups['swap:' + pokemon];
  }
  function cancelSpeciesSwap() {
    pendingSpecies = null;
    swapUnavailable = false;
  }
  async function copyPaste() {
    if (!draft || editing) return;
    showExport = true;
    const ok = await copyText(exportPaste(draft.members));
    message = ok
      ? 'Team text copied. Unknown fields are omitted; no stats were guessed.'
      : 'Clipboard unavailable. Select and copy the export text below.';
  }
  async function removeSelectedTeam() {
    if (!draft || editing || deleting) return;
    const id = draft.id;
    const warning = dirty
      ? ' Unsaved changes to this team will also be discarded.'
      : '';
    if (
      !confirm(`Delete “` + draft.name + `”? This cannot be undone.` + warning)
    )
      return;
    deleting = true;
    let previousActiveId: string | null;
    try {
      previousActiveId = localStorage.getItem(activeTeamKey);
    } catch {
      previousActiveId = null;
    }
    let remaining: SavedTeam[];
    try {
      remaining = deleteTeam(localStorage, id);
    } catch {
      message =
        'Could not delete team. Existing saved teams have been left untouched.';
      deleting = false;
      return;
    }
    draft = null;
    baseline = '';
    activeEditIndex = null;
    editorPending = false;
    editorMember = null;
    editorGroup = undefined;
    operationGroups = {};
    pendingSpecies = null;
    showSwapPicker = false;
    swapUnavailable = false;
    showExport = false;
    const replacement = resolveSavedTeamId(remaining, null, previousActiveId);
    let activeFailed = false;
    try {
      if (replacement) localStorage.setItem(activeTeamKey, replacement);
      else localStorage.removeItem(activeTeamKey);
    } catch {
      activeFailed = true;
    }
    openSaved(replacement, null, false);
    try {
      await goto(
        (replacement
          ? resolve('/my-teams') + '?team=' + encodeURIComponent(replacement)
          : resolve('/my-teams')) as ResolvedPathname,
        { replaceState: true }
      );
    } catch {
      activeFailed = true;
    }
    message = activeFailed
      ? 'Team deleted, but the active team could not be remembered.'
      : 'Team deleted.';
    void pushNow();
    deleting = false;
    await tick();
    document
      .querySelector<HTMLElement>(
        replacement ? 'select' : 'a[href$="/my-teams/new"]'
      )
      ?.focus();
  }
</script>

<svelte:head><title>My teams — Champion's Atlas</title></svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  <header>
    <h1
      class="text-[1.75rem] leading-tight font-extrabold wrap-break-word sm:text-4xl"
    >
      My teams
    </h1>
    <p
      class="mt-1.5 max-w-[58ch] text-[0.9375rem] leading-relaxed text-base-content/70"
    >
      Keep your original. Explore changes. Save your own version.
    </p>
  </header>
  <div class="mt-4 flex flex-wrap gap-2.5">
    <Button href={resolve('/my-teams/new')} class="min-h-11 px-4"
      >Add custom team</Button
    >
    <Button
      href={resolve('/?browse=all')}
      variant="outline"
      class="min-h-11 px-4">Browse teams</Button
    >
  </div>
  {#if storageError}<p
      role="alert"
      class="plate mt-5 max-w-[68ch] px-4 py-3 text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {storageError}
    </p>{/if}
  {#if !ready}<p class="mt-8 text-[0.9375rem] text-base-content/70">
      Loading saved teams…
    </p>
  {:else if !storageError}
    {#if saved.length}
      <label class="term mt-6 block max-w-xl"
        >Saved team
        <div
          class="mt-2 overflow-hidden rounded-[var(--radius-field)] focus-within:ring-2 focus-within:ring-primary"
        >
          <select
            class="select min-h-11 w-full sm:text-sm"
            value={draft?.id || ''}
            onchange={(event) => {
              void goto(resolve(`/my-teams?team=${event.currentTarget.value}`));
            }}
          >
            {#each saved as team (team.id)}<option value={team.id}
                >{team.name}</option
              >{/each}
          </select>
        </div>
      </label>
    {:else}
      <p class="plate mt-8 max-w-xl px-4 py-3 text-[0.9375rem] leading-relaxed">
        No saved teams yet. Open a catalog team and choose “Use this team”.
      </p>
    {/if}
    <p
      role="status"
      aria-live="polite"
      class="mt-4 min-h-6 text-[0.9375rem] text-base-content/70"
    >
      {message}
    </p>
    {#if draft}
      {@const originalResult = bestEvidence(
        {
          reports: draft.original.reports ?? [],
          regulation: draft.original.regulation,
        },
        current
      )}
      <section aria-label="Your team" class="plate mt-4 p-5 sm:p-6">
        <header class="flex items-start gap-3 border-b pb-4">
          <div class="min-w-0">
            <h2 class="text-lg leading-tight font-extrabold wrap-break-word">
              {draft.name}
            </h2>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                class="rounded-[var(--radius-selector)] border border-base-300 bg-base-100 px-2.5 py-0.5 text-[0.8125rem] leading-tight font-bold"
                >{regulationLabel(draft.original.regulation)}</span
              >
              {#if originalResult}
                <span
                  class="stamp"
                  data-grade={evidenceGrade(originalResult.level)}
                  >Original result: {originalResult.label}</span
                >
              {/if}
            </div>
          </div>
        </header>
        <ul
          class="mt-4 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6"
          aria-label="Team roster"
        >
          {#each draft.members as member, index (index)}
            <li class="flex min-w-0 flex-col items-center text-center">
              <a
                href={`#pokemon-slot-${index}`}
                class="rounded-[var(--radius-selector)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Go to ${member.pokemon}`}
              >
                <span
                  class="roster-sprite"
                  style="--type-color: {TYPE_COLORS[
                    getPokemonTypes(member.pokemon)[0]
                  ]}"
                >
                  <PokemonSprite pokemon={member.pokemon} size={40} />
                </span>
              </a>
              <p
                class="mt-1 w-full text-[0.8125rem] leading-tight wrap-break-word"
              >
                {member.pokemon}
              </p>
            </li>
          {/each}
        </ul>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <label class="term block w-full max-w-xl"
            >Team name<input
              class="input mt-2 min-h-11 w-full sm:text-sm"
              maxlength="200"
              data-team-name
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
              disabled={editing || deleting}
              onclick={copyPaste}>Copy team text</Button
            >
            <Button
              variant="outline"
              class="min-h-11 text-base-content"
              disabled={editing || deleting}
              onclick={removeSelectedTeam}>Delete team</Button
            >
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p class="provenance">
            {dirty ? 'Unsaved input.' : 'Saved on this device.'}
          </p>
          {#if draft.name !== draft.original.name}
            <p class="provenance">Original: {draft.original.name}</p>
          {/if}
        </div>
        <p class="provenance mt-1.5">
          Editing does not create a working rental code.
        </p>
        <div class="mt-5">
          {#if pendingSpecies}
            <div
              class="t-panel-slide input flex h-12 items-center justify-between gap-2"
              use:revealPanel
            >
              <span>{pendingSpecies}</span>
              <button
                type="button"
                class="btn size-11 min-h-11 min-w-11 btn-ghost p-0"
                aria-label="Clear selected Pokémon"
                onclick={cancelSpeciesSwap}><X class="size-4" /></button
              >
            </div>
          {:else if showSwapPicker}
            <div class="t-panel-slide" use:revealPanel>
              <PokemonPicker
                options={availableSpecies}
                onselect={startSpeciesSwap}
                disabled={editing}
                label="Change a Pokémon"
                placeholder="Choose a Pokémon to swap in…"
                disabledPlaceholder="Finish editing first"
              />
            </div>
          {:else}
            <Button
              variant="outline"
              class="min-h-11"
              disabled={editing}
              onclick={() => (showSwapPicker = true)}>Change a Pokémon</Button
            >
          {/if}
        </div>
        {#if swapUnavailable && pendingSpecies}
          <p class="provenance mt-2" role="status">
            No catalog team with {pendingSpecies} shares a remaining teammate.
          </p>
        {/if}
        {#key draft.id}
          <TeamHistoryPanel
            team={draft}
            currentRegulation={current}
            disabled={editing || deleting}
            onrestore={restoreVersion}
            onrestoreslot={restoreSlot}
          />
        {/key}
        <div class="mt-5 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {#each draft.members as member, index (index)}
            <section
              id={`pokemon-slot-${index}`}
              class="plate min-w-0 overflow-hidden transition-colors duration-300 ease-out motion-reduce:transition-none {activeEditIndex ===
              index
                ? 'border-primary'
                : 'hover:border-primary/40'}"
              aria-label={`${member.pokemon} set`}
            >
              <MemberCard
                {member}
                editable={true}
                {editing}
                onedit={(field) => openSetEditor(index, field)}
              />
            </section>
          {/each}
        </div>
        <p class="provenance mt-4 max-w-[68ch]">
          Team text normalizes to Pokémon Champions format (EVs out of 32, no
          IVs); unknown details stay omitted.
        </p>
        {#if showExport}<label
            class="t-panel-slide term mt-4 block"
            use:revealPanel
            >Export text<textarea
              readonly
              class="textarea mt-2 min-h-72 w-full p-3 font-mono text-xs"
              value={exportPaste(draft.members)}></textarea></label
          >{/if}
      </section>
    {/if}
  {/if}

  {#if activeEditIndex !== null && draft && editorMember}
    {@const editIndex = activeEditIndex!}
    <dialog
      use:openSetDialog
      oncancel={handleDialogCancel}
      aria-label={`Edit ${editorMember.pokemon} set`}
      class="set-editor-dialog fixed inset-0 z-50 m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-base-100 p-0 text-base-content shadow-xl sm:top-8 sm:bottom-auto sm:mx-auto sm:h-auto sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-4rem)] sm:max-w-2xl sm:rounded-box sm:border"
    >
      <SetEditorSheet
        bind:this={editorRef}
        member={editorMember}
        originalMembers={draft.original.members}
        originalSlotMember={draft.original.members[editIndex]}
        teams={data.catalog.teams as Team[]}
        currentRegulation={current}
        initialField={activeEditField}
        teammates={draft.members.filter((_, i) => i !== editIndex)}
        tagIndex={data.tags as TeamTagsIndex}
        ownTeams={saved.map(({ id, name, original, members }) => ({
          id,
          name,
          regulation: original.regulation,
          members,
        }))}
        excludeOwnTeamId={draft.id}
        onchange={(next) => saveMember(editIndex, next)}
        onclose={closeSetEdit}
        onpendingchange={(value) => (editorPending = value)}
      />
    </dialog>
  {/if}
</main>

<style>
  :global(dialog.set-editor-dialog::backdrop) {
    background: rgb(0 0 0 / 0.5);
  }
</style>
