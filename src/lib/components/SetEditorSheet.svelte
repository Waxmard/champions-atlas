<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import InGameSetSuggestion from '#lib/components/InGameSetSuggestion.svelte';
  import SetEditorPokemonSuggestions from '#lib/components/SetEditorPokemonSuggestions.svelte';
  import { createCurrentSetRegistry } from '#lib/current-set-registry.svelte.js';
  import { reuseCurrentSet, type CurrentSetChoice } from '#lib/current-sets.js';
  import EvEditor from '#lib/components/EvEditor.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import SetEditorDetails from '#lib/components/SetEditorDetails.svelte';
  import SetEditorMoves from '#lib/components/SetEditorMoves.svelte';
  import SetEditorOverview from '#lib/components/SetEditorOverview.svelte';
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import TypeBadge from '#lib/components/TypeBadge.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { normalize, pokemonId, type Member, type Team } from '../catalog.js';
  import {
    championsSpreadTotal,
    NATURES,
    parseChampionsSpread,
    parseSetBlock,
    updateSetText,
  } from '#lib/paste.js';
  import {
    memberRosterError,
    memberValidationError,
  } from '#lib/member-validation.js';
  import { canonicalSnapshot } from '#lib/team-history.js';
  import { getPokemonTypes, TYPE_COLORS } from '#lib/types.js';
  import type { TeamTagsIndex } from '#lib/tags.js';
  import {
    catalogSuggestions,
    originalMemberFor,
    setText,
  } from '#lib/workbench.js';
  type EditorView =
    'overview' | 'pokemon' | 'details' | 'moves' | 'spread' | 'text';
  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditableSetField;
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
    teammates = [],
    tagIndex,
    originalMembers = [],
    originalSlotMember,
    onchange,
    onclose,
    onpendingchange,
  }: Props = $props();
  function getInitialView(field: EditableSetField): EditorView {
    if (field === 'set') return 'overview';
    if (field === 'item' || field === 'ability' || field === 'nature')
      return 'details';
    return field;
  }
  const MOVE_SLOTS = [0, 1, 2, 3];
  const initialMember = (() => member)();
  const initialView = (() => getInitialView(initialField))();
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
  let activeMoveSlot = $state(0);
  let rawText = $state(setText(initialMember));
  let textBaseline = $state(setText(initialMember));
  let replacement = $state<Member | null>(null);
  let activeSuggestions = $state<string | null>(
    initialView === 'pokemon' ? 'pokemon' : null
  );
  let pokemonQuery = $state(''),
    itemQuery = $state(''),
    abilityQuery = $state('');
  let moveQueries = $state(['', '', '', '']);
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
    (currentView === 'text' && rawText !== textBaseline) ||
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
  const previewCurrent = $derived<Member>({
    ...draftMember,
    set:
      canonicalSnapshot(form) !== canonicalSnapshot(acceptedFields)
        ? fieldText
        : accepted.set,
  });
  const inGameReason = $derived(
    inGameMember
      ? (memberValidationError(
          structuredClone($state.snapshot(inGameMember)),
          accepted,
          teammates,
          'structured'
        )?.message ?? '')
      : ''
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
  const visibleInGameMember = $derived(
    inGameMember && norm(inGameMember.pokemon, pokemonQuery)
      ? inGameMember
      : null
  );
  const filteredPokemon = $derived(suggestions.pokemon.slice(0, 5));
  const filteredItems = $derived(
    suggestions.items
      .filter((option) => norm(option.value, itemQuery))
      .slice(0, 5)
  );
  const filteredAbilities = $derived(
    suggestions.abilities
      .filter((option) => norm(option.value, abilityQuery))
      .slice(0, 5)
  );
  const legacyNature = $derived(
    form.nature && !NATURES.some((nature) => nature === form.nature)
      ? form.nature
      : null
  );
  const currentSpread = $derived(parseChampionsSpread(form.spread));
  const currentSpreadTotal = $derived(
    currentSpread ? championsSpreadTotal(currentSpread) : 0
  );
  const subViewTitle = $derived(
    {
      pokemon: 'Pokémon',
      details: 'Item, ability, and nature',
      moves: 'Moves',
      spread: 'EV spread',
      text: 'Showdown set text',
      overview: 'Overview',
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
  function openSuggestions(field: string) {
    activeSuggestions = field;
    if (field === 'pokemon') pokemonQuery = '';
    else if (field === 'item') itemQuery = '';
    else if (field === 'ability') abilityQuery = '';
    else if (field.startsWith('move-'))
      moveQueries[Number(field.slice(5))] = '';
  }
  function applyPreFilled(next: Member) {
    form = fields(next);
    activeSuggestions = null;
  }
  function accept(next: Member, preserveMoves = false) {
    if (!onchange(next)) {
      showError(
        currentView === 'text' ? 'text' : 'set',
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
    rawText = setText(next);
    textBaseline = rawText;
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
    if (!trusted && !validateMember(candidate, 'structured')) return;
    replacement = candidate;
    applyPreFilled(candidate);
    if (moveSlots) form.moves = [...moveSlots];
    accept(candidate, !!moveSlots);
  }
  function chooseInGame(choice: CurrentSetChoice, displayed: Member): void {
    const displayedSnapshot = canonicalSnapshot($state.snapshot(displayed));
    const moveSlots = MOVE_SLOTS.map((index) => form.moves[index].trim());
    if (choice.kind === 'set' && !flush()) return;

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
      if (choice.kind === 'set') {
        chooseSet(candidate);
      } else {
        if (choice.kind === 'move') moveSlots[choice.index] = choice.move;
        chooseSet(candidate, false, moveSlots);
      }
    } catch (caught) {
      showError(
        'set',
        caught instanceof Error ? caught.message : 'Invalid in-game choice.'
      );
    }
  }
  function chooseMove(index: number, value: string) {
    form.moves[index] = value;
    activeSuggestions = null;
    commit();
  }
  function clearMove(index: number) {
    form.moves[index] = '';
    activeSuggestions = null;
    commit();
  }
  function moveSuggestions(index: number) {
    const options = suggestions.moves.filter(
      (option) =>
        norm(option.value, moveQueries[index]) &&
        !form.moves.some(
          (move, otherIndex) =>
            otherIndex !== index &&
            move &&
            normalize(move) === normalize(option.value)
        )
    );
    return options.slice(
      0,
      Math.max(
        5,
        options.filter((option) => option.original || option.inGame).length
      )
    );
  }
  function validateMember(next: Member, mode: 'structured' | 'text') {
    const validation = memberValidationError(next, accepted, teammates, mode);
    if (validation) {
      showError(validation.field, validation.message);
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
        currentView !== 'text' &&
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
      const candidate =
        currentView === 'text'
          ? parseSetBlock(rawText)
          : {
              ...accepted,
              ...parseSetBlock(fieldText),
              pokemon: draftMember.pokemon,
            };
      if (
        !validateMember(
          candidate,
          currentView === 'text' ? 'text' : 'structured'
        )
      )
        return false;
      return accept(candidate, currentView !== 'text');
    } catch (caught) {
      showError(
        currentView === 'text' ? 'text' : 'set',
        caught instanceof Error ? caught.message : 'Invalid set format.'
      );
      return false;
    }
  }
  function backToOverview() {
    if (!flush() && currentView === 'text') return;
    currentView = 'overview';
    activeSuggestions = null;
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
    if (activeSuggestions) {
      activeSuggestions = null;
      return false;
    }
    if (flush()) return true;
    return confirm('Discard unsaved input?');
  }
  export function focusInitialSection() {
    requestAnimationFrame(() => {
      const field = initialField === 'set' ? 'set' : initialField;
      const inputId =
        field === 'item' ||
        field === 'ability' ||
        field === 'nature' ||
        field === 'pokemon'
          ? '#set-' + field + '-input'
          : field === 'moves'
            ? '#set-move-1'
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
      (target || editorHeading)?.focus({ preventScroll: true });
    });
  }
</script>

<div bind:this={editorElement} class="flex min-h-0 grow flex-col">
  {#snippet savedSetSuggestion()}
    {#if inGameMember}
      <InGameSetSuggestion
        current={previewCurrent}
        saved={inGameMember}
        reason={inGameReason}
        onchoose={(displayed) => chooseInGame({ kind: 'set' }, displayed)}
      />
    {/if}
  {/snippet}

  <header
    class="shrink-0 border-b border-base-300 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 sm:pt-5"
  >
    {#if currentView === 'overview'}
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="roster-sprite shrink-0"
            style="--type-color: {TYPE_COLORS[
              getPokemonTypes(form.pokemon || initialMember.pokemon)[0]
            ]}"
          >
            <PokemonSprite
              pokemon={form.pokemon || initialMember.pokemon}
              size={40}
            />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2
                bind:this={editorHeading}
                class="text-[1.375rem] leading-tight font-extrabold wrap-break-word"
                tabindex="-1"
                data-editor-section="set"
              >
                Edit {initialMember.pokemon} set
              </h2>
              <div class="flex items-center gap-1">
                {#each getPokemonTypes(form.pokemon || initialMember.pokemon) as type (type)}
                  <TypeBadge {type} size="md" />
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <Button
            variant="quiet"
            size="touch"
            onclick={backToOverview}
            aria-label="Back to overview"
          >
            <ArrowLeft class="size-4" />
            <span>Overview</span>
          </Button>
          <div class="h-4 w-px bg-base-300"></div>
          <h2
            bind:this={editorHeading}
            class="min-w-0 text-lg leading-tight font-semibold sm:text-[1.375rem]"
            tabindex="-1"
            data-editor-section={currentView === 'details'
              ? initialField === 'ability' || initialField === 'nature'
                ? initialField
                : 'item'
              : currentView}
          >
            {subViewTitle}
          </h2>
        </div>
        <div
          class="ms-auto flex shrink-0 items-center gap-1.5 rounded-[var(--radius-selector)] border border-base-300 px-2.5 py-1 text-xs text-base-content/70"
        >
          <SpeciesLabel
            pokemon={form.pokemon || initialMember.pokemon}
            spriteSize={20}
            textClass="max-w-[120px] truncate text-xs font-medium"
          />
        </div>
      </div>
    {/if}
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
    {#if currentView === 'overview'}
      <SetEditorOverview
        pokemon={form.pokemon || initialMember.pokemon}
        item={form.item}
        ability={form.ability}
        nature={form.nature}
        spread={form.spread}
        moves={form.moves}
        {currentSpreadTotal}
        {error}
        inGameSuggestion={inGameMember ? savedSetSuggestion : undefined}
        originalAvailable={originalChanged}
        {originalReason}
        onoriginal={() => {
          if (originalSlotMember) chooseSet(originalSlotMember, true);
        }}
        onnavigate={(view) => {
          if (view === 'text') {
            if (!flush()) return;
            rawText = setText(accepted);
            textBaseline = rawText;
          }
          currentView = view;
          if (view === 'pokemon') openSuggestions('pokemon');
        }}
      />
    {:else if currentView === 'moves'}
      <SetEditorMoves
        moves={form.moves}
        {activeMoveSlot}
        {activeSuggestions}
        moveOptions={moveSuggestions(activeMoveSlot)}
        {inGameMember}
        oningame={chooseInGame}
        {error}
        {errorField}
        onfocus={(index) => {
          activeMoveSlot = index;
          openSuggestions(`move-${index}`);
        }}
        onchange={(index, value) => {
          form.moves[index] = moveQueries[index] = value;
          activeMoveSlot = index;
          activeSuggestions = `move-${index}`;
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
        nature={form.nature}
        {activeSuggestions}
        {filteredItems}
        {filteredAbilities}
        {legacyNature}
        {inGameMember}
        oningame={chooseInGame}
        {error}
        {errorField}
        onitemchange={(val) => {
          itemQuery = form.item = val;
          activeSuggestions = 'item';
          clearError();
        }}
        onabilitychange={(val) => {
          abilityQuery = form.ability = val;
          activeSuggestions = 'ability';
          clearError();
        }}
        onnaturechange={(val) => {
          form.nature = val;
        }}
        onopensuggestions={openSuggestions}
        onclearsuggestions={() => (activeSuggestions = null)}
        onclearerror={clearError}
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
        {#if error && errorField === 'spread'}
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
        <label
          class="input flex min-h-11 items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
        >
          <PokemonSprite pokemon={form.pokemon} size={28} />
          <input
            id="set-pokemon-input"
            aria-label="Pokémon"
            class="grow bg-transparent text-sm focus:outline-none"
            placeholder="Pokémon"
            bind:value={form.pokemon}
            onfocus={() => openSuggestions('pokemon')}
            onclick={() => openSuggestions('pokemon')}
            oninput={(event) => {
              pokemonQuery = event.currentTarget.value;
              form.pokemon = event.currentTarget.value;
              activeSuggestions = 'pokemon';
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
                activeSuggestions = null;
                flush();
              }
            }}
          />
        </label>
        <p class="provenance">
          Choosing a suggested Pokémon replaces this set's fields.
        </p>
        {#if originalChanged && originalSlotMember}
          <Button
            variant="secondary"
            size="touch"
            disabled={!!originalReason}
            data-set-choice
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => {
              if (originalSlotMember) chooseSet(originalSlotMember, true);
            }}>Use original set</Button
          >
          {#if originalReason}<p class="provenance">{originalReason}</p>{/if}
        {/if}
        {#if activeSuggestions === 'pokemon'}
          <SetEditorPokemonSuggestions
            options={filteredPokemon}
            inGameSuggestion={visibleInGameMember
              ? savedSetSuggestion
              : undefined}
            onchoose={(next) => chooseSet(next, true)}
          />
        {/if}
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
    {:else if currentView === 'text'}
      <div class="grid gap-3">
        <textarea
          id="set-raw-textarea"
          aria-label="Showdown set text"
          class="textarea min-h-72 w-full resize-y p-3 font-mono text-xs leading-5"
          bind:value={rawText}
          oninput={clearError}
          onblur={flush}
          onkeydown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.isComposing
            ) {
              event.preventDefault();
              flush();
            }
          }}></textarea>
      </div>
    {/if}
  </div>
  <footer
    class="shrink-0 border-t border-base-300 bg-base-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4"
  >
    {#if error && !(currentView === 'overview' || (currentView === 'moves' && errorField === 'moves') || (currentView === 'details' && ['item', 'ability', 'nature'].includes(errorField || '')) || (currentView === 'spread' && errorField === 'spread') || (currentView === 'pokemon' && errorField === 'pokemon'))}<p
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
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        size="touch"
        onpointerdown={keepFocus}
        onclick={() => {
          activeSuggestions = null;
          if (requestClose()) onclose();
        }}>Close</Button
      >
      <Button
        variant="primary"
        size="touch"
        onpointerdown={keepFocus}
        onclick={done}>Done</Button
      >
    </div>
  </footer>
</div>
