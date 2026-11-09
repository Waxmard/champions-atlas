<script lang="ts">
  import SetEditorPokemonSuggestions from '#lib/components/SetEditorPokemonSuggestions.svelte';
  import { createCurrentSetRegistry } from '#lib/current-set-registry.svelte.js';
  import { reuseCurrentSet, type CurrentSetChoice } from '#lib/current-sets.js';
  import EvEditor from '#lib/components/EvEditor.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import SetEditorDetails from '#lib/components/SetEditorDetails.svelte';
  import SetEditorMoves from '#lib/components/SetEditorMoves.svelte';
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { normalize, pokemonId, type Member, type Team } from '../catalog.js';
  import { knownName } from '#lib/canonical-names.js';
  import { parseSetBlock, updateSetText } from '#lib/paste.js';
  import {
    memberRosterError,
    memberValidationError,
  } from '#lib/member-validation.js';
  import { memberSetSignature } from '#lib/spread-provenance.js';
  import { canonicalSnapshot } from '#lib/team-history.js';
  import type { TeamTagsIndex } from '#lib/tags.js';
  import {
    catalogSuggestions,
    favoriteMembersFor,
    originalMemberFor,
    type CatalogSuggestion,
    type SavedTeam,
  } from '#lib/workbench.js';
  type EditorView = 'pokemon' | 'details' | 'moves' | 'spread';
  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditableSetField;
    initialMoveSlot?: number;
    teammates?: Member[];
    tagIndex?: TeamTagsIndex;
    originalMembers?: Member[];
    originalSlotMember?: Member;
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
    originalSlotMember,
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
  const EDITOR_SECTIONS: { id: EditorView; label: string }[] = [
    { id: 'pokemon', label: 'Pokémon' },
    { id: 'details', label: 'Details' },
    { id: 'spread', label: 'EVs' },
    { id: 'moves', label: 'Moves' },
  ];
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
  let visibleItemCount = $state(10);
  let visibleAbilityCount = $state(10);
  let visibleMoveCount = $state(10);
  let visiblePokemonCount = $state(10);
  let error = $state('');
  let errorField = $state<EditableSetField | null>(null);
  let closing = false;
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
      tagIndex,
      pokemonQuery,
      accepted.pokemon,
      originalMember,
      inGameMember,
      favoriteTeams
    )
  );
  const norm = (value: string, query: string) =>
    normalize(value).includes(normalize(query));
  const extraFavorites = (options: readonly CatalogSuggestion[]) =>
    options.filter((opt) => opt.favorite && !opt.original && !opt.inGame)
      .length;
  const pageList = (options: readonly CatalogSuggestion[], limit: number) => {
    const end = limit + extraFavorites(options);
    return { visible: options.slice(0, end), hasMore: options.length > end };
  };
  const pokemonMatches = $derived(suggestions.pokemon);
  const extraFavoritePokemon = $derived(
    pokemonMatches.filter((opt) => opt.favorite).length
  );
  const visiblePokemon = $derived(
    pokemonMatches.slice(0, visiblePokemonCount + extraFavoritePokemon)
  );
  const hasMorePokemon = $derived(
    pokemonMatches.length > visiblePokemonCount + extraFavoritePokemon
  );
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
  const subViewTitle = $derived(
    {
      pokemon: 'Pokémon',
      details: 'Item and ability',
      moves: 'Moves',
      spread: 'EV spread',
    }[currentView]
  );
  const originalReason = $derived(
    originalSlotMember ? rosterError(originalSlotMember) : ''
  );
  const originalChanged = $derived(
    !!originalSlotMember &&
      canonicalSnapshot(originalSlotMember) !== canonicalSnapshot(accepted)
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
  $effect(() => onpendingchange(dirty));
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
    visibleItemCount =
      visibleAbilityCount =
      visibleMoveCount =
      visiblePokemonCount =
        10;
  }
  function resetQuery(field: string) {
    if (
      field === 'pokemon' &&
      normalize(form.pokemon) === normalize(acceptedFields.pokemon)
    )
      pokemonQuery = '';
    else if (
      field === 'item' &&
      normalize(form.item) === normalize(acceptedFields.item)
    )
      itemQuery = '';
    else if (
      field === 'ability' &&
      normalize(form.ability) === normalize(acceptedFields.ability)
    )
      abilityQuery = '';
    else if (field.startsWith('move-')) {
      const index = Number(field.slice(5));
      if (
        normalize(form.moves[index]) === normalize(acceptedFields.moves[index])
      )
        moveQueries[index] = '';
    }
  }
  function accept(next: Member, preserveMoves = false) {
    if (!onchange(next)) {
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
    onpendingchange(false);
    return true;
  }
  function rosterError(next: Member) {
    return memberRosterError(next, accepted, teammates);
  }
  function chooseSet(next: Member, trusted = false, moveSlots?: string[]) {
    const candidate = structuredClone($state.snapshot(next));
    const reason = rosterError(candidate);
    if (reason) {
      showError('pokemon', reason);
      return;
    }
    if (!trusted && !validateMember(candidate)) return;
    replacement = candidate;
    form = fields(candidate);
    if (moveSlots) form.moves = [...moveSlots];
    if (accept(candidate, !!moveSlots))
      (document.activeElement as HTMLElement | null)?.blur();
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
      chooseSet(candidate, false, moveSlots);
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
      if (
        !replacement &&
        normalize(form.pokemon) !== normalize(acceptedFields.pokemon)
      ) {
        const targetKey = normalize(form.pokemon.trim());
        const favMatch = favoriteSlotSets.find(
          (fav) => !fav.reason && normalize(fav.member.pokemon) === targetKey
        );
        const match =
          favMatch ??
          pokemonMatches.find((opt) => normalize(opt.pokemon) === targetKey);
        if (match) {
          chooseSet(match.member, true);
          return !error;
        }
        showError(
          'pokemon',
          !form.pokemon.trim()
            ? 'Enter a Pokémon.'
            : rosterError({ ...accepted, pokemon: form.pokemon.trim() }) ||
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
    queueMicrotask(focusTarget);
    requestAnimationFrame(focusTarget);
  }
  function done() {
    if (flush()) {
      closing = true;
      onclose();
    } else focusError();
  }
  export function requestClose(): boolean {
    if (flush()) {
      closing = true;
      return true;
    }
    closing = true;
    const discard = confirm('Discard unsaved input?');
    if (!discard) {
      closing = false;
      focusError();
    }
    return discard;
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

<div bind:this={editorElement} class="flex min-h-0 grow flex-col">
  <header
    class="max-h-[30dvh] shrink-0 overflow-y-auto overscroll-contain border-b border-base-300 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2
        bind:this={editorHeading}
        class="min-w-[min(6rem,100%)] flex-1 text-lg leading-tight font-semibold wrap-anywhere sm:text-[1.375rem]"
        tabindex="-1"
        data-editor-section={currentView === 'details'
          ? initialField === 'ability'
            ? 'ability'
            : 'item'
          : currentView}
      >
        {subViewTitle}
      </h2>
      <div
        class="ms-auto flex max-w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-selector)] border border-base-300 px-2.5 py-1 text-xs text-base-content/70"
      >
        <SpeciesLabel
          pokemon={draftMember.pokemon || initialMember.pokemon}
          spriteSize={20}
          textClass="max-w-[120px] truncate text-xs font-medium"
        />
      </div>
    </div>
    <nav aria-label="Set sections" class="mt-2.5 flex flex-wrap gap-1">
      {#each EDITOR_SECTIONS as section (section.id)}
        <Button
          variant={currentView === section.id ? 'primary' : 'quiet'}
          size="dense"
          aria-current={currentView === section.id ? 'page' : undefined}
          onpointerdown={keepFocus}
          onclick={() => switchView(section.id)}
        >
          {section.label}
        </Button>
      {/each}
    </nav>
  </header>
  <div
    bind:this={contentElement}
    class="min-h-0 flex-auto overflow-y-auto overscroll-contain py-4 pr-7 pl-5 sm:pr-8.5 sm:pl-6"
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
        moveOptions={movePage.visible}
        hasMore={movePage.hasMore}
        onshowmore={() => (visibleMoveCount += 10)}
        {inGameMember}
        oningame={chooseInGame}
        {error}
        {errorField}
        onfocus={(index) => {
          if (
            index !== activeMoveSlot &&
            normalize(form.moves[activeMoveSlot]) !==
              normalize(acceptedFields.moves[activeMoveSlot])
          ) {
            if (!finishInput(false)) return;
          }
          activeMoveSlot = index;
          resetQuery(`move-${index}`);
        }}
        onchange={(index, value) => {
          form.moves[index] = moveQueries[index] = value;
          activeMoveSlot = index;
          visibleMoveCount = 10;
          clearError();
        }}
        onchoose={chooseMove}
        onclear={clearMove}
        oncommit={finishInput}
      />
    {:else if currentView === 'details'}
      <SetEditorDetails
        item={form.item}
        ability={form.ability}
        filteredItems={itemPage.visible}
        filteredAbilities={abilityPage.visible}
        hasMoreItems={itemPage.hasMore}
        hasMoreAbilities={abilityPage.hasMore}
        onshowmoreitems={() => (visibleItemCount += 10)}
        onshowmoreabilities={() => (visibleAbilityCount += 10)}
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
        options={visiblePokemon}
        hasMore={hasMorePokemon}
        {originalChanged}
        {originalSlotMember}
        {originalReason}
        {favoriteSlotSets}
        {error}
        {errorField}
        onshowmore={() => (visiblePokemonCount += 10)}
        onchoose={(next) => chooseSet(next, true)}
        onresetquery={() => resetQuery('pokemon')}
        oninputchange={(value) => {
          pokemonQuery = form.pokemon = value;
          visiblePokemonCount = 10;
          clearError();
        }}
        oncommit={finishInput}
      />
    {/if}
  </div>
  <footer
    class="shrink-0 border-t border-base-300 bg-base-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4"
  >
    {#if error && !((currentView === 'moves' && errorField === 'moves') || (currentView === 'details' && ['item', 'ability'].includes(errorField || '')) || (currentView === 'spread' && (errorField === 'spread' || errorField === 'nature')) || (currentView === 'pokemon' && errorField === 'pokemon'))}<p
        role="alert"
        tabindex="-1"
        class="mb-2 text-sm"
        style="color: var(--color-error-content)"
      >
        {error}
      </p>{/if}
    <p role="status" aria-live="polite" class="provenance mb-3">
      {dirty ? 'Unsaved input.' : 'Saved on this device.'}
    </p>
    <div class="flex flex-wrap justify-end gap-2">
      <Button
        variant="quiet"
        onpointerdown={keepFocus}
        onclick={() => {
          if (requestClose()) onclose();
        }}>Close</Button
      >
      <Button variant="primary" onpointerdown={keepFocus} onclick={done}
        >Done</Button
      >
    </div>
  </footer>
</div>
