<script lang="ts">
  import SetEditorPokemonSuggestions from '#lib/components/SetEditorPokemonSuggestions.svelte';
  import { createCurrentSetRegistry } from '#lib/current-set-registry.svelte.js';
  import { reuseCurrentSet, type CurrentSetChoice } from '#lib/current-sets.js';
  import EvEditor from '#lib/components/EvEditor.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
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
  import { canonicalSnapshot } from '#lib/team-history.js';
  import type { TeamTagsIndex } from '#lib/tags.js';
  import { catalogSuggestions, originalMemberFor } from '#lib/workbench.js';
  import { handleSuggestionKeydown } from '#lib/suggestion-keyboard.js';
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
  let editorElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();
  let editorHeading = $state<HTMLElement>();
  let evEditor = $state<{ flush: () => void }>();
  const draftMember = $derived<Member>({
    ...accepted,
    pokemon: form.pokemon.trim(),
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
      inGameMember
    )
  );
  const norm = (value: string, query: string) =>
    normalize(value).includes(normalize(query));
  const pokemonMatches = $derived(suggestions.pokemon);
  const visiblePokemon = $derived(pokemonMatches.slice(0, visiblePokemonCount));
  const hasMorePokemon = $derived(pokemonMatches.length > visiblePokemonCount);
  const itemMatches = $derived(
    suggestions.items.filter((option) => norm(option.value, itemQuery))
  );
  const filteredItems = $derived(itemMatches.slice(0, visibleItemCount));
  const hasMoreItems = $derived(itemMatches.length > visibleItemCount);
  const abilityMatches = $derived(
    suggestions.abilities.filter((option) => norm(option.value, abilityQuery))
  );
  const filteredAbilities = $derived(
    abilityMatches.slice(0, visibleAbilityCount)
  );
  const hasMoreAbilities = $derived(
    abilityMatches.length > visibleAbilityCount
  );
  const moveMatches = $derived(moveSuggestions(activeMoveSlot));
  const visibleMoveOptions = $derived(moveMatches.slice(0, visibleMoveCount));
  const hasMoreMoves = $derived(moveMatches.length > visibleMoveCount);
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
  $effect(() => onpendingchange(dirty));
  function clearError() {
    error = '';
    errorField = null;
  }
  function showError(field: EditableSetField, message: string) {
    errorField = field;
    error = message;
  }
  function resetQuery(field: string) {
    if (field === 'pokemon') pokemonQuery = '';
    else if (field === 'item') itemQuery = '';
    else if (field === 'ability') abilityQuery = '';
    else if (field.startsWith('move-'))
      moveQueries[Number(field.slice(5))] = '';
  }
  function applyPreFilled(next: Member) {
    form = fields(next);
  }
  function accept(next: Member, preserveMoves = false) {
    if (!onchange(next)) {
      showError(
        'set',
        'Could not save this input. Your edits are still here. ' +
          'Close and reopen the editor, then try again.'
      );
      return false;
    }
    const moves = form.moves.map((move) => move.trim());
    accepted = structuredClone($state.snapshot(next));
    replacement = null;
    applyPreFilled(next);
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
    applyPreFilled(candidate);
    if (moveSlots) form.moves = [...moveSlots];
    accept(candidate, !!moveSlots);
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
    ) {
      showError(
        'set',
        'My in-game set changed. Review the updated suggestions and choose again.'
      );
      return;
    }

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
    commit();
  }
  function clearMove(index: number) {
    form.moves[index] = '';
    commit();
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
  function validateMember(next: Member) {
    const validation = memberValidationError(
      next,
      accepted,
      teammates,
      'structured'
    );
    if (validation) {
      showError(
        validation.field === 'text' ? 'set' : validation.field,
        validation.message
      );
      return false;
    }
    return true;
  }
  export function flush(): boolean {
    evEditor?.flush();
    return commit();
  }
  function keepFocus(event: PointerEvent) {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.dataset.evStat) return;
    event.preventDefault();
  }
  function commit(): boolean {
    pokemonQuery = '';
    itemQuery = '';
    abilityQuery = '';
    moveQueries = ['', '', '', ''];
    visibleItemCount = 10;
    visibleAbilityCount = 10;
    visibleMoveCount = 10;
    visiblePokemonCount = 10;
    if (!dirty) {
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
      if (!validateMember(candidate)) return false;
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
    currentView = view;
    requestAnimationFrame(() => {
      if (contentElement) contentElement.scrollTop = 0;
      editorHeading?.focus({ preventScroll: true });
    });
  }
  function focusError() {
    requestAnimationFrame(() => {
      editorElement
        ?.querySelector<HTMLElement>('[role="alert"][tabindex="-1"]')
        ?.focus();
    });
  }
  function done() {
    if (flush()) onclose();
    else focusError();
  }
  export function requestClose(): boolean {
    if (flush()) return true;
    return confirm('Discard unsaved input?');
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
          pokemon={form.pokemon || initialMember.pokemon}
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
        moveOptions={visibleMoveOptions}
        hasMore={hasMoreMoves}
        onshowmore={() => (visibleMoveCount += 10)}
        {inGameMember}
        oningame={chooseInGame}
        {error}
        {errorField}
        onfocus={(index) => {
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
        oncommit={commit}
      />
    {:else if currentView === 'details'}
      <SetEditorDetails
        item={form.item}
        ability={form.ability}
        {filteredItems}
        {filteredAbilities}
        {hasMoreItems}
        {hasMoreAbilities}
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
        oncommit={commit}
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
      <section class="grid gap-4">
        <label for="set-pokemon-input" class="sr-only">Pokémon</label>
        <label class="input flex min-h-11 items-center gap-2">
          <PokemonSprite pokemon={form.pokemon} size={28} />
          <input
            id="set-pokemon-input"
            aria-label="Pokémon"
            class="grow bg-transparent text-sm focus:outline-none"
            placeholder="Pokémon"
            bind:value={form.pokemon}
            onfocus={() => resetQuery('pokemon')}
            onclick={() => resetQuery('pokemon')}
            oninput={(event) => {
              pokemonQuery = event.currentTarget.value;
              form.pokemon = event.currentTarget.value;
              visiblePokemonCount = 10;
              clearError();
            }}
            onblur={(event) => {
              if (!(
                event.relatedTarget instanceof HTMLElement &&
                event.relatedTarget.closest('[data-set-choice]')
              ))
                flush();
            }}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                flush();
                return;
              }
              handleSuggestionKeydown(
                event,
                document.getElementById('set-pokemon-suggestions'),
                'set-pokemon-input'
              );
            }}
          />
        </label>
        <p class="provenance">
          Choosing a suggested Pokémon replaces this set's fields.
        </p>
        {#if originalChanged && originalSlotMember}
          <Button
            variant="quiet"
            disabled={!!originalReason}
            data-set-choice
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => {
              if (originalSlotMember) chooseSet(originalSlotMember, true);
            }}>Use original set</Button
          >
          {#if originalReason}<p class="provenance">{originalReason}</p>{/if}
        {/if}
        <SetEditorPokemonSuggestions
          options={visiblePokemon}
          hasMore={hasMorePokemon}
          onshowmore={() => (visiblePokemonCount += 10)}
          onchoose={(next) => chooseSet(next, true)}
        />
        {#if error && errorField === 'pokemon'}
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
