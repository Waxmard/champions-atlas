<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import X from '@lucide/svelte/icons/x';
  import EvWorkbench from '$lib/components/EvWorkbench.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import SetEditorDetails from '$lib/components/SetEditorDetails.svelte';
  import SetEditorOverview from '$lib/components/SetEditorOverview.svelte';
  import SpeciesLabel from '$lib/components/SpeciesLabel.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import TypeMark from '$lib/components/TypeMark.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    championsSpreadTotal,
    NATURES,
    parseChampionsSpread,
    parseSetBlock,
  } from '$lib/paste';
  import { getMoveType, getPokemonTypes, TYPE_COLORS } from '$lib/types';
  import type { TeamTagsIndex } from '$lib/tags';
  import { catalogSuggestions, setText } from '$lib/workbench';

  type EditorView =
    'overview' | 'pokemon' | 'details' | 'moves' | 'spread' | 'text';

  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditableSetField;
    teammates?: Member[];
    tagIndex?: TeamTagsIndex;
    onapply: (member: Member) => void;
    oncancel: () => void;
    ondirtychange: (dirty: boolean) => void;
  }

  let {
    member,
    teams,
    currentRegulation,
    initialField,
    teammates = [],
    tagIndex,
    onapply,
    oncancel,
    ondirtychange,
  }: Props = $props();

  function getInitialView(field: EditableSetField): EditorView {
    if (field === 'set') return 'overview';
    if (field === 'item' || field === 'ability' || field === 'nature') {
      return 'details';
    }
    return field;
  }

  const MOVE_SLOTS = [0, 1, 2, 3];
  const initialMember = (() => member)();
  const initialText = setText(initialMember);
  const initialStructuredText = setText({ ...initialMember, set: undefined });
  const initialNature = initialMember.nature || '';
  const initialSpread = initialMember.spread || '';

  const initialView = (() => getInitialView(initialField))();
  let currentView = $state<EditorView>(initialView);
  let activeMoveSlot = $state(0);

  let form = $state({
    pokemon: initialMember.pokemon,
    item: initialMember.item || '',
    ability: initialMember.ability || '',
    nature: initialMember.nature || '',
    spread: initialMember.spread || '',
    moves: MOVE_SLOTS.map((index) => initialMember.moves[index] || ''),
  });
  let rawText = $state(initialText);
  let textBaseline = $state(initialText);
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
    pokemon: form.pokemon.trim(),
    item: form.item.trim() || null,
    ability: form.ability.trim() || null,
    nature: form.nature.trim() || null,
    spread: form.spread.trim() || null,
    moves: form.moves.map((move) => move.trim()).filter(Boolean),
  });
  const fieldText = $derived(setText(draftMember));
  const dirty = $derived(
    (currentView === 'text' && rawText !== textBaseline) ||
      fieldText !== initialStructuredText
  );
  const suggestions = $derived(
    catalogSuggestions(
      draftMember,
      teams,
      currentRegulation,
      teammates,
      tagIndex,
      pokemonQuery,
      initialMember.pokemon
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
  const subViewTitle = $derived.by(() => {
    switch (currentView) {
      case 'pokemon':
        return 'Pokémon';
      case 'details':
        return 'Item, ability, and nature';
      case 'moves':
        return 'Moves';
      case 'spread':
        return 'EV spread';
      case 'text':
        return 'Showdown set text';
      default:
        return 'Overview';
    }
  });

  $effect(() => ondirtychange(dirty));

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
    clearError();
    if (field === 'pokemon') pokemonQuery = '';
    else if (field === 'item') itemQuery = '';
    else if (field === 'ability') abilityQuery = '';
    else if (field.startsWith('move-')) {
      const index = Number(field.slice(5));
      moveQueries[index] = '';
    }
  }

  function applyPreFilled(next: Member) {
    form = {
      pokemon: next.pokemon,
      item: next.item || '',
      ability: next.ability || '',
      nature: next.nature || '',
      spread: next.spread || '',
      moves: MOVE_SLOTS.map((index) => next.moves[index] || ''),
    };
    activeSuggestions = null;
    clearError();
  }

  function chooseMove(index: number, value: string) {
    form.moves[index] = value;
    activeSuggestions = null;
    clearError();
  }

  function clearMove(index: number) {
    form.moves[index] = '';
    if (activeSuggestions === `move-${index}`) activeSuggestions = null;
    clearError();
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

  function onMoveKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    activeSuggestions = null;
  }

  const exactNature = (value: string) =>
    NATURES.find(
      (nature) => nature.toLowerCase() === value.trim().toLowerCase()
    );

  function validateSpread(spread: string | null, field: EditableSetField) {
    const value = spread?.trim() || '';
    if (value === initialSpread || !value) return true;
    const parsed = parseChampionsSpread(value);
    if (!parsed) {
      showError(field, 'Enter a valid EV spread totaling 66 points.');
      return false;
    }
    const total = championsSpreadTotal(parsed);
    if (total !== 66) {
      showError(
        field,
        `Changed EV spreads must total 66 points (currently ${total}).`
      );
      return false;
    }
    return true;
  }

  function validateMember(next: Member, mode: 'structured' | 'text') {
    const field = mode === 'text' ? 'text' : 'pokemon';
    if (
      teammates.some(
        (teammate) => normalize(teammate.pokemon) === normalize(next.pokemon)
      )
    ) {
      showError(field, 'This Pokémon is already on the team.');
      return false;
    }

    const nature = next.nature?.trim() || '';
    if (nature && nature !== initialNature) {
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

  function backToOverview() {
    if (currentView === 'text' && rawText !== textBaseline) {
      try {
        const parsed = parseSetBlock(rawText);
        applyPreFilled(parsed);
      } catch (err) {
        showError(
          'text',
          err instanceof Error ? err.message : 'Invalid set format.'
        );
        return;
      }
    }
    currentView = 'overview';
    activeSuggestions = null;
    clearError();
  }

  function apply() {
    clearError();
    if (!dirty) {
      onapply(initialMember);
      return;
    }

    try {
      if (currentView === 'text') {
        const parsed = parseSetBlock(rawText);
        if (!validateMember(parsed, 'text')) return;
        onapply(parsed);
        return;
      }

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
        return;
      }

      const parsed = parseSetBlock(fieldText);
      if (!validateMember(parsed, 'structured')) return;
      onapply(parsed);
    } catch (caught) {
      showError(
        currentView === 'text' ? 'text' : 'set',
        caught instanceof Error ? caught.message : 'Invalid set format.'
      );
    }
  }

  export function requestCancel() {
    if (activeSuggestions) {
      activeSuggestions = null;
      return false;
    }
    return !dirty || confirm('Discard set changes?');
  }

  export function focusInitialSection() {
    requestAnimationFrame(() => {
      const field = initialField === 'set' ? 'set' : initialField;
      const target = editorElement?.querySelector<HTMLElement>(
        `[data-editor-section="${field}"]`
      );
      if (target && contentElement && target !== editorHeading) {
        contentElement.scrollTop = Math.max(
          0,
          target.offsetTop - contentElement.offsetTop - 8
        );
      }
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
              <!-- svelte-ignore a11y_autofocus -->
              <h2
                bind:this={editorHeading}
                class="text-[1.375rem] leading-tight font-extrabold wrap-break-word"
                tabindex="-1"
                autofocus
                data-editor-section="set"
              >
                Edit {initialMember.pokemon} set
              </h2>
              <div class="flex items-center gap-1">
                {#each getPokemonTypes(form.pokemon || initialMember.pokemon) as type (type)}
                  <TypeBadge {type} size="md" />
                {/each}
              </div>
              {#if dirty}
                <span
                  class="rounded-[var(--radius-selector)] border border-base-300 bg-base-100 px-2.5 py-0.5 text-[0.8125rem] leading-tight font-bold"
                  >Unsaved edits</span
                >
              {/if}
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
        onnavigate={(view) => {
          if (view === 'text') {
            rawText = fieldText;
            textBaseline = fieldText;
          }
          currentView = view;
          if (view === 'pokemon') openSuggestions('pokemon');
          clearError();
        }}
      />
    {:else if currentView === 'moves'}
      <!-- COMPACT MOVES SUB-VIEW -->
      <section aria-label="Moves" class="grid gap-4">
        <div class="grid gap-2 sm:grid-cols-2">
          {#each MOVE_SLOTS as index (index)}
            {@const move = form.moves[index]}
            {@const type = getMoveType(move)}
            {@const typeColor = type ? TYPE_COLORS[type] : null}
            {@const isActive = activeMoveSlot === index}
            <label
              class="input flex min-h-11 items-center gap-2 border transition-colors {isActive
                ? 'border-primary'
                : 'border-base-content/55 hover:border-base-content/80'}"
              style={typeColor ? `border-left: 4px solid ${typeColor};` : ''}
            >
              <span class="value w-4 text-center text-base-content/60"
                >{index + 1}</span
              >
              <TypeMark {type} size="md" />
              <input
                id={`set-move-${index + 1}`}
                aria-label={`Move ${index + 1}`}
                type="text"
                tabindex={activeSuggestions !== null && activeMoveSlot !== index
                  ? -1
                  : 0}
                class="grow bg-transparent text-sm focus:outline-none"
                placeholder={`Move ${index + 1}`}
                bind:value={form.moves[index]}
                onfocus={() => {
                  activeMoveSlot = index;
                  openSuggestions(`move-${index}`);
                }}
                onclick={() => {
                  activeMoveSlot = index;
                  openSuggestions(`move-${index}`);
                }}
                oninput={(event) => {
                  activeMoveSlot = index;
                  moveQueries[index] = event.currentTarget.value;
                  form.moves[index] = event.currentTarget.value;
                  activeSuggestions = `move-${index}`;
                  clearError();
                }}
                onkeydown={onMoveKeydown}
              />
              <button
                type="button"
                class="btn -mr-2 size-11 min-h-11 min-w-11 btn-ghost p-0 btn-xs"
                aria-label={`Clear move ${index + 1}`}
                tabindex={activeSuggestions !== null ? -1 : 0}
                disabled={!move}
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearMove(index);
                }}
              >
                <X class="size-4" />
              </button>
            </label>
          {/each}
        </div>

        {#if activeSuggestions === `move-${activeMoveSlot}`}
          {@const activeOptions = moveSuggestions(activeMoveSlot)}
          <section
            aria-label="Move suggestions"
            class="plate max-h-60 divide-y overflow-y-auto"
          >
            <div class="term px-3 py-1.5">
              Move {activeMoveSlot + 1} suggestions
            </div>
            <ul role="list" class="divide-y">
              {#each activeOptions as option (option.value)}
                {@const optionType = getMoveType(option.value)}
                {@const optionColor = optionType
                  ? TYPE_COLORS[optionType]
                  : null}
                <li>
                  <button
                    type="button"
                    class="flex min-h-11 items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary"
                    style={optionColor
                      ? `border-left: 3px solid ${optionColor};`
                      : ''}
                    onclick={() => chooseMove(activeMoveSlot, option.value)}
                  >
                    <TypeMark type={optionType} size="md" />
                    <span class="value">{option.value}</span>
                  </button>
                </li>
              {:else}
                <li class="provenance p-3">No matching move suggestions.</li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if error && errorField === 'moves'}
          <p
            role="alert"
            class="text-[0.9375rem] leading-relaxed"
            style="color: var(--color-error-content)"
          >
            {error}
          </p>
        {/if}
      </section>
    {:else if currentView === 'details'}
      <!-- DETAILS SUB-VIEW -->
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
      />
    {:else if currentView === 'spread'}
      <!-- SPREAD SUB-VIEW -->
      <section aria-label="EV spread" class="grid gap-4">
        <EvWorkbench
          member={draftMember}
          {teams}
          {currentRegulation}
          natureSuggestions={suggestions.natures}
          onspreadchange={(spread, nature) => {
            form.spread = spread;
            if (nature) form.nature = nature;
            clearError();
          }}
          onnaturechange={(value) => (form.nature = value)}
        />
        {#if error && errorField === 'spread'}
          <p
            role="alert"
            class="text-[0.9375rem] leading-relaxed"
            style="color: var(--color-error-content)"
          >
            {error}
          </p>
        {/if}
      </section>
    {:else if currentView === 'pokemon'}
      <!-- POKEMON SUB-VIEW -->
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
            onfocus={() => openSuggestions('pokemon')}
            onclick={() => openSuggestions('pokemon')}
            oninput={(event) => {
              pokemonQuery = event.currentTarget.value;
              form.pokemon = event.currentTarget.value;
              activeSuggestions = 'pokemon';
              clearError();
            }}
          />
        </label>
        <p class="provenance">
          Choosing a suggested Pokémon replaces this set's fields.
        </p>

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
                    onclick={() => onapply(structuredClone(option.member))}
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
            class="text-[0.9375rem] leading-relaxed"
            style="color: var(--color-error-content)"
          >
            {error}
          </p>
        {/if}
      </section>
    {:else if currentView === 'text'}
      <!-- TEXT SUB-VIEW -->
      <section aria-label="Showdown set text" class="grid gap-3">
        <textarea
          id="set-raw-textarea"
          aria-label="Showdown set text"
          class="textarea min-h-72 w-full resize-y p-3 font-mono text-xs leading-5"
          bind:value={rawText}
          oninput={clearError}></textarea>
        {#if error && errorField === 'text'}
          <p
            role="alert"
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
    <p class="provenance mb-3">
      Changes will be staged on this Pokémon's card. Apply them on the team
      sheet to save.
    </p>
    <div class="flex justify-end gap-2">
      <Button
        variant="outline"
        class="h-11 min-h-11 px-4"
        onclick={() => {
          if (requestCancel()) oncancel();
        }}
      >
        Cancel
      </Button>
      <Button class="h-11 min-h-11 px-4" onclick={apply}>Done</Button>
    </div>
  </footer>
</div>
