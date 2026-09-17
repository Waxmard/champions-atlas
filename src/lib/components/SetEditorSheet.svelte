<script lang="ts">
  import { Combobox } from 'bits-ui';
  import X from '@lucide/svelte/icons/x';
  import EvEditor from '$lib/components/EvEditor.svelte';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    championsSpreadTotal,
    parseChampionsSpread,
    parseSetBlock,
  } from '$lib/paste';
  import { catalogSuggestions, setText } from '$lib/workbench';

  type EditField = 'item' | 'ability' | 'nature' | 'spread' | 'moves' | 'text';

  const FIELD_LABELS: Record<EditField, string> = {
    item: 'Item',
    ability: 'Ability',
    nature: 'Nature',
    spread: 'EVs',
    moves: 'Moves',
    text: 'Set text',
  };

  let {
    member,
    teams,
    currentRegulation,
    initialField,
    onapply,
    oncancel,
    ondirtychange,
  }: {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    initialField: EditField;
    onapply: (member: Member) => void;
    oncancel: () => void;
    ondirtychange: (dirty: boolean) => void;
  } = $props();

  const NATURES =
    'Adamant Bashful Bold Brave Calm Careful Docile Gentle Hardy Hasty Impish Jolly Lax Lonely Mild Modest Naive Naughty Quiet Quirky Rash Relaxed Sassy Serious Timid'.split(
      ' '
    );
  let initialText = $state('');
  let form = $state({
    pokemon: '',
    item: '',
    ability: '',
    nature: '',
    spread: '',
    moves: [] as string[],
  });
  let editorElement = $state<HTMLElement>();
  let initialized = $state(false),
    initialFieldHandled = $state(false),
    initialSpread = $state(''),
    rawText = $state(''),
    spreadTouched = $state(false),
    error = $state(''),
    moveInput = $state(''),
    itemQuery = $state(''),
    abilityQuery = $state(''),
    natureQuery = $state('');
  let activeField = $state<
      'item' | 'ability' | 'nature' | 'spread' | 'moves' | null
    >(null),
    expanded = $state(false),
    natureSelection = $state(''),
    natureOpen = $state(false);

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
    catalogSuggestions(form.pokemon, teams, currentRegulation)
  );
  const filteredItems = $derived(
    suggestions.items.filter((option) =>
      normalize(option.value).includes(normalize(itemQuery))
    )
  );
  const filteredAbilities = $derived(
    suggestions.abilities.filter((option) =>
      normalize(option.value).includes(normalize(abilityQuery))
    )
  );
  const remainingMoves = $derived(
    suggestions.moves.filter(
      (option) =>
        normalize(option.value).includes(normalize(moveInput)) &&
        !form.moves.some((move) => normalize(move) === normalize(option.value))
    )
  );
  const filteredNatures = $derived(
    NATURES.filter((nature) =>
      nature.toLowerCase().startsWith(natureQuery.trim().toLowerCase())
    )
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
    suggestions.spreads.filter((option) => {
      const spread = parseChampionsSpread(option.value);
      return spread && championsSpreadTotal(spread) === 66;
    })
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
      return;
    }
    ondirtychange(dirty);
  });

  $effect(() => {
    if (!initialized || initialFieldHandled) return;
    if (initialField !== 'text') activate(initialField);
    initialFieldHandled = true;
  });

  export function focus() {
    requestAnimationFrame(() => {
      const selector = {
        item: '#set-item-input',
        ability: '#set-ability-input',
        nature: '#set-nature-input',
        spread: '#set-HP-ev',
        moves: '#set-moves-input',
        text: '#set-raw-textarea',
      }[initialField];
      editorElement?.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  function revealPanel(node: HTMLElement) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.dataset.motionReady = 'true';
    node.dataset.open = 'false';
    const frame = requestAnimationFrame(() => (node.dataset.open = 'true'));
    return { destroy: () => cancelAnimationFrame(frame) };
  }

  function activate(field: NonNullable<typeof activeField>) {
    activeField = field;
    natureOpen = field === 'nature';
    expanded = false;
    if (field === 'item') itemQuery = '';
    if (field === 'ability') abilityQuery = '';
    if (field === 'nature') natureQuery = '';
    error = '';
  }
  function closeOnBlur(
    field: NonNullable<typeof activeField>,
    element: HTMLElement
  ) {
    requestAnimationFrame(() => {
      if (activeField === field && !element.contains(document.activeElement))
        activeField = null;
    });
  }
  function exactNature(value: string) {
    return NATURES.find(
      (nature) => nature.toLowerCase() === value.trim().toLowerCase()
    );
  }
  function addMove(value = moveInput) {
    const move = value.trim();
    if (!move) return;
    if (form.moves.length === 4) {
      error = 'A set can have at most four moves.';
      return;
    }
    if (
      form.moves.some((selected) => normalize(selected) === normalize(move))
    ) {
      error = 'A set cannot include the same move twice.';
      return;
    }
    form.moves = [...form.moves, move];
    moveInput = '';
    activeField = null;
    error = '';
  }
  function removeMove(index: number) {
    form.moves = form.moves.filter((_, current) => current !== index);
    error = '';
  }
  export function apply(): boolean {
    try {
      if (initialField === 'text') {
        const parsed = parseSetBlock(rawText);
        if ((parsed.spread || '') !== initialSpread) {
          const spread = parseChampionsSpread(parsed.spread || '');
          const total = spread ? championsSpreadTotal(spread) : 0;
          if (!spread || total !== 66) {
            error = `Changed EV spreads must total 66 points (currently ${total}).`;
            return false;
          }
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
  <div class="flex items-center gap-2.5">
    <PokemonSprite pokemon={form.pokemon} size={36} />
    <div class="min-w-0">
      <h2 class="font-semibold wrap-break-word">Edit {fieldLabel}</h2>
      <p class="text-xs wrap-break-word text-muted-foreground">
        {form.pokemon}
      </p>
    </div>
  </div>

  {#if initialField !== 'moves' && initialField !== 'text'}
    <div class="mt-4">
      {#if initialField === 'item'}
        <div
          class="min-w-0"
          onfocusout={(event) => closeOnBlur('item', event.currentTarget)}
        >
          <label for="set-item-input" class="text-sm font-medium">Item</label>
          <div class="relative mt-2">
            {#if form.item}<span
                class="pointer-events-none absolute top-3 left-3"
                ><ItemIcon item={form.item} /></span
              >{/if}
            <input
              id="set-item-input"
              class="min-h-11 w-full rounded-lg border bg-background py-2 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary {form.item
                ? 'pl-10'
                : 'pl-3'}"
              placeholder="Custom item"
              bind:value={form.item}
              onfocus={() => activate('item')}
              oninput={(event) => {
                itemQuery = event.currentTarget.value;
                error = '';
              }}
              onkeydown={(event) => {
                if (event.key === 'Escape') activeField = null;
              }}
            />
          </div>
          {#if activeField === 'item'}<div
              class="mt-2 flex animate-in flex-wrap gap-2 duration-200 fade-in-0"
              aria-label="Item suggestions"
            >
              {#each filteredItems.slice(0, expanded ? undefined : 5) as option (option.value)}
                <Button
                  variant={normalize(form.item) === normalize(option.value)
                    ? 'default'
                    : 'outline'}
                  class="min-h-11 max-w-full text-left whitespace-normal"
                  onclick={() => {
                    form.item = option.value;
                    activeField = null;
                    error = '';
                  }}
                  >{option.value}
                  <span class="text-xs opacity-70"
                    >{option.currentCount}/{option.totalCount}</span
                  ></Button
                >
              {/each}
            </div>
            {#if filteredItems.length > 5}<Button
                variant="ghost"
                class="mt-1 min-h-11"
                onclick={() => (expanded = !expanded)}
                >{expanded
                  ? 'Show fewer items'
                  : `Show ${filteredItems.length - 5} more items`}</Button
              >{/if}{/if}
        </div>
      {:else if initialField === 'ability'}
        <div
          class="min-w-0"
          onfocusout={(event) => closeOnBlur('ability', event.currentTarget)}
        >
          <label for="set-ability-input" class="text-sm font-medium"
            >Ability</label
          >
          <input
            id="set-ability-input"
            class="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="Custom ability"
            bind:value={form.ability}
            onfocus={() => activate('ability')}
            oninput={(event) => {
              abilityQuery = event.currentTarget.value;
              error = '';
            }}
            onkeydown={(event) => {
              if (event.key === 'Escape') activeField = null;
            }}
          />
          {#if activeField === 'ability'}<div
              class="mt-2 flex animate-in flex-wrap gap-2 duration-200 fade-in-0"
              aria-label="Ability suggestions"
            >
              {#each filteredAbilities.slice(0, expanded ? undefined : 5) as option (option.value)}
                <Button
                  variant={normalize(form.ability) === normalize(option.value)
                    ? 'default'
                    : 'outline'}
                  class="min-h-11 max-w-full text-left whitespace-normal"
                  onclick={() => {
                    form.ability = option.value;
                    activeField = null;
                    error = '';
                  }}
                  >{option.value}
                  <span class="text-xs opacity-70"
                    >{option.currentCount}/{option.totalCount}</span
                  ></Button
                >
              {/each}
            </div>
            {#if filteredAbilities.length > 5}<Button
                variant="ghost"
                class="mt-1 min-h-11"
                onclick={() => (expanded = !expanded)}
                >{expanded
                  ? 'Show fewer abilities'
                  : `Show ${filteredAbilities.length - 5} more abilities`}</Button
              >{/if}{/if}
        </div>
      {:else if initialField === 'nature'}
        <div class="min-w-0">
          <label for="set-nature-input" class="text-sm font-medium"
            >Nature</label
          >
          <Combobox.Root
            type="single"
            bind:open={natureOpen}
            value={natureSelection}
            inputValue={form.nature}
            onOpenChange={(open) => {
              if (open) activate('nature');
              else if (activeField === 'nature') activeField = null;
            }}
            onValueChange={(value) => {
              if (!value) return;
              form.nature = value;
              natureSelection = value;
              natureOpen = false;
              activeField = null;
              error = '';
            }}
          >
            <Combobox.Input
              id="set-nature-input"
              aria-label="Nature"
              class="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Choose nature"
              onfocus={() => activate('nature')}
              oninput={(event) => {
                form.nature = event.currentTarget.value;
                natureQuery = event.currentTarget.value;
                activeField = 'nature';
                natureOpen = true;
                error = '';
              }}
              onblur={() => {
                const nature = exactNature(form.nature);
                if (nature) form.nature = nature;
              }}
            />
            <Combobox.Portal>
              <Combobox.Content
                sideOffset={6}
                class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0"
              >
                <Combobox.Viewport>
                  {#each filteredNatures as nature (nature)}
                    <Combobox.Item
                      value={nature}
                      label={nature}
                      class="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >{nature}</Combobox.Item
                    >
                  {:else}<p class="p-3 text-sm text-muted-foreground">
                      No matching nature.
                    </p>{/each}
                </Combobox.Viewport>
              </Combobox.Content>
            </Combobox.Portal>
          </Combobox.Root>
        </div>
      {:else if initialField === 'spread'}
        <div class="min-w-0">
          <label for="set-evs-input" class="text-sm font-medium"
            >EV spread</label
          >
          {#if activeField !== 'spread'}<Button
              id="set-evs-input"
              variant="outline"
              class="mt-2 min-h-11 w-full justify-start font-mono whitespace-normal"
              onclick={() => activate('spread')}
              >{form.spread || 'No EVs'}</Button
            >{:else}<EvEditor
              spread={form.spread}
              suggestions={spreadSuggestions}
              onspreadchange={(spread) => {
                form.spread = spread;
                spreadTouched = true;
                error = '';
              }}
              ondone={() => (activeField = null)}
            />{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if initialField === 'item' || initialField === 'ability'}
    <p class="mt-2 text-xs text-muted-foreground">
      Catalog counts: current regulation / all teams. Legality unverified.
    </p>
  {/if}

  {#if initialField === 'moves'}
    <div
      class="mt-4 min-w-0"
      onfocusout={(event) => closeOnBlur('moves', event.currentTarget)}
    >
      <h3 class="text-sm font-medium">Moves ({form.moves.length}/4)</h3>
      {#if form.moves.length}<ul
          class="mt-2 grid gap-2 sm:grid-cols-2"
          aria-label="Selected moves"
        >
          {#each form.moves as move, index (move)}
            <li
              class="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3"
            >
              <span class="min-w-0 wrap-break-word">{move}</span><Button
                variant="ghost"
                class="min-h-11 min-w-11 px-2"
                aria-label={`Remove ${move}`}
                onclick={() => removeMove(index)}><X /></Button
              >
            </li>
          {/each}
        </ul>{/if}
      <div class="mt-2 flex gap-2">
        <input
          id="set-moves-input"
          aria-label="Custom move"
          class="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="Custom move"
          bind:value={moveInput}
          onfocus={() => activate('moves')}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addMove();
            }
            if (event.key === 'Escape') activeField = null;
          }}
        />
        <Button class="min-h-11" onclick={() => addMove()}>Add move</Button>
      </div>
      {#if activeField === 'moves'}<div
          class="mt-2 flex animate-in flex-wrap gap-2 duration-200 fade-in-0"
          aria-label="Move suggestions"
        >
          {#each remainingMoves.slice(0, expanded ? undefined : 4) as option (option.value)}
            <Button
              variant="outline"
              class="min-h-11 max-w-full text-left whitespace-normal"
              disabled={form.moves.length === 4}
              onclick={() => addMove(option.value)}
              >{option.value}
              <span class="text-xs opacity-70"
                >{option.currentCount}/{option.totalCount}</span
              ></Button
            >
          {/each}
        </div>
        {#if remainingMoves.length > 4}<Button
            variant="ghost"
            class="mt-1 min-h-11"
            onclick={() => (expanded = !expanded)}
            >{expanded
              ? 'Show fewer moves'
              : `Show ${remainingMoves.length - 4} more moves`}</Button
          >{/if}{/if}
    </div>
    <p class="mt-2 text-xs text-muted-foreground">
      Catalog counts: current regulation / all teams. Legality unverified.
    </p>
  {/if}

  {#if initialField === 'text'}
    <label for="set-raw-textarea" class="mt-4 block text-sm font-medium"
      >Showdown set text</label
    >
    <textarea
      id="set-raw-textarea"
      class="mt-2 min-h-52 w-full resize-y rounded-lg border bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      bind:value={rawText}
      oninput={() => (error = '')}></textarea>
  {/if}

  {#if error}<p role="alert" class="mt-3 text-sm font-medium text-destructive">
      {error}
    </p>{/if}
  <div class="mt-4 flex justify-end gap-2 border-t pt-3">
    <Button variant="outline" class="min-h-11" onclick={oncancel}>Cancel</Button
    ><Button class="min-h-11" disabled={!spreadValid} onclick={apply}
      >Apply {fieldLabel.toLowerCase()}</Button
    >
  </div>
</section>
