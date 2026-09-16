<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import { parseSetBlock } from '$lib/paste';
  import { catalogSuggestions, setText } from '$lib/workbench';

  let {
    member,
    teams,
    currentRegulation,
    onapply,
    oncancel,
    ondirtychange,
  }: {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    onapply: (member: Member) => void;
    oncancel: () => void;
    ondirtychange: (dirty: boolean) => void;
  } = $props();

  const NATURES = [
    'Adamant',
    'Bashful',
    'Bold',
    'Brave',
    'Calm',
    'Careful',
    'Docile',
    'Gentle',
    'Hardy',
    'Hasty',
    'Impish',
    'Jolly',
    'Lax',
    'Lonely',
    'Mild',
    'Modest',
    'Naive',
    'Naughty',
    'Quiet',
    'Quirky',
    'Rash',
    'Relaxed',
    'Sassy',
    'Serious',
    'Timid',
  ];
  let initialText = $state('');
  let form = $state({
    pokemon: '',
    item: '',
    ability: '',
    nature: '',
    spread: '',
    moves: [] as string[],
  });
  let initialized = $state(false),
    rawText = $state(''),
    rawDirty = $state(false),
    error = $state(''),
    moveInput = $state('');
  let showItems = $state(false),
    showAbilities = $state(false),
    showMoves = $state(false),
    showSpreads = $state(false),
    spreadFilter = $state('');

  const draftMember = $derived<Member>({
    pokemon: form.pokemon.trim(),
    item: form.item.trim() || null,
    ability: form.ability.trim() || null,
    nature: form.nature.trim() || null,
    spread: form.spread.trim() || null,
    moves: form.moves.map((move) => move.trim()).filter(Boolean),
  });
  const fieldText = $derived(setText(draftMember));
  const dirty = $derived(fieldText !== initialText || rawDirty);
  const suggestions = $derived(
    catalogSuggestions(form.pokemon, teams, currentRegulation)
  );
  const remainingMoves = $derived(
    suggestions.moves.filter(
      (option) =>
        !form.moves.some((move) => normalize(move) === normalize(option.value))
    )
  );
  const filteredSpreads = $derived(
    suggestions.spreads.filter((option) =>
      normalize(option.value).includes(normalize(spreadFilter))
    )
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
      rawText = initialText;
      initialized = true;
      return;
    }
    if (!rawDirty) rawText = fieldText;
    ondirtychange(dirty);
  });

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
    error = '';
  }
  function removeMove(index: number) {
    form.moves = form.moves.filter((_, current) => current !== index);
    error = '';
  }
  function loadText() {
    try {
      const parsed = parseSetBlock(rawText);
      form = {
        pokemon: parsed.pokemon,
        item: parsed.item || '',
        ability: parsed.ability || '',
        nature: parsed.nature || '',
        spread: parsed.spread || '',
        moves: parsed.moves,
      };
      rawDirty = false;
      error = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid set format.';
    }
  }
  function resetText() {
    rawText = fieldText;
    rawDirty = false;
    error = '';
  }
  function apply() {
    try {
      onapply(parseSetBlock(fieldText));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid set format.';
    }
  }
</script>

<section
  aria-label={`Edit ${form.pokemon} set`}
  class="min-w-0 animate-in duration-200 fade-in-0 slide-in-from-top-2"
