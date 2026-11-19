<script lang="ts">
  import SetEditorPokemonSuggestions from '#lib/components/SetEditorPokemonSuggestions.svelte';
  import { createCurrentSetRegistry } from '#lib/current-set-registry.svelte.js';
  import { reuseCurrentSet, type CurrentSetChoice } from '#lib/current-sets.js';
  import EvEditor from '#lib/components/EvEditor.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import SetEditorDetails from '#lib/components/SetEditorDetails.svelte';
  import SetEditorMoves from '#lib/components/SetEditorMoves.svelte';
  import SetVpCost from '#lib/components/SetVpCost.svelte';
  import SetEditorHeader, {
    type EditorView,
  } from '#lib/components/SetEditorHeader.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { normalize, pokemonId, type Member, type Team } from '../catalog.js';
  import { knownName } from '#lib/canonical-names.js';
  import { parseSetBlock, updateSetText } from '#lib/paste.js';
  import {
    memberRosterError,
    memberValidationError,
  } from '#lib/member-validation.js';
  import { ladderShares } from '#lib/ladder.js';
  import { memberSetSignature } from '#lib/spread-provenance.js';
  import {
    pokemonSuggestions,
    SLOT_SUGGESTION_LIMIT,
  } from '#lib/swap-suggestions.js';
  import { canonicalSnapshot } from '#lib/team-history.js';
  import type { TeamTagsIndex } from '#lib/tags.js';
  import {
    catalogSuggestions,
    favoriteMembersFor,
    originalMemberFor,
    type CatalogSuggestion,
    type SavedTeam,
  } from '#lib/workbench.js';
  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditableSetField;
    initialMoveSlot?: number;
    teammates?: Member[];
    tagIndex?: TeamTagsIndex;
    originalMembers?: Member[];
    favoriteTeams?: SavedTeam[];
    onchange: (member: Member) => boolean;
    onclose: () => void;
    onpendingchange: (pending: boolean) => void;
  }
  let {
    member,
    teams,
    currentRegulation,
    initialField,
    initialMoveSlot = 0,
    teammates = [],
    tagIndex,
    originalMembers = [],
    favoriteTeams = [],
    onchange,
    onclose,
    onpendingchange,
  }: Props = $props();
  function getInitialView(field: EditableSetField): EditorView {
    if (field === 'set' || field === 'pokemon') return 'pokemon';
    if (field === 'item' || field === 'ability') return 'details';
    if (field === 'nature') return 'spread';
    return field;
  }
  const MOVE_SLOTS = [0, 1, 2, 3];
  const initialMember = (() => member)();
  const fieldOnOpen = (() => initialField)();
  const initialView = (() => getInitialView(fieldOnOpen))();
  const initialMoveIndex = (() => initialMoveSlot)();
  const currentSets = createCurrentSetRegistry();
  const fields = (next: Member) => ({
    pokemon: next.pokemon,
    item: next.item || '',
    ability: next.ability || '',
    nature: next.nature || '',
    spread: next.spread || '',
    moves: MOVE_SLOTS.map((index) => next.moves[index] || ''),
  });
  let accepted = $state<Member>(
    structuredClone($state.snapshot(initialMember))
  );
  let form = $state(fields(initialMember));
  let acceptedFields = $state(fields(initialMember));
  let currentView = $state<EditorView>(initialView);
  let activeMoveSlot = $state(initialMoveIndex);
  let replacement = $state<Member | null>(null);
  let pokemonQuery = $state(''),
    itemQuery = $state(''),
    abilityQuery = $state('');
  let moveQueries = $state(['', '', '', '']);
  let editingMoveSlot = $state<number | null>(null);
  let visibleItemCount = $state(10);
  let visibleAbilityCount = $state(10);
  let visibleMoveCount = $state(10);
  let visiblePokemonCount = $state(10);
  let stagedFrom = $state<Member | null>(null);
  let error = $state('');
  let errorField = $state<EditableSetField | null>(null);
  let closing = false;
  let undoFailed = false;
  let editorElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();
  let editorHeading = $state<HTMLElement>();
  let evEditor = $state<{ flush: () => void }>();
  const draftMember = $derived<Member>({
    ...accepted,
    pokemon: replacement?.pokemon ?? accepted.pokemon,
    item: form.item.trim() || null,
    ability: form.ability.trim() || null,
    nature: form.nature.trim() || null,
    spread: form.spread.trim() || null,
    moves: form.moves.map((move) => move.trim()).filter(Boolean),
  });
  const fieldText = $derived(updateSetText(accepted, draftMember));
  const dirty = $derived(
    canonicalSnapshot(form) !== canonicalSnapshot(acceptedFields) ||
      replacement !== null
  );
  const pending = $derived(dirty || stagedFrom !== null);
  const originalMember = $derived(
    originalMemberFor(draftMember, originalMembers)
  );
  const inGameMember = $derived(
    currentSets.sets?.find(
      (entry) => entry.id === pokemonId(draftMember.pokemon)
    )?.member
  );
  const favoriteEntries = $derived(
    favoriteMembersFor(draftMember, favoriteTeams, teammates)
  );
  const suggestions = $derived(
    catalogSuggestions(
      draftMember,
      teams,
      currentRegulation,
      teammates,
      originalMember,
      inGameMember,
      favoriteTeams
    )
  );
  const norm = (value: string, query: string) =>
    normalize(value).includes(normalize(query));
  type Flagged = { favorite?: true; original?: true; inGame?: true };
  const extraFavorites = (options: readonly Flagged[]) =>
    options.filter((opt) => opt.favorite && !opt.original && !opt.inGame)
      .length;
  const pageList = <T extends Flagged>(
    options: readonly T[],
    limit: number
  ) => {
    const end = limit + extraFavorites(options);
    return { visible: options.slice(0, end), hasMore: options.length > end };
  };
  const pokemonMatches = $derived(
    pokemonSuggestions(
      teammates,
      teams,
      currentRegulation,
      accepted.pokemon,
      tagIndex,
      pokemonQuery,
      { limit: SLOT_SUGGESTION_LIMIT, ladder: ladderShares(currentRegulation) },
      favoriteTeams
    )
  );
  const pokemonPage = $derived(pageList(pokemonMatches, visiblePokemonCount));
  const itemPage = $derived(
    pageList(
      suggestions.items.filter((opt) => norm(opt.value, itemQuery)),
      visibleItemCount
    )
  );
  const abilityPage = $derived(
    pageList(
      suggestions.abilities.filter((opt) => norm(opt.value, abilityQuery)),
      visibleAbilityCount
    )
  );
  const movePage = $derived(
    pageList(moveSuggestions(activeMoveSlot), visibleMoveCount)
  );
  const setSignature = (candidate: Member) =>
    memberSetSignature(candidate) ?? canonicalSnapshot(fields(candidate));
  const favoriteSlotSets = $derived.by(() => {
    const currentKey = setSignature(accepted);
    const rows: {
      member: Member;
      teamName: string;
      reason: string;
      key: string;
    }[] = [];
    for (const entry of favoriteMembersFor(
      accepted,
      favoriteTeams,
      teammates
    )) {
      if (pokemonQuery.trim() && !norm(entry.member.pokemon, pokemonQuery))
        continue;
      const key = setSignature(entry.member);
      if (key === currentKey || rows.some((row) => row.key === key)) continue;
      rows.push({ ...entry, reason: rosterError(entry.member), key });
    }
    return rows;
  });
  $effect(() => onpendingchange(pending));
  function clearError() {
    error = '';
    errorField = null;
  }
  function showError(field: EditableSetField, message: string) {
    errorField = field;
    error = message;
  }
  function resetQueries() {
    pokemonQuery = itemQuery = abilityQuery = '';
    moveQueries = ['', '', '', ''];
    editingMoveSlot = null;
    visibleItemCount =
      visibleAbilityCount =
      visibleMoveCount =
      visiblePokemonCount =
        10;
  }
  function resetQuery(field: string) {
    if (
      field === 'item' &&
      normalize(form.item) === normalize(acceptedFields.item)
    )
      itemQuery = '';
    else if (
      field === 'ability' &&
      normalize(form.ability) === normalize(acceptedFields.ability)
    )
      abilityQuery = '';
  }
  function accept(next: Member, preserveMoves = false) {
    if (!stagedFrom && !onchange(next)) {
      showError(
        'set',
        'Could not save this input. Your edits are still here. Close and reopen the editor, then try again.'
      );
      return false;
    }
    resetQueries();
    const moves = form.moves.map((move) => move.trim());
    accepted = structuredClone($state.snapshot(next));
    replacement = null;
    form = fields(next);
    if (preserveMoves) form.moves = moves;
    acceptedFields = structuredClone($state.snapshot(form));
    clearError();
    onpendingchange(stagedFrom !== null);
    return true;
  }
  function rosterError(next: Member) {
    return memberRosterError(next, accepted, teammates);
  }
  function chooseSet(
    next: Member,
    trusted = false,
    moveSlots?: string[],
    stage = false
  ): boolean {
    const candidate = structuredClone($state.snapshot(next));
    const reason = rosterError(candidate);
    if (reason) {
      showError('pokemon', reason);
      return false;
    }
    if (!trusted && !validateMember(candidate)) return false;
    if (stage) stagedFrom ??= structuredClone($state.snapshot(accepted));
    replacement = candidate;
    form = fields(candidate);
    if (moveSlots) form.moves = [...moveSlots];
    const ok = accept(candidate, !!moveSlots);
    if (ok) (document.activeElement as HTMLElement | null)?.blur();
    return ok;
  }
  function chooseInGame(choice: CurrentSetChoice, displayed: Member): void {
    const displayedSnapshot = canonicalSnapshot($state.snapshot(displayed));
    const moveSlots = MOVE_SLOTS.map((index) => form.moves[index].trim());
    const selectedId = pokemonId(displayed.pokemon);
    const latestSets = currentSets.refresh();
    if (!latestSets) return;
    const latestMember = latestSets.find(
      (entry) => entry.id === selectedId
    )?.member;
    if (
      pokemonId(draftMember.pokemon) !== selectedId ||
      !latestMember ||
      canonicalSnapshot($state.snapshot(latestMember)) !== displayedSnapshot
    )
      return showError(
        'set',
        'My in-game set changed. Review the updated suggestions and choose again.'
      );

    try {
      const current =
        choice.kind === 'move'
          ? { ...$state.snapshot(draftMember), moves: [...moveSlots] }
          : $state.snapshot(draftMember);
      const candidate = reuseCurrentSet(
        current,
        $state.snapshot(latestMember),
        choice
      );
      if (choice.kind === 'move') moveSlots[choice.index] = choice.move;
      chooseSet(candidate, choice.kind === 'move', moveSlots);
    } catch (caught) {
      showError(
        'set',
        caught instanceof Error ? caught.message : 'Invalid in-game choice.'
      );
    }
  }
  function chooseMove(index: number, value: string) {
    form.moves[index] = value;
    if (commit()) (document.activeElement as HTMLElement | null)?.blur();
  }
  function clearMove(index: number) {
    form.moves[index] = '';
    if (commit()) (document.activeElement as HTMLElement | null)?.blur();
  }
  function pickMove(index: number, option: CatalogSuggestion) {
    if (!option.inGame) return chooseMove(index, option.value);
    if (inGameMember)
      chooseInGame({ kind: 'move', index, move: option.value }, inGameMember);
  }
  function commitMoveText(pickFirst: boolean): boolean {
    const index = editingMoveSlot;
    if (index === null) return true;
    const text = normalize(moveQueries[index]);
    const options = text ? moveSuggestions(index) : [];
    const hit =
      options.find((option) => normalize(option.value) === text) ??
      (pickFirst ? options[0] : undefined);
    if (text && pickFirst && !hit) {
      showError('moves', 'Choose a known move.');
      return false;
    }
    moveQueries[index] = '';
    editingMoveSlot = null;
    visibleMoveCount = 10;
    clearError();
    if (!hit) return true;
    pickMove(index, hit);
    return !error;
  }
  function selectMoveSlot(index: number, edit: boolean) {
    if (edit && editingMoveSlot === index) return;
    if (!commitMoveText(false)) return focusError();
    activeMoveSlot = index;
    editingMoveSlot = edit ? index : null;
    visibleMoveCount = 10;
  }
  function moveSuggestions(index: number) {
    return suggestions.moves.filter(
      (option) =>
        norm(option.value, moveQueries[index]) &&
        !form.moves.some(
          (move, otherIndex) =>
            otherIndex !== index &&
            move &&
            normalize(move) === normalize(option.value)
        )
    );
  }
  function validateMember(next: Member, baseAccepted = accepted) {
    const err = memberValidationError(
      next,
      baseAccepted,
      teammates,
      'structured'
    );
    if (err) showError(err.field === 'text' ? 'set' : err.field, err.message);
    return !err;
  }
  export function flush(): boolean {
    evEditor?.flush();
    if (!commitMoveText(false)) return false;
    return commit();
  }
  function finishInput(blurOnSuccess = false): boolean {
    if (closing) return true;
    const ok = flush();
    if (ok) {
      if (blurOnSuccess) (document.activeElement as HTMLElement | null)?.blur();
      return true;
    }
    focusError();
    return false;
  }
  function keepFocus(event: PointerEvent) {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.dataset.evStat) return;
    event.preventDefault();
  }
  function commit(): boolean {
    if (!dirty) {
      resetQueries();
      clearError();
      return true;
    }
    clearError();
    try {
      if (
        replacement &&
        canonicalSnapshot(form) === canonicalSnapshot(fields(replacement))
      )
        return accept(structuredClone($state.snapshot(replacement)));
      if (normalize(form.pokemon) !== normalize(acceptedFields.pokemon)) {
        const targetKey = normalize(form.pokemon.trim());
        const favMatch = favoriteSlotSets.find(
          (fav) => !fav.reason && normalize(fav.member.pokemon) === targetKey
        );
        const match =
          favMatch ??
          pokemonMatches.find((opt) => normalize(opt.pokemon) === targetKey);
        if (match) {
          return chooseSet(match.member, true, undefined, true);
        }
        showError(
          'pokemon',
          rosterError({ ...accepted, pokemon: form.pokemon.trim() }) ||
            'Choose a known Pokémon.'
        );
        return false;
      }
      const matchChoice = (
        raw: string,
        prev: string,
        opts: readonly CatalogSuggestion[],
        field: EditableSetField,
        msg: string
      ): string | null => {
        if (!normalize(raw) || normalize(raw) === normalize(prev)) return raw;
        const hit = opts.find((opt) => normalize(opt.value) === normalize(raw));
        if (!hit) {
          showError(field, msg);
          return null;
        }
        return hit.value;
      };
      for (const [k, opts, label] of [
        ['item', suggestions.items, 'Choose a known item.'],
        ['ability', suggestions.abilities, 'Choose a known ability.'],
      ] as const) {
        const v = matchChoice(form[k], acceptedFields[k], opts, k, label);
        if (v === null) return false;
        form[k] = v;
      }
      for (const [i, raw] of form.moves.entries()) {
        const nextMove = matchChoice(
          raw,
          acceptedFields.moves[i],
          suggestions.moves,
          'moves',
          'Choose a known move.'
        );
        if (nextMove === null) {
          activeMoveSlot = i;
          return false;
        }
        form.moves[i] = nextMove;
      }
      const nextNature = matchChoice(
        form.nature,
        acceptedFields.nature,
        suggestions.natures,
        'nature',
        'Choose a standard nature.'
      );
      if (nextNature === null) return false;
      form.nature = nextNature;
      const moves = form.moves.map((move) => move.trim()).filter(Boolean);
      if (
        moves.some(
          (move, index) =>
            moves.findIndex(
              (candidate) => normalize(candidate) === normalize(move)
            ) !== index
        )
      ) {
        showError('moves', 'A set cannot include the same move twice.');
        return false;
      }
      const candidate = {
        ...accepted,
        ...parseSetBlock(fieldText),
        pokemon: draftMember.pokemon,
      };
      if (
        !validateMember(candidate, {
          ...accepted,
          item: candidate.item,
          ability: candidate.ability,
          moves: candidate.moves,
        })
      )
        return false;
      return accept(
        {
          ...candidate,
          item: candidate.item
            ? (knownName('item', candidate.item) ?? candidate.item)
            : candidate.item,
          ability: candidate.ability
            ? (knownName('ability', candidate.ability) ?? candidate.ability)
            : candidate.ability,
          moves: candidate.moves.map((move) => knownName('move', move) ?? move),
        },
        true
      );
    } catch (caught) {
      showError(
        'set',
        caught instanceof Error ? caught.message : 'Invalid set format.'
      );
      return false;
    }
  }
  function switchView(view: EditorView) {
    if (view === currentView) return;
    if (!flush()) {
      focusError();
      return;
    }
    currentView = view;
    requestAnimationFrame(() => {
      if (contentElement) contentElement.scrollTop = 0;
      editorHeading?.focus({ preventScroll: true });
    });
  }
  function focusError() {
    const focusTarget = () => {
      if (closing) return;
      const sel =
        errorField &&
        ['pokemon', 'item', 'ability', 'nature'].includes(errorField)
          ? `#set-${errorField}-input`
          : errorField === 'moves'
            ? `#set-move-${activeMoveSlot + 1}`
            : '';
      const el =
        (sel ? editorElement?.querySelector<HTMLElement>(sel) : null) ??
        editorElement?.querySelector<HTMLElement>(
          '[role="alert"][tabindex="-1"]'
        );
      el?.focus({ preventScroll: true });
    };
    requestAnimationFrame(focusTarget);
  }
  function done() {
    if (!flush() && !undoFailed) return focusError();
    if (stagedFrom) return;
    closing = true;
    onclose();
  }
  function unstage() {
    if (stagedFrom && accept(stagedFrom)) stagedFrom = null;
  }
  function applySwap() {
    if (!flush()) return focusError();
    if (!onchange(structuredClone($state.snapshot(accepted))))
      return showError(
        'set',
        'Could not save this swap. Your edits are still here. Close and reopen the editor, then try again.'
      );
    stagedFrom = null;
    closing = true;
    onclose();
  }
  export function requestClose(): boolean {
    closing = true;
    const opened = structuredClone($state.snapshot(initialMember));
    if (
      canonicalSnapshot($state.snapshot(stagedFrom ?? accepted)) ===
        canonicalSnapshot(opened) ||
      onchange(opened)
    )
      return true;
    closing = false;
    undoFailed = true;
    showError(
      'set',
      'Could not undo the changes already saved to this set. Choose Done to keep them.'
    );
    focusError();
    return false;
  }
  export function focusInitialSection() {
    requestAnimationFrame(() => {
      const field = initialField === 'set' ? 'pokemon' : initialField;
      const inputId =
        field === 'item' ||
        field === 'ability' ||
        field === 'nature' ||
        field === 'pokemon'
          ? '#set-' + field + '-input'
          : field === 'moves'
            ? `#set-move-${activeMoveSlot + 1}`
            : field === 'spread'
              ? '[data-ev-toggle]'
              : '';
      const target =
        (inputId ? editorElement?.querySelector<HTMLElement>(inputId) : null) ||
        editorElement?.querySelector<HTMLElement>(
          '[data-editor-section="' + field + '"]'
        );
      if (target && contentElement && target !== editorHeading)
        contentElement.scrollTop = Math.max(
          0,
          target.offsetTop - contentElement.offsetTop - 8
        );
      editorHeading?.focus({ preventScroll: true });
    });
  }
