<script lang="ts">
  import { Combobox } from 'bits-ui';
  import { tick } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import EvEditor from '$lib/components/EvEditor.svelte';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import { getMoveType, getTypeIcon, TYPE_COLORS } from '$lib/types';
  import {
    championsSpreadTotal,
    parseChampionsSpread,
    parseSetBlock,
  } from '$lib/paste';
  import { catalogSuggestions, setText } from '$lib/workbench';

  type EditField =
    'pokemon' | 'item' | 'ability' | 'nature' | 'spread' | 'moves' | 'text';

  const FIELD_LABELS: Record<EditField, string> = {
    pokemon: 'Pokémon',
    item: 'Item',
    ability: 'Ability',
    nature: 'Nature',
    spread: 'EVs',
    moves: 'Moves',
    text: 'Set text',
  };
  interface Props {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditField;
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
  let initialText = $state(''),
    initialSpread = $state(''),
    rawText = $state(''),
    error = $state(''),
    moveInput = $state(''),
    itemQuery = $state(''),
    abilityQuery = $state(''),
    natureQuery = $state(''),
    pokemonQuery = $state('');
  let initialized = $state(false),
    spreadTouched = $state(false);
  let form = $state({
    pokemon: '',
    item: '',
    ability: '',
    nature: '',
    spread: '',
    moves: [] as string[],
  });
  let activeField = $state<
    'pokemon' | 'item' | 'ability' | 'nature' | 'spread' | 'moves' | null
  >(null);
  let editorElement = $state<HTMLElement>();
  let replacingMove = $state<string | null>(null);
  let swapInMove = $state<string | null>(null);
  let selectedPokemon = $state('');
  let selectedItem = $state('');
  let selectedAbility = $state('');
  let selectedNature = $state('');
  let selectedMove = $state('');
  let moveKeyboardIntent = $state(false);

  const draftMember = $derived<Member>({
    pokemon: form.pokemon.trim(),
    item: form.item.trim() || null,
    ability: form.ability.trim() || null,
    nature: form.nature.trim() || null,
    spread: form.spread.trim() || null,
    moves: form.moves.map((move) => move.trim()).filter(Boolean),
  });
  const fieldText = $derived(setText(draftMember));
  const fieldLabel = $derived(FIELD_LABELS[initialField]);
  const dirty = $derived(
    initialField === 'text'
      ? rawText !== initialText
      : fieldText !== initialText
  );
  const suggestions = $derived(
    catalogSuggestions(draftMember, teams, currentRegulation, teammates)
  );
  const norm = (val: string, q: string) =>
    normalize(val).includes(normalize(q));
  const filteredPokemon = $derived(
    suggestions.pokemon.filter((o) => norm(o.pokemon, pokemonQuery)).slice(0, 5)
  );
  const filteredItems = $derived(
    suggestions.items.filter((o) => norm(o.value, itemQuery)).slice(0, 5)
  );
  const filteredAbilities = $derived(
    suggestions.abilities.filter((o) => norm(o.value, abilityQuery)).slice(0, 5)
  );
  const remainingMoves = $derived(
    suggestions.moves
      .filter(
        (o) =>
          norm(o.value, moveInput) &&
          !form.moves.some((m) => normalize(m) === normalize(o.value))
      )
      .slice(0, 5)
  );
  const filteredNatures = $derived(
    natureQuery.trim()
      ? NATURES.filter((n) =>
          n.toLowerCase().startsWith(natureQuery.trim().toLowerCase())
        ).slice(0, 5)
      : suggestions.natures.length
        ? suggestions.natures.slice(0, 5).map((n) => n.value)
        : NATURES.slice(0, 5)
  );
  const spreadValues = $derived(
    parseChampionsSpread(form.spread) || parseChampionsSpread('')!
  );
  const spreadTotal = $derived(championsSpreadTotal(spreadValues));
  const spreadValid = $derived(
    !spreadTouched ||
      (parseChampionsSpread(form.spread) !== null && spreadTotal === 66)
  );
  const spreadSuggestions = $derived(
    suggestions.spreads
      .filter((o) => {
        const s = parseChampionsSpread(o.value);
        return s && championsSpreadTotal(s) === 66;
      })
      .slice(0, 5)
  );

  $effect(() => {
    if (!initialized) {
      form = {
        pokemon: member.pokemon,
        item: member.item || '',
        ability: member.ability || '',
        nature: member.nature || '',
        spread: member.spread || '',
        moves: [...member.moves],
      };
      initialText = setText({ ...member, set: undefined });
      initialSpread = member.spread || '';
      rawText = initialText;
      initialized = true;
      if (initialField !== 'text') activate(initialField);
      return;
    }
    ondirtychange(dirty);
  });

  export function focus() {
    requestAnimationFrame(() => {
      const selector = {
        pokemon: '#set-pokemon-input',
        item: '#set-item-input',
        ability: '#set-ability-input',
        nature: '#set-nature-input',
        spread: '#set-HP-ev',
        moves: '#set-moves-input',
        text: '#set-raw-textarea',
      }[initialField];
      editorElement?.querySelector<HTMLElement>(selector)?.focus({
        preventScroll: true,
      });
    });
  }

  function revealPanel(node: HTMLElement) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.dataset.motionReady = 'true';
    node.dataset.open = 'false';
    const frame = requestAnimationFrame(() => (node.dataset.open = 'true'));
    return { destroy: () => cancelAnimationFrame(frame) };
  }
  const handleBlur = (e: FocusEvent) => {
    const el = e.currentTarget as HTMLElement | null;
    requestAnimationFrame(() => {
      if (
        document.activeElement &&
        el &&
        !el.contains(document.activeElement)
      ) {
        activeField = null;
      }
    });
  };
  function activate(field: NonNullable<typeof activeField>) {
    activeField = field;
    pokemonQuery = itemQuery = abilityQuery = natureQuery = error = '';
  }
  const exactNature = (val: string) =>
    NATURES.find((n) => n.toLowerCase() === val.trim().toLowerCase());
  function applyPreFilled(m: Member) {
    form.pokemon = m.pokemon;
    form.item = m.item || '';
    form.ability = m.ability || '';
    form.nature = m.nature || '';
    form.spread = m.spread || '';
    form.moves = [...m.moves];
    activeField = null;
    error = '';
  }
  function addMove(value = moveInput) {
    const move = value.trim();
    if (!move) return;
    if (form.moves.length === 4)
      return void (error = 'A set can have at most four moves.');
    if (form.moves.some((s) => normalize(s) === normalize(move)))
      return void (error = 'A set cannot include the same move twice.');
    form.moves = [...form.moves, move];
    replacingMove = swapInMove = null;
    moveInput = error = '';
    activeField = null;
  }
  const removeMove = (i: number) => {
    form.moves = form.moves.filter((_, idx) => idx !== i);
    replacingMove = swapInMove = null;
    error = '';
  };
  function clickMove(move: string) {
    if (swapInMove) {
      const swap = swapInMove;
      form.moves = form.moves.map((m) =>
        normalize(m) === normalize(move) ? swap : m
      );
      swapInMove = null;
      error = '';
      return;
    }
    replacingMove =
      replacingMove !== null && normalize(replacingMove) === normalize(move)
        ? null
        : move;
  }
  function clickSuggestion(value: string) {
    if (replacingMove) {
      form.moves = form.moves.map((m) =>
        normalize(m) === normalize(replacingMove!) ? value : m
      );
      replacingMove = null;
      error = '';
      return;
    }
    if (form.moves.length < 4) {
      addMove(value);
      return;
    }
    swapInMove = value;
  }
  const NAV_KEYS = [
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ];
  function onOpenChange(
    field: 'pokemon' | 'item' | 'ability' | 'nature' | 'moves',
    open: boolean
  ) {
    if (open) activeField = field;
    else if (activeField === field) activeField = null;
  }
  function selectPokemon(value: string) {
    selectedPokemon = value;
    if (!value) return;
    const option = filteredPokemon.find((o) => o.pokemon === value);
    if (option) applyPreFilled(option.member);
    error = '';
    void tick().then(() => (selectedPokemon = ''));
  }
  function selectItem(value: string) {
    selectedItem = value;
    if (!value) return;
    form.item = value;
    itemQuery = value;
    error = '';
    activeField = null;
    void tick().then(() => (selectedItem = ''));
  }
  function selectAbility(value: string) {
    selectedAbility = value;
    if (!value) return;
    form.ability = value;
    abilityQuery = value;
    error = '';
    activeField = null;
    void tick().then(() => (selectedAbility = ''));
  }
  function selectNature(value: string) {
    selectedNature = value;
    if (!value) return;
    form.nature = value;
    natureQuery = value;
    error = '';
    activeField = null;
    void tick().then(() => (selectedNature = ''));
  }
  function selectMove(value: string) {
    selectedMove = value;
    if (!value) return;
    moveKeyboardIntent = false;
    clickSuggestion(value);
    void tick().then(() => {
      selectedMove = '';
      moveInput = '';
    });
  }
  function onMoveKeydown(event: KeyboardEvent) {
    if (NAV_KEYS.includes(event.key)) {
      moveKeyboardIntent = true;
      return;
    }
    if (event.key === 'Escape') {
      moveKeyboardIntent = false;
      return;
    }
    if (event.key === 'Enter' && !event.isComposing) {
      const active =
        event.currentTarget instanceof HTMLElement &&
        !!event.currentTarget.getAttribute('aria-activedescendant');
      if (activeField === 'moves' && moveKeyboardIntent && active) return;
      event.preventDefault();
      addMove();
    }
  }
  export function apply(): boolean {
    try {
      if (initialField === 'text') {
        const parsed = parseSetBlock(rawText);
        const sp =
          (parsed.spread || '') !== initialSpread
            ? parseChampionsSpread(parsed.spread || '')
            : null;
        if (sp && championsSpreadTotal(sp) !== 66) {
          error = `Changed EV spreads must total 66 points (currently ${championsSpreadTotal(sp)}).`;
          return false;
        }
        onapply(parsed);
        return true;
      }
      const nature = form.nature.trim() ? exactNature(form.nature) : null;
      if (form.nature.trim() && !nature) {
        error = 'Choose a standard nature.';
        return false;
      }
      if (nature) form.nature = nature;
      if (!spreadValid) {
        error = `Changed EV spreads must total 66 points (currently ${spreadTotal}).`;
        return false;
      }
      onapply(parseSetBlock(fieldText));
      return true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid set format.';
      return false;
    }
  }
