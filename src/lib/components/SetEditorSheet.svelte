<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import X from '@lucide/svelte/icons/x';
  import EvEditor from '$lib/components/EvEditor.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import SetEditorDetails from '$lib/components/SetEditorDetails.svelte';
  import SetEditorOverview from '$lib/components/SetEditorOverview.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    championsSpreadTotal,
    parseChampionsSpread,
    parseSetBlock,
  } from '$lib/paste';
  import { getMoveType, getPokemonTypes, TYPE_COLORS } from '$lib/types';
  import { catalogSuggestions, setText } from '$lib/workbench';

  type EditorView =
    'overview' | 'pokemon' | 'details' | 'moves' | 'spread' | 'text';

  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditableSetField;
    teammates?: Member[];
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

  const NATURES =
    'Adamant Bashful Bold Brave Calm Careful Docile Gentle Hardy Hasty Impish Jolly Lax Lonely Mild Modest Naive Naughty Quiet Quirky Rash Relaxed Sassy Serious Timid'.split(
      ' '
    );
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
  let activeSuggestions = $state<string | null>(null);
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
    initialField === 'text'
      ? rawText !== initialText
      : fieldText !== initialStructuredText
  );
  const suggestions = $derived(
    catalogSuggestions(draftMember, teams, currentRegulation, teammates)
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
  const spreadSuggestions = $derived(
    suggestions.spreads
      .filter((option) => {
        const spread = parseChampionsSpread(option.value);
        return spread && championsSpreadTotal(spread) === 66;
      })
      .slice(0, 5)
  );
  const legacyNature = $derived(
    form.nature && !NATURES.includes(form.nature) ? form.nature : null
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
    if (currentView === 'text') {
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
      if (
        currentView === 'text' ||
        (initialField === 'text' && currentView === 'overview')
      ) {
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

<div bind:this={editorElement} class="flex h-full min-h-0 flex-col">
  <header
    class="shrink-0 border-b border-base-300 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 sm:pt-5"
  >
    {#if currentView === 'overview'}
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="relative shrink-0 rounded-xl border border-base-300 bg-base-200/60 p-1 shadow-2xs"
          >
            <PokemonSprite
              pokemon={form.pokemon || initialMember.pokemon}
              size={44}
            />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <!-- svelte-ignore a11y_autofocus -->
              <h2
                bind:this={editorHeading}
                class="text-base font-semibold wrap-break-word sm:text-lg"
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
                <span class="badge badge-sm font-medium badge-warning"
                  >Unsaved edits</span
                >
              {/if}
            </div>
            <p class="text-xs text-base-content/70">
              Overview — Tap any section to edit
            </p>
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
            class="truncate text-base font-semibold sm:text-lg"
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
          class="flex shrink-0 items-center gap-1.5 rounded-lg border border-base-300/60 bg-base-200/80 px-2.5 py-1 text-xs text-base-content/70"
        >
          <PokemonSprite
            pokemon={form.pokemon || initialMember.pokemon}
            size={20}
          />
          <span class="max-w-[120px] truncate font-medium"
            >{form.pokemon || initialMember.pokemon}</span
          >
        </div>
      </div>
    {/if}
  </header>

  <div
    bind:this={contentElement}
    class="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 pr-7 pl-5 sm:pr-8.5 sm:pl-6"
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
          if (view === 'text') rawText = fieldText;
          currentView = view;
          if (view === 'pokemon') openSuggestions('pokemon');
          clearError();
        }}
      />
    {:else if currentView === 'moves'}
      <!-- COMPACT MOVES SUB-VIEW -->
      <section aria-label="Moves" class="grid gap-4">
        <div class="grid gap-2">
          {#each MOVE_SLOTS as index (index)}
            {@const move = form.moves[index]}
            {@const type = getMoveType(move)}
            {@const typeColor = type ? TYPE_COLORS[type] : null}
            {@const isActive = activeMoveSlot === index}
            <label
              class="input flex min-h-11 items-center gap-2 rounded-xl border transition-all {isActive
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-base-300 hover:border-base-content/30'}"
              style={typeColor ? `border-left: 4px solid ${typeColor};` : ''}
            >
              <span
                class="w-4 text-center text-xs font-semibold text-base-content/60"
                >{index + 1}</span
              >
              {#if type}
                <TypeBadge {type} size="md" />
              {:else}
                <div class="size-4 shrink-0 rounded-full bg-base-300"></div>
              {/if}
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
            class="grid max-h-60 gap-1 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-sm"
          >
            <div
              class="px-3 py-1.5 text-xs font-semibold tracking-wider text-base-content/60 uppercase"
            >
              Suggestions for Move {activeMoveSlot + 1}
            </div>
            {#each activeOptions as option (option.value)}
              {@const optionType = getMoveType(option.value)}
              {@const optionColor = optionType ? TYPE_COLORS[optionType] : null}
              <button
                type="button"
                class="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                style={optionColor
                  ? `border-left: 3px solid ${optionColor};`
                  : ''}
                onclick={() => chooseMove(activeMoveSlot, option.value)}
              >
                {#if optionType}
                  <TypeBadge type={optionType} size="md" />
                {:else}
                  <div class="size-4 shrink-0 rounded-full bg-base-300"></div>
                {/if}
                <span class="font-medium">{option.value}</span>
              </button>
            {:else}
              <p class="p-3 text-sm text-base-content/70">
                No matching move suggestions.
              </p>
            {/each}
          </section>
        {/if}

        {#if error && errorField === 'moves'}
          <p role="alert" class="text-sm font-medium text-error">
            {error}
          </p>
        {/if}
      </section>
    {:else if currentView === 'details'}
      <!-- DETAILS SUB-VIEW -->
      <SetEditorDetails
        bind:item={form.item}
        bind:ability={form.ability}
        bind:nature={form.nature}
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
        <EvEditor
          spread={form.spread}
          suggestions={spreadSuggestions}
          onspreadchange={(spread, nature) => {
            form.spread = spread;
            if (nature) form.nature = nature;
            clearError();
          }}
        />

        {#if error && errorField === 'spread'}
          <p role="alert" class="text-sm font-medium text-error">
            {error}
          </p>
        {/if}
      </section>
    {:else if currentView === 'pokemon'}
      <!-- POKEMON SUB-VIEW -->
      <section class="grid gap-4">
        <label for="set-pokemon-input" class="sr-only">Pokémon</label>
        <label
          class="input flex min-h-11 items-center gap-2 rounded-xl border border-base-300"
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
          />
        </label>
        <p class="text-xs text-base-content/70">
          Choosing a suggested Pokémon replaces this set's fields.
        </p>

        {#if activeSuggestions === 'pokemon'}
          <section
            aria-label="Pokémon suggestions"
            class="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-sm"
          >
            {#each filteredPokemon as option (option.pokemon)}
              <button
                type="button"
                aria-label={`Use ${option.pokemon} set`}
                class="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                onclick={() => {
                  applyPreFilled(option.member);
                  currentView = 'overview';
                }}
              >
                <PokemonSprite pokemon={option.pokemon} size={32} />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center justify-between gap-2">
                    <span class="truncate font-semibold">{option.pokemon}</span>
                    <span class="shrink-0 text-xs opacity-70"
                      >{option.sharedTeammates} shared</span
                    >
                  </span>
                  <span class="block truncate text-xs text-base-content/70">
                    {[
                      option.member.item,
                      option.member.ability,
                      option.member.nature,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            {:else}
              <p class="p-3 text-sm text-base-content/70">
                No matching suggestions.
              </p>
            {/each}
          </section>
        {/if}

        {#if error && errorField === 'pokemon'}
          <p role="alert" class="text-sm font-medium text-error">
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
          class="textarea min-h-72 w-full resize-y rounded-xl border border-base-300 p-3 font-mono text-xs leading-5"
          bind:value={rawText}
          oninput={clearError}></textarea>
        {#if error && errorField === 'text'}
          <p role="alert" class="text-sm font-medium text-error">
            {error}
          </p>
        {/if}
      </section>
    {/if}
  </div>

  <footer
    class="shrink-0 border-t border-base-300 bg-base-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4"
  >
    <p class="mb-3 text-xs text-base-content/70">
      Changes are staged. Save changes on the team to keep them.
    </p>
    <div class="flex justify-end gap-2">
      <Button variant="outline" class="h-11 min-h-11 px-4" onclick={oncancel}>
        Cancel
      </Button>
      <Button class="h-11 min-h-11 px-4" onclick={apply}>Apply to team</Button>
    </div>
  </footer>
</div>