</script>

<div
  bind:this={editorElement}
  class="flex min-h-0 grow flex-col phone-landscape:grid phone-landscape:grid-cols-[14rem_minmax(0,1fr)] phone-landscape:grid-rows-[minmax(0,1fr)_auto]"
>
  <SetEditorHeader
    bind:heading={editorHeading}
    view={currentView}
    section={currentView === 'details'
      ? initialField === 'ability'
        ? 'ability'
        : 'item'
      : currentView}
    pokemon={accepted.pokemon}
    staged={stagedFrom !== null}
    onswitch={switchView}
    onapply={applySwap}
    onpointerdown={keepFocus}
  />
  <div
    bind:this={contentElement}
    class="min-h-0 flex-auto overflow-y-auto overscroll-contain py-4 pr-7 pl-5 sm:pr-8.5 sm:pl-6 phone-landscape:row-span-2"
  >
    {#if currentSets.error}
      <p
        role="alert"
        class="mb-3 text-[0.9375rem] leading-relaxed"
        style="color: var(--color-error-content)"
      >
        {currentSets.error}
      </p>
    {/if}
    {#if currentView === 'moves'}
      <SetEditorMoves
        moves={form.moves}
        {activeMoveSlot}
        {editingMoveSlot}
        query={editingMoveSlot === null ? '' : moveQueries[editingMoveSlot]}
        moveOptions={movePage.visible}
        hasMore={movePage.hasMore}
        onshowmore={() => (visibleMoveCount += 5)}
        {error}
        {errorField}
        onselect={(index) => selectMoveSlot(index, false)}
        onedit={(index) => selectMoveSlot(index, true)}
        onchange={(value) => {
          moveQueries[activeMoveSlot] = value;
          visibleMoveCount = 10;
          clearError();
        }}
        onchoose={(option) => pickMove(activeMoveSlot, option)}
        onclear={clearMove}
        oncommit={(pickFirst) => {
          if (!closing && !commitMoveText(pickFirst)) focusError();
        }}
      />
    {:else if currentView === 'details'}
      <SetEditorDetails
        item={form.item}
        ability={form.ability}
        filteredItems={itemPage.visible}
        filteredAbilities={abilityPage.visible}
        hasMoreItems={itemPage.hasMore}
        hasMoreAbilities={abilityPage.hasMore}
        onshowmoreitems={() => (visibleItemCount += 5)}
        onshowmoreabilities={() => (visibleAbilityCount += 5)}
        {inGameMember}
        oningame={chooseInGame}
        {error}
        {errorField}
        onitemchange={(val) => {
          itemQuery = form.item = val;
          visibleItemCount = 10;
          clearError();
        }}
        onabilitychange={(val) => {
          abilityQuery = form.ability = val;
          visibleAbilityCount = 10;
          clearError();
        }}
        onresetquery={resetQuery}
        oncommit={finishInput}
      />
    {:else if currentView === 'spread'}
      <section aria-label="EV spread" class="grid gap-4">
        <EvEditor
          bind:this={evEditor}
          member={draftMember}
          {teams}
          {teammates}
          {currentRegulation}
          {originalMember}
          favoriteMembers={favoriteEntries.map(({ member: fav }) => fav)}
          natureSuggestions={suggestions.natures}
          {inGameMember}
          oningame={chooseInGame}
          onspreadchange={(spread, nature) => {
            form.spread = spread;
            if (nature) form.nature = nature;
            clearError();
            commit();
          }}
          onnaturechange={(value) => {
            form.nature = value;
            commit();
          }}
        />
        {#if error && (errorField === 'spread' || errorField === 'nature')}
          <p
            role="alert"
            tabindex="-1"
            class="text-[0.9375rem] leading-relaxed"
            style="color: var(--color-error-content)"
          >
            {error}
          </p>
        {/if}
      </section>
    {:else if currentView === 'pokemon'}
      <SetEditorPokemonSuggestions
        bind:pokemon={form.pokemon}
        query={pokemonQuery}
        accepted={(stagedFrom ?? accepted).pokemon}
        options={pokemonPage.visible}
        hasMore={pokemonPage.hasMore}
        {favoriteSlotSets}
        {error}
        {errorField}
        onshowmore={() => (visiblePokemonCount += 5)}
        onchoose={(next) => chooseSet(next, true, undefined, true)}
        onback={unstage}
        oninputchange={(value) => {
          pokemonQuery = value;
          form.pokemon = value.trim() || acceptedFields.pokemon;
          replacement = null;
          visiblePokemonCount = 10;
          clearError();
        }}
        oncommit={finishInput}
      />
    {/if}
  </div>
  <footer
    class="shrink-0 border-t border-base-300 bg-base-100 px-5 pt-3 pb-3 sm:px-6 sm:pb-4 phone-landscape:border-r"
  >
    {#if error && !((currentView === 'moves' && errorField === 'moves') || (currentView === 'details' && ['item', 'ability'].includes(errorField || '')) || (currentView === 'spread' && (errorField === 'spread' || errorField === 'nature')) || (currentView === 'pokemon' && errorField === 'pokemon'))}<p
        role="alert"
        tabindex="-1"
        class="mb-2 text-sm"
        style="color: var(--color-error-content)"
      >
        {error}
      </p>{/if}
    <SetVpCost member={draftMember} class="mb-1" />
    <p role="status" aria-live="polite" class="provenance mb-3">
      {pending ? 'Unsaved input.' : 'Saved on this device.'}
    </p>
    <div class="flex flex-wrap justify-end gap-2">
      <Button
        variant="quiet"
        onpointerdown={keepFocus}
        onclick={() => {
          if (requestClose()) onclose();
        }}>Cancel</Button
      >
      {#if !stagedFrom}
        <Button variant="primary" onpointerdown={keepFocus} onclick={done}
          >Done</Button
        >
      {/if}
    </div>
  </footer>
</div>