</script>

<section
  bind:this={editorElement}
  aria-label={`Edit ${form.pokemon} set`}
  class="t-panel-slide min-w-0"
  use:revealPanel
>
  {#snippet noMatch(text: string)}
    <p class="p-3 text-sm text-base-content/70">{text}</p>
  {/snippet}
  <div class="flex items-center gap-2.5">
    <PokemonSprite pokemon={form.pokemon} size={36} />
    <div class="min-w-0">
      <h2 class="font-semibold wrap-break-word">Edit {fieldLabel}</h2>
      <p class="text-xs wrap-break-word text-base-content/70">
        {form.pokemon}
      </p>
    </div>
  </div>

  {#if initialField === 'pokemon'}
    <div class="mt-4 min-w-0">
      <label for="set-pokemon-input" class="text-sm font-medium">Pokémon</label>
      <Combobox.Root
        type="single"
        value={selectedPokemon}
        onValueChange={selectPokemon}
        allowDeselect={false}
        open={activeField === 'pokemon'}
        onOpenChange={(open) => onOpenChange('pokemon', open)}
        inputValue={form.pokemon}
      >
        <Combobox.Input
          id="set-pokemon-input"
          placeholder="Choose Pokémon"
          clearOnDeselect={false}
          onfocus={() => activate('pokemon')}
          oninput={(event) => {
            pokemonQuery = event.currentTarget.value;
            form.pokemon = event.currentTarget.value;
            selectedPokemon = '';
            error = '';
            activeField = 'pokemon';
          }}
          class="input mt-2 min-h-11 w-full text-sm"
        />
        <Combobox.Portal>
          <Combobox.Content
            sideOffset={6}
            aria-label="Pokémon suggestions"
            class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
          >
            <Combobox.Viewport>
              {#each filteredPokemon as option (option.pokemon)}
                <Combobox.Item
                  value={option.pokemon}
                  label={option.pokemon}
                  class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-base-200 data-highlighted:text-base-content"
                >
                  <PokemonSprite pokemon={option.pokemon} size={32} />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate text-sm font-semibold"
                        >{option.pokemon}</span
                      >
                      <span class="shrink-0 text-xs opacity-70"
                        >{option.sharedTeammates} shared</span
                      >
                    </div>
                    <span
                      class="mt-0.5 block truncate text-xs text-base-content/70"
                      >{[
                        option.member.item,
                        option.member.ability,
                        option.member.nature,
                      ]
                        .filter(Boolean)
                        .join(' · ')}</span
                    >
                  </div>
                </Combobox.Item>
              {:else}
                {@render noMatch('No matching suggestions.')}
              {/each}
            </Combobox.Viewport>
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  {:else if initialField === 'item'}
    <div class="mt-4 min-w-0">
      <label for="set-item-input" class="text-sm font-medium">Item</label>
      <Combobox.Root
        type="single"
        value={selectedItem}
        onValueChange={selectItem}
        allowDeselect={false}
        open={activeField === 'item'}
        onOpenChange={(open) => onOpenChange('item', open)}
        inputValue={form.item}
      >
        <div class="relative mt-2">
          {#if form.item}<span class="pointer-events-none absolute top-3 left-3"
              ><ItemIcon item={form.item} /></span
            >{/if}
          <Combobox.Input
            id="set-item-input"
            placeholder="Custom item"
            clearOnDeselect={false}
            onfocus={() => activate('item')}
            oninput={(event) => {
              itemQuery = event.currentTarget.value;
              form.item = event.currentTarget.value;
              selectedItem = '';
              error = '';
              activeField = 'item';
            }}
            class="input min-h-11 w-full pr-3 text-sm {form.item
              ? 'pl-10'
              : 'pl-3'}"
          />
        </div>
        <Combobox.Portal>
          <Combobox.Content
            sideOffset={6}
            aria-label="Item suggestions"
            class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
          >
            <Combobox.Viewport>
              {#each filteredItems as option (option.value)}
                <Combobox.Item
                  value={option.value}
                  label={option.value}
                  class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-base-200 data-highlighted:text-base-content"
                  >{option.value}</Combobox.Item
                >
              {:else}
                {@render noMatch('No matching suggestions.')}
              {/each}
            </Combobox.Viewport>
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  {:else if initialField === 'ability'}
    <div class="mt-4 min-w-0">
      <label for="set-ability-input" class="text-sm font-medium">Ability</label>
      <Combobox.Root
        type="single"
        value={selectedAbility}
        onValueChange={selectAbility}
        allowDeselect={false}
        open={activeField === 'ability'}
        onOpenChange={(open) => onOpenChange('ability', open)}
        inputValue={form.ability}
      >
        <Combobox.Input
          id="set-ability-input"
          placeholder="Custom ability"
          clearOnDeselect={false}
          onfocus={() => activate('ability')}
          oninput={(event) => {
            abilityQuery = event.currentTarget.value;
            form.ability = event.currentTarget.value;
            selectedAbility = '';
            error = '';
            activeField = 'ability';
          }}
          class="input mt-2 min-h-11 w-full text-sm"
        />
        <Combobox.Portal>
          <Combobox.Content
            sideOffset={6}
            aria-label="Ability suggestions"
            class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
          >
            <Combobox.Viewport>
              {#each filteredAbilities as option (option.value)}
                <Combobox.Item
                  value={option.value}
                  label={option.value}
                  class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-base-200 data-highlighted:text-base-content"
                  >{option.value}</Combobox.Item
                >
              {:else}
                {@render noMatch('No matching suggestions.')}
              {/each}
            </Combobox.Viewport>
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  {:else if initialField === 'nature'}
    <div class="mt-4 min-w-0">
      <label for="set-nature-input" class="text-sm font-medium">Nature</label>
      <Combobox.Root
        type="single"
        value={selectedNature}
        onValueChange={selectNature}
        allowDeselect={false}
        open={activeField === 'nature'}
        onOpenChange={(open) => onOpenChange('nature', open)}
        inputValue={form.nature}
      >
        <Combobox.Input
          id="set-nature-input"
          placeholder="Choose nature"
          clearOnDeselect={false}
          onfocus={() => activate('nature')}
          oninput={(event) => {
            natureQuery = event.currentTarget.value;
            form.nature = event.currentTarget.value;
            selectedNature = '';
            error = '';
            activeField = 'nature';
          }}
          onblur={() => {
            form.nature = exactNature(form.nature) || form.nature;
          }}
          class="input mt-2 min-h-11 w-full text-sm"
        />
        <Combobox.Portal>
          <Combobox.Content
            sideOffset={6}
            aria-label="Nature suggestions"
            class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
          >
            <Combobox.Viewport>
              {#each filteredNatures as nature (nature)}
                <Combobox.Item
                  value={nature}
                  label={nature}
                  class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-base-200 data-highlighted:text-base-content"
                  >{nature}</Combobox.Item
                >
              {:else}
                {@render noMatch('No matching nature.')}
              {/each}
            </Combobox.Viewport>
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  {:else if initialField === 'spread'}
    <div class="mt-4 min-w-0" onfocusout={handleBlur}>
      <label for="set-evs-input" class="text-sm font-medium">EV spread</label>
      {#if activeField !== 'spread'}<Button
          id="set-evs-input"
          variant="outline"
          class="mt-2 min-h-11 w-full justify-start font-mono whitespace-normal"
          onclick={() => activate('spread')}>{form.spread || 'No EVs'}</Button
        >{:else}<EvEditor
          spread={form.spread}
          suggestions={spreadSuggestions}
          onspreadchange={(spread, nature) => {
            form.spread = spread;
            if (nature) form.nature = nature;
            spreadTouched = true;
            error = '';
          }}
          ondone={() => (activeField = null)}
        />{/if}
    </div>
  {/if}

  {#if initialField === 'moves'}
    <div class="mt-4 min-w-0" data-moves-editor>
      <h3 class="text-sm font-medium">Moves ({form.moves.length}/4)</h3>
      {#if replacingMove}
        <p class="mt-1 text-xs text-primary">
          Replacing {replacingMove}. Choose a suggested move.
        </p>
      {:else if swapInMove}
        <p class="mt-1 text-xs text-primary">
          Swap in {swapInMove}. Choose a move to replace.
        </p>
      {:else if form.moves.length === 4}
        <p class="mt-1 text-xs text-base-content/70">
          Choose a move or a suggestion to swap.
        </p>
      {/if}
      {#if form.moves.length}<ul
          class="mt-2 grid gap-2 sm:grid-cols-2"
          aria-label="Selected moves"
        >
          {#each form.moves as move, index (move)}
            {@const type = getMoveType(move)}
            {@const typeColor = type ? TYPE_COLORS[type] : null}
            {@const selected =
              replacingMove !== null &&
              normalize(replacingMove) === normalize(move)}
            {@const swappable = swapInMove !== null}
            <li
              class="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-base-100 px-3 py-1 shadow-2xs {selected ||
              swappable
                ? 'border-primary ring-1 ring-primary/40'
                : ''}"
              style={typeColor ? `border-left: 3px solid ${typeColor};` : ''}
            >
              <button
                type="button"
                class="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
                aria-pressed={selected || swappable}
                onclick={() => clickMove(move)}
              >
                {#if type}<img
                    src={getTypeIcon(type)}
                    alt={type}
                    class="size-4 shrink-0 object-contain"
                  />{/if}
                <span class="min-w-0 font-medium wrap-break-word">{move}</span>
              </button>
              <Button
                variant="ghost"
                class="min-h-9 min-w-9 p-1"
                aria-label={`Remove ${move}`}
                onclick={() => removeMove(index)}><X /></Button
              >
            </li>
          {/each}
        </ul>{/if}
      <div class="mt-2 flex gap-2">
        <Combobox.Root
          type="single"
          value={selectedMove}
          onValueChange={selectMove}
          allowDeselect={false}
          open={activeField === 'moves'}
          onOpenChange={(open) => onOpenChange('moves', open)}
          inputValue={moveInput}
        >
          <Combobox.Input
            id="set-moves-input"
            aria-label="Custom move"
            placeholder="Custom move"
            clearOnDeselect={true}
            onfocus={() => {
              activate('moves');
              moveKeyboardIntent = false;
            }}
            oninput={(event) => {
              moveInput = event.currentTarget.value;
              moveKeyboardIntent = false;
              error = '';
              activeField = 'moves';
            }}
            onkeydown={onMoveKeydown}
            class="input min-h-11 min-w-0 flex-1 text-sm"
          />
          <Combobox.Portal>
            <Combobox.Content
              sideOffset={6}
              aria-label="Move suggestions"
              onInteractOutside={(e) => {
                if (
                  e.target instanceof Element &&
                  e.target.closest('[data-moves-editor]')
                )
                  e.preventDefault();
              }}
              class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
            >
              <Combobox.Viewport>
                {#each remainingMoves as option (option.value)}
                  {@const type = getMoveType(option.value)}
                  {@const typeColor = type ? TYPE_COLORS[type] : null}
                  <Combobox.Item
                    value={option.value}
                    label={option.value}
                    class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-base-200 data-highlighted:text-base-content"
                    style={typeColor
                      ? `border-left: 3px solid ${typeColor};`
                      : ''}
                  >
                    {#if type}<img
                        src={getTypeIcon(type)}
                        alt={type}
                        class="size-3.5 shrink-0 object-contain"
                      />{/if}
                    <span>{option.value}</span>
                  </Combobox.Item>
                {:else}
                  {@render noMatch('No matching suggestions.')}
                {/each}
              </Combobox.Viewport>
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
        <Button class="min-h-11" onclick={() => addMove()}>Add move</Button>
      </div>
    </div>
  {/if}

  {#if initialField === 'text'}
    <label for="set-raw-textarea" class="mt-4 block text-sm font-medium"
      >Showdown set text</label
    >
    <textarea
      id="set-raw-textarea"
      class="textarea mt-2 min-h-52 w-full resize-y p-3 font-mono text-xs leading-5"
      bind:value={rawText}
      oninput={() => (error = '')}></textarea>
  {/if}

  {#if error}<p role="alert" class="mt-3 text-sm font-medium text-error">
      {error}
    </p>{/if}
  <div class="mt-4 flex justify-end gap-2 border-t pt-3">
    <Button variant="outline" class="min-h-11" onclick={oncancel}>Cancel</Button
    ><Button
      class="min-h-11"
      disabled={!spreadValid}
      onclick={apply}
      aria-label={`Apply ${fieldLabel.toLowerCase()}`}>Done</Button
    >
  </div>
</section>
