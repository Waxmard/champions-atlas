<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import EvWorkbench from '$lib/components/EvWorkbench.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import SetEditorDetails from '$lib/components/SetEditorDetails.svelte';
  import SetEditorMoves from '$lib/components/SetEditorMoves.svelte';
  import SetEditorOverview from '$lib/components/SetEditorOverview.svelte';
  import SpeciesLabel from '$lib/components/SpeciesLabel.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    championsSpreadTotal,
    NATURES,
    parseChampionsSpread,
    parseSetBlock,
    updateSetText,
  } from '$lib/paste';
  import { canonicalSnapshot } from '$lib/team-history';
  import { getPokemonTypes, TYPE_COLORS } from '$lib/types';
  import type { TeamTagsIndex } from '$lib/tags';
  import {
    catalogSuggestions,
    originalMemberFor,
    isMegaSpecies,
    MAX_TEAM_MEGAS,
    setText,
    type OwnTeamSet,
  } from '$lib/workbench';
  type EditorView =
    'overview' | 'pokemon' | 'details' | 'moves' | 'spread' | 'text';
  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditableSetField;
    teammates?: Member[];
    tagIndex?: TeamTagsIndex;
    ownTeams?: OwnTeamSet[];
    excludeOwnTeamId?: string | null;
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
    ownTeams = [],
    excludeOwnTeamId = null,
    originalMembers = [],
    originalSlotMember,
    onchange,
    onclose,
    onpendingchange,
  }: Props = $props();
  function getInitialView(field: EditableSetField): EditorView {
    if (field === 'set') return 'overview';
    return field === 'item' || field === 'ability' || field === 'nature'
      ? 'details'
      : field;
  }
  const MOVE_SLOTS = [0, 1, 2, 3];
  const initialMember = (() => member)();
  const initialView = (() => getInitialView(initialField))();
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
  let pokemonQuery = $state('');
  let itemQuery = $state('');
  let abilityQuery = $state('');
  let moveQueries = $state(['', '', '', '']);
  let error = $state('');
  let errorField = $state<EditableSetField | null>(null);
  let editorElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();
  let editorHeading = $state<HTMLElement>();
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
  const suggestions = $derived(
    catalogSuggestions(
      draftMember,
      teams,
      currentRegulation,
      teammates,
      tagIndex,
      pokemonQuery,
      accepted.pokemon,
      originalMember
    )
  );
  const norm = (value: string, query: string) =>
    normalize(value).includes(normalize(query));
  const filteredPokemon = $derived(
    suggestions.pokemon
      .filter((option) => norm(option.pokemon, pokemonQuery))
      .slice(0, 5)
  );
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
  const parsedCurrentSpread = $derived(parseChampionsSpread(form.spread));
  const currentSpreadTotal = $derived(
    parsedCurrentSpread ? championsSpreadTotal(parsedCurrentSpread) : 0
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
    if (
      teammates.some(
        (teammate) => normalize(teammate.pokemon) === normalize(next.pokemon)
      )
    )
      return 'This Pokémon is already on the team.';
    if (
      normalize(next.pokemon) !== normalize(accepted.pokemon) &&
      isMegaSpecies(next.pokemon) &&
      teammates.filter((teammate) => isMegaSpecies(teammate.pokemon)).length >=
        MAX_TEAM_MEGAS
    )
      return 'A team can include at most two Mega Pokémon.';
    return '';
  }
  function chooseSet(next: Member, trusted = false) {
    const candidate = structuredClone($state.snapshot(next));
    const reason = rosterError(candidate);
    if (reason) {
      showError('pokemon', reason);
      return;
    }
    if (!trusted && !validateMember(candidate, 'structured')) return;
    replacement = candidate;
    applyPreFilled(candidate);
    accept(candidate);
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
    return suggestions.moves
      .filter(
        (option) =>
          norm(option.value, moveQueries[index]) &&
          !form.moves.some(
            (move, otherIndex) =>
              otherIndex !== index &&
              move &&
              normalize(move) === normalize(option.value)
          )
      )
      .slice(0, 5);
  }
  const exactNature = (value: string) =>
    NATURES.find(
      (nature) => nature.toLowerCase() === value.trim().toLowerCase()
    );
  function validateSpread(spread: string | null, field: EditableSetField) {
    const value = spread?.trim() || '';
    if (value === (accepted.spread || '') || (!value && field === 'text'))
      return true;
    const parsed = parseChampionsSpread(value);
    if (!parsed) {
      showError(field, 'Enter a valid EV spread totaling 66 points.');
      return false;
    }
    const total = championsSpreadTotal(parsed);
    if (total !== 66) {
      showError(
        field,
        'Changed EV spreads must total 66 points (currently ' + total + ').'
      );
      return false;
    }
    return true;
  }
  function validateMember(next: Member, mode: 'structured' | 'text') {
    const reason = rosterError(next);
    if (reason) {
      showError(mode === 'text' ? 'text' : 'pokemon', reason);
      return false;
    }
    if (!next.pokemon.trim()) {
      showError(mode === 'text' ? 'text' : 'pokemon', 'Enter a Pokémon.');
      return false;
    }
    const nature = next.nature?.trim() || '';
    if (nature && nature !== (accepted.nature || '')) {
      const standardNature = exactNature(nature);
      if (!standardNature) {
        showError(
          mode === 'text' ? 'text' : 'nature',
          'Choose a standard nature.'
        );
        return false;
      }
      next.nature = standardNature;
    }
    return validateSpread(next.spread, mode === 'text' ? 'text' : 'spread');
  }
  export function flush(): boolean {
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
              ? '[data-ev-stat]'
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
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="h-11 min-h-11 gap-1 px-2.5 font-medium"
            onclick={backToOverview}
            aria-label="Back to overview"
          >
            <ArrowLeft class="size-4" />
            <span>Overview</span>
          </Button>
          <div class="h-4 w-px bg-base-300"></div>
          <h2
            bind:this={editorHeading}
            class="truncate text-[1.375rem] leading-tight font-semibold"
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
          class="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-selector)] border border-base-300 px-2.5 py-1 text-xs text-base-content/70"
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
        {error}
        {errorField}
        onfocus={(index) => {
          activeMoveSlot = index;
          openSuggestions(`move-${index}`);
        }}
        onchange={(index, value) => {
          form.moves[index] = value;
          moveQueries[index] = value;
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
        {error}
        {errorField}
        onitemchange={(val) => {
          itemQuery = val;
          form.item = val;
          activeSuggestions = 'item';
          clearError();
        }}
        onabilitychange={(val) => {
          abilityQuery = val;
          form.ability = val;
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
        <EvWorkbench
          member={draftMember}
          {teams}
          {currentRegulation}
          {ownTeams}
          {excludeOwnTeamId}
          {originalMember}
          natureSuggestions={suggestions.natures}
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
        <label class="atlas-field flex min-h-11 items-center gap-2">
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
            variant="outline"
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
          <section
            aria-label="Pokémon suggestions"
            class="plate max-h-72 overflow-y-auto"
          >
            <ul role="list" class="divide-y">
              {#each filteredPokemon as option (option.pokemon)}
                <li>
                  <button
                    type="button"
                    aria-label={`Use ${option.pokemon} set`}
                    class="flex min-h-11 items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary"
                    data-set-choice
                    onpointerdown={(event) => event.preventDefault()}
                    onclick={() => chooseSet(option.member, true)}
                  >
                    <PokemonSprite pokemon={option.pokemon} size={32} />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-baseline justify-between gap-2">
                        <span class="truncate font-semibold"
                          >{option.pokemon}</span
                        >
                        <span class="term shrink-0"
                          >{option.sharedTeammates} shared</span
                        >
                      </span>
                      <span
                        class="mt-0.5 flex flex-wrap items-baseline gap-x-3"
                      >
                        {#each [option.member.item, option.member.ability, option.member.nature].filter(Boolean) as field, fieldIndex (fieldIndex)}
                          <span class="term truncate">{field}</span>
                        {/each}
                      </span>
                    </span>
                  </button>
                </li>
              {:else}
                <li class="provenance p-3">No matching suggestions.</li>
              {/each}
            </ul>
          </section>
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
      <section aria-label="Showdown set text" class="grid gap-3">
        <textarea
          id="set-raw-textarea"
          aria-label="Showdown set text"
          class="atlas-textarea min-h-72 w-full resize-y p-3 font-mono text-xs leading-5"
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
      </section>
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
        variant="outline"
        class="h-11 min-h-11 px-4"
        onpointerdown={keepFocus}
        onclick={() => {
          activeSuggestions = null;
          if (requestClose()) onclose();
        }}>Close</Button
      >
      <Button
        class="h-11 min-h-11 px-4"
        onpointerdown={keepFocus}
        onclick={done}>Done</Button
      >
    </div>
  </footer>
</div>