>
  <div class="flex flex-wrap items-center gap-3">
    <PokemonSprite pokemon={form.pokemon} size={44} />
    <div class="min-w-0">
      <h2 class="text-lg font-semibold wrap-break-word">Edit {form.pokemon}</h2>
      <p class="text-xs text-muted-foreground">
        Catalog observations. Current-regulation legality unverified.
      </p>
    </div>
  </div>

  <div class="mt-5 grid gap-4 lg:grid-cols-2">
    <div class="min-w-0">
      <label for="set-item-input" class="text-sm font-medium">Item</label>
      <div class="relative mt-2">
        {#if form.item}<span class="pointer-events-none absolute top-3 left-3"
            ><ItemIcon item={form.item} /></span
          >{/if}
        <input
          id="set-item-input"
          class="min-h-11 w-full rounded-lg border bg-background py-2 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary {form.item
            ? 'pl-10'
            : 'pl-3'}"
          placeholder="Custom item"
          bind:value={form.item}
          oninput={() => (error = '')}
        />
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        {#each suggestions.items.slice(0, showItems ? undefined : 5) as option (option.value)}
          <Button
            variant={normalize(form.item) === normalize(option.value)
              ? 'default'
              : 'outline'}
            class="min-h-11 max-w-full text-left whitespace-normal"
            onclick={() => {
              form.item = option.value;
              error = '';
            }}
            >{option.value}
            <span class="text-xs opacity-70"
              >{option.currentCount}/{option.totalCount}</span
            ></Button
          >
        {/each}
      </div>
      {#if suggestions.items.length > 5}<Button
          variant="ghost"
          class="mt-1 min-h-11"
          onclick={() => (showItems = !showItems)}
          >{showItems
            ? 'Show fewer items'
            : `Show ${suggestions.items.length - 5} more items`}</Button
        >{/if}
    </div>

    <div class="min-w-0">
      <label for="set-ability-input" class="text-sm font-medium">Ability</label>
      <input
        id="set-ability-input"
        class="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        placeholder="Custom ability"
        bind:value={form.ability}
        oninput={() => (error = '')}
      />
      <div class="mt-2 flex flex-wrap gap-2">
        {#each suggestions.abilities.slice(0, showAbilities ? undefined : 5) as option (option.value)}
          <Button
            variant={normalize(form.ability) === normalize(option.value)
              ? 'default'
              : 'outline'}
            class="min-h-11 max-w-full text-left whitespace-normal"
            onclick={() => {
              form.ability = option.value;
              error = '';
            }}
            >{option.value}
            <span class="text-xs opacity-70"
              >{option.currentCount}/{option.totalCount}</span
            ></Button
          >
        {/each}
      </div>
      {#if suggestions.abilities.length > 5}<Button
          variant="ghost"
          class="mt-1 min-h-11"
          onclick={() => (showAbilities = !showAbilities)}
          >{showAbilities
            ? 'Show fewer abilities'
            : `Show ${suggestions.abilities.length - 5} more abilities`}</Button
        >{/if}
    </div>

    <div class="min-w-0">
      <label for="set-nature-select" class="text-sm font-medium">Nature</label>
      <select
        id="set-nature-select"
        class="filter-select mt-2"
        bind:value={form.nature}
        ><option value="">Select nature</option
        >{#each NATURES as nature (nature)}<option value={nature}
            >{nature}</option
          >{/each}</select
      >
    </div>

    <div class="min-w-0">
      <label for="set-evs-input" class="text-sm font-medium">EV spread</label>
      <input
        id="set-evs-input"
        class="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        placeholder="32 HP / 32 SpA"
        bind:value={form.spread}
        oninput={() => (error = '')}
      />
      {#if showSpreads && suggestions.spreads.length > 3}<input
          aria-label="Filter EV spreads"
          class="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="Filter spreads"
          bind:value={spreadFilter}
        />{/if}
      <div class="mt-2 grid gap-2">
        {#each filteredSpreads.slice(0, showSpreads ? undefined : 3) as option (option.value)}
          <Button
            variant={normalize(form.spread) === normalize(option.value)
              ? 'default'
              : 'outline'}
            class="h-auto min-h-11 w-full justify-between text-left whitespace-normal"
            onclick={() => {
              form.spread = option.value;
              error = '';
            }}
            ><span class="wrap-break-word">{option.value}</span><span
              class="shrink-0 text-xs opacity-70"
              >{option.currentCount}/{option.totalCount}</span
            ></Button
          >
        {/each}
      </div>
      {#if suggestions.spreads.length > 3}<Button
          variant="ghost"
          class="mt-1 min-h-11"
          onclick={() => (showSpreads = !showSpreads)}
          >{showSpreads
            ? 'Show fewer spreads'
            : `Show ${suggestions.spreads.length - 3} more spreads`}</Button
        >{/if}
    </div>
  </div>

  <p class="mt-3 text-xs text-muted-foreground">
    Suggestion counts: current regulation / all catalog teams.
  </p>

  <div class="mt-5 min-w-0 border-t pt-5">
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
        aria-label="Custom move"
        class="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        placeholder="Custom move"
        bind:value={moveInput}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addMove();
          }
        }}
      />
      <Button class="min-h-11" onclick={() => addMove()}>Add move</Button>
    </div>
    <div class="mt-2 flex flex-wrap gap-2">
      {#each remainingMoves.slice(0, showMoves ? undefined : 8) as option (option.value)}
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
    {#if remainingMoves.length > 8}<Button
        variant="ghost"
        class="mt-1 min-h-11"
        onclick={() => (showMoves = !showMoves)}
        >{showMoves
          ? 'Show fewer moves'
          : `Show ${remainingMoves.length - 8} more moves`}</Button
      >{/if}
  </div>

  <details class="mt-5 rounded-xl border p-3">
    <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium"
      >Advanced set text</summary
    >
    <label for="set-raw-textarea" class="mt-2 block text-sm font-medium"
      >Showdown set text</label
    >
    <textarea
      id="set-raw-textarea"
      class="mt-2 min-h-64 w-full rounded-lg border bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      bind:value={rawText}
      oninput={() => {
        rawDirty = true;
        error = '';
      }}></textarea>
    <div class="mt-2 flex flex-wrap gap-2">
      <Button class="min-h-11" onclick={loadText}>Load text into fields</Button
      ><Button variant="outline" class="min-h-11" onclick={resetText}
        >Reset text</Button
      >
    </div>
  </details>

  {#if error}<p role="alert" class="mt-3 text-sm font-medium text-destructive">
      {error}
    </p>{/if}
  {#if rawDirty}<p class="mt-3 text-sm text-muted-foreground">
      Load or reset changed text before applying.
    </p>{/if}
  <div class="mt-5 flex flex-wrap justify-end gap-2 border-t pt-4">
    <Button variant="outline" class="min-h-11" onclick={oncancel}>Cancel</Button
    ><Button class="min-h-11" disabled={rawDirty} onclick={apply}
      >Apply set</Button
    >
  </div>
</section>
