<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import EvEditor from '$lib/components/EvEditor.svelte';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    championsSpreadTotal,
    parseChampionsSpread,
    parseSetBlock,
  } from '$lib/paste';
  import { getMoveType, getTypeIcon, TYPE_COLORS } from '$lib/types';
  import { catalogSuggestions, setText } from '$lib/workbench';

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
  let evDetails = $state<HTMLDetailsElement>();

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

  $effect(() => ondirtychange(dirty));

  function clearError() {
    error = '';
    errorField = null;
  }

  function showError(field: EditableSetField, message: string) {
    errorField = field;
    error = message;
    if (field === 'spread' && evDetails) evDetails.open = true;
  }

  function openSuggestions(field: string) {
    activeSuggestions = field;
    clearError();
    if (field === 'pokemon') pokemonQuery = '';
    if (field === 'item') itemQuery = '';
    if (field === 'ability') abilityQuery = '';
    if (field.startsWith('move-')) {
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

  function chooseItem(value: string) {
    form.item = value;
    activeSuggestions = null;
    clearError();
  }

  function chooseAbility(value: string) {
    form.ability = value;
    activeSuggestions = null;
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

  function apply() {
    clearError();
    if (!dirty) {
      onapply(initialMember);
      return;
    }

    try {
      if (initialField === 'text') {
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
        initialField === 'text' ? 'text' : 'set',
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
      if (initialField === 'spread' && evDetails) evDetails.open = true;
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
    class="shrink-0 border-b px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 sm:pt-5"
  >
    <div class="flex items-center gap-2.5">
      <PokemonSprite pokemon={form.pokemon} size={36} />
      <div class="min-w-0">
        <!-- svelte-ignore a11y_autofocus -->
        <h2
          bind:this={editorHeading}
          class="font-semibold wrap-break-word"
          tabindex="-1"
          autofocus
          data-editor-section="set"
        >
          Edit {initialMember.pokemon} set
        </h2>
        <p class="text-xs text-base-content/70">
          {initialField === 'text'
            ? 'Advanced Showdown text editing'
            : 'Edit the complete structured set'}
        </p>
      </div>
    </div>
  </header>

  <div
    bind:this={contentElement}
    class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6"
  >
    {#if initialField === 'text'}
      <section aria-labelledby="set-text-heading">
        <h3
          id="set-text-heading"
          class="text-sm font-semibold"
          tabindex="-1"
          data-editor-section="text"
        >
          Showdown set text
        </h3>
        <textarea
          id="set-raw-textarea"
          aria-labelledby="set-text-heading"
          class="textarea mt-2 min-h-72 w-full resize-y p-3 font-mono text-xs leading-5"
          bind:value={rawText}
          oninput={clearError}></textarea>
        {#if error && errorField === 'text'}
          <p role="alert" class="mt-2 text-sm font-medium text-error">
            {error}
          </p>
        {/if}
      </section>
    {:else}
      <div class="grid gap-6">
        <section aria-labelledby="pokemon-heading">
          <h3
            id="pokemon-heading"
            class="text-sm font-semibold"
            tabindex="-1"
            data-editor-section="pokemon"
          >
            Pokémon
          </h3>
          <label for="set-pokemon-input" class="sr-only">Pokémon</label>
          <input
            id="set-pokemon-input"
            class="input mt-2 min-h-11 w-full text-sm"
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
          <p class="mt-2 text-xs text-base-content/70">
            Choosing a suggested Pokémon replaces this set's fields.
          </p>
          {#if activeSuggestions === 'pokemon'}
            <section
              aria-label="Pokémon suggestions"
              class="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-xl border bg-base-100 p-1 shadow-sm"
            >
              {#each filteredPokemon as option (option.pokemon)}
                <button
                  type="button"
                  aria-label={`Use ${option.pokemon} set`}
                  class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                  onclick={() => applyPreFilled(option.member)}
                >
                  <PokemonSprite pokemon={option.pokemon} size={32} />
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center justify-between gap-2">
                      <span class="truncate font-semibold"
                        >{option.pokemon}</span
                      >
                      <span class="shrink-0 text-xs opacity-70"
                        >{option.sharedTeammates} shared</span
                      >
                    </span>
                    <span class="block truncate text-xs text-base-content/70"
                      >{[
                        option.member.item,
                        option.member.ability,
                        option.member.nature,
                      ]
                        .filter(Boolean)
                        .join(' · ')}</span
                    >
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
            <p role="alert" class="mt-2 text-sm font-medium text-error">
              {error}
            </p>
          {/if}
        </section>

        <section aria-labelledby="details-heading">
          <h3
            id="details-heading"
            class="text-sm font-semibold"
            tabindex="-1"
            data-editor-section={initialField === 'item' ||
            initialField === 'ability' ||
            initialField === 'nature'
              ? initialField
              : undefined}
          >
            Item, ability, and nature
          </h3>
          <div class="mt-2 grid gap-4 sm:grid-cols-3">
            <div class="min-w-0">
              <label for="set-item-input" class="text-sm font-medium"
                >Item</label
              >
              <div class="relative mt-2">
                {#if form.item}
                  <span class="pointer-events-none absolute top-3 left-3">
                    <ItemIcon item={form.item} />
                  </span>
                {/if}
                <input
                  id="set-item-input"
                  placeholder="Custom item"
                  class="input min-h-11 w-full pr-3 text-sm {form.item
                    ? 'pl-10'
                    : 'pl-3'}"
                  bind:value={form.item}
                  onfocus={() => openSuggestions('item')}
                  onclick={() => openSuggestions('item')}
                  oninput={(event) => {
                    itemQuery = event.currentTarget.value;
                    form.item = event.currentTarget.value;
                    activeSuggestions = 'item';
                    clearError();
                  }}
                />
              </div>
              {#if activeSuggestions === 'item'}
                <section
                  aria-label="Item suggestions"
                  class="mt-2 grid max-h-60 gap-1 overflow-y-auto rounded-xl border bg-base-100 p-1 shadow-sm"
                >
                  {#each filteredItems as option (option.value)}
                    <button
                      type="button"
                      class="min-h-11 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                      onclick={() => chooseItem(option.value)}
                      >{option.value}</button
                    >
                  {:else}
                    <p class="p-3 text-sm text-base-content/70">
                      No matching suggestions.
                    </p>
                  {/each}
                </section>
              {/if}
            </div>

            <div class="min-w-0">
              <label for="set-ability-input" class="text-sm font-medium"
                >Ability</label
              >
              <input
                id="set-ability-input"
                placeholder="Custom ability"
                class="input mt-2 min-h-11 w-full text-sm"
                bind:value={form.ability}
                onfocus={() => openSuggestions('ability')}
                onclick={() => openSuggestions('ability')}
                oninput={(event) => {
                  abilityQuery = event.currentTarget.value;
                  form.ability = event.currentTarget.value;
                  activeSuggestions = 'ability';
                  clearError();
                }}
              />
              {#if activeSuggestions === 'ability'}
                <section
                  aria-label="Ability suggestions"
                  class="mt-2 grid max-h-60 gap-1 overflow-y-auto rounded-xl border bg-base-100 p-1 shadow-sm"
                >
                  {#each filteredAbilities as option (option.value)}
                    <button
                      type="button"
                      class="min-h-11 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                      onclick={() => chooseAbility(option.value)}
                      >{option.value}</button
                    >
                  {:else}
                    <p class="p-3 text-sm text-base-content/70">
                      No matching suggestions.
                    </p>
                  {/each}
                </section>
              {/if}
            </div>

            <div class="min-w-0">
              <label for="set-nature-input" class="text-sm font-medium"
                >Nature</label
              >
              <select
                id="set-nature-input"
                class="select mt-2 min-h-11 w-full text-sm"
                bind:value={form.nature}
                onfocus={() => (activeSuggestions = null)}
                onchange={clearError}
              >
                <option value="">Unknown</option>
                {#if legacyNature}
                  <option value={legacyNature}>{legacyNature}</option>
                {/if}
                {#each NATURES as nature (nature)}
                  <option value={nature}>{nature}</option>
                {/each}
              </select>
            </div>
          </div>
          {#if error && (errorField === 'item' || errorField === 'ability' || errorField === 'nature')}
            <p role="alert" class="mt-2 text-sm font-medium text-error">
              {error}
            </p>
          {/if}
        </section>

        <section aria-labelledby="moves-heading">
          <h3
            id="moves-heading"
            class="text-sm font-semibold"
            tabindex="-1"
            data-editor-section="moves"
          >
            Moves
          </h3>
          <div class="mt-2 grid gap-3">
            {#each MOVE_SLOTS as index (index)}
              {@const move = form.moves[index]}
              {@const type = getMoveType(move)}
              {@const typeColor = type ? TYPE_COLORS[type] : null}
              <div
                class="rounded-xl border bg-base-100 p-3"
                style={typeColor ? `border-left: 3px solid ${typeColor};` : ''}
              >
                <div class="flex items-end gap-2">
                  <label
                    class="min-w-0 flex-1 text-sm font-medium"
                    for={`set-move-${index + 1}`}
                  >
                    Move {index + 1}
                    <span class="relative mt-2 block">
                      {#if type}
                        <img
                          src={getTypeIcon(type)}
                          alt=""
                          aria-hidden="true"
                          class="pointer-events-none absolute top-3 left-3 size-4 object-contain"
                        />
                      {/if}
                      <input
                        id={`set-move-${index + 1}`}
                        class="input min-h-11 w-full text-sm {type
                          ? 'pl-10'
                          : ''}"
                        bind:value={form.moves[index]}
                        onfocus={() => openSuggestions(`move-${index}`)}
                        onclick={() => openSuggestions(`move-${index}`)}
                        oninput={(event) => {
                          moveQueries[index] = event.currentTarget.value;
                          form.moves[index] = event.currentTarget.value;
                          activeSuggestions = `move-${index}`;
                          clearError();
                        }}
                        onkeydown={onMoveKeydown}
                      />
                    </span>
                  </label>
                  <Button
                    variant="ghost"
                    class="min-h-11 min-w-11 p-2"
                    aria-label={`Clear move ${index + 1}`}
                    tabindex={activeSuggestions === `move-${index}` ? -1 : 0}
                    disabled={!move}
                    onclick={() => clearMove(index)}><X /></Button
                  >
                </div>
                {#if activeSuggestions === `move-${index}`}
                  <section
                    aria-label="Move suggestions"
                    class="mt-2 grid max-h-60 gap-1 overflow-y-auto rounded-xl border bg-base-100 p-1 shadow-sm"
                  >
                    {#each moveSuggestions(index) as option (option.value)}
                      {@const optionType = getMoveType(option.value)}
                      {@const optionColor = optionType
                        ? TYPE_COLORS[optionType]
                        : null}
                      <button
                        type="button"
                        class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                        style={optionColor
                          ? `border-left: 3px solid ${optionColor};`
                          : ''}
                        onclick={() => chooseMove(index, option.value)}
                      >
                        {#if optionType}
                          <img
                            src={getTypeIcon(optionType)}
                            alt=""
                            aria-hidden="true"
                            class="size-3.5 shrink-0 object-contain"
                          />
                        {/if}
                        <span>{option.value}</span>
                      </button>
                    {:else}
                      <p class="p-3 text-sm text-base-content/70">
                        No matching suggestions.
                      </p>
                    {/each}
                  </section>
                {/if}
              </div>
            {/each}
          </div>
          {#if error && errorField === 'moves'}
            <p role="alert" class="mt-2 text-sm font-medium text-error">
              {error}
            </p>
          {/if}
        </section>

        <details
          bind:this={evDetails}
          class="rounded-xl border bg-base-100"
          open={initialField === 'spread'}
        >
          <summary class="min-h-11 cursor-pointer px-3 py-3">
            <h3
              class="inline text-sm font-semibold"
              tabindex="-1"
              data-editor-section="spread"
            >
              EV spread
            </h3>
          </summary>
          <div class="border-t px-3 pb-3">
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
              <p role="alert" class="mt-2 text-sm font-medium text-error">
                {error}
              </p>
            {/if}
          </div>
        </details>

        {#if error && errorField === 'set'}
          <p role="alert" class="text-sm font-medium text-error">{error}</p>
        {/if}
      </div>
    {/if}
  </div>

  <footer
    class="shrink-0 border-t bg-base-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4"
  >
    <p class="mb-3 text-xs text-base-content/70">
      Changes are staged. Save changes on the team to keep them.
    </p>
    <div class="flex justify-end gap-2">
      <Button variant="outline" class="min-h-11" onclick={oncancel}
        >Cancel</Button
      >
      <Button class="min-h-11" onclick={apply}>Apply to team</Button>
    </div>
  </footer>
</div>
