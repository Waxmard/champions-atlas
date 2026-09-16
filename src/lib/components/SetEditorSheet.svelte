<script lang="ts">
  import { Dialog } from 'bits-ui';
  import X from '@lucide/svelte/icons/x';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { Member, Team } from '$lib/catalog';
  import { parseSetBlock } from '$lib/paste';
  import { catalogSuggestions, popularBuilds, setText } from '$lib/workbench';

  let {
    open = $bindable(false),
    member,
    setTextValue,
    teams,
    onapply,
  }: {
    open: boolean;
    member: Member;
    setTextValue: string;
    teams: Team[];
    onapply: (newSetText: string) => void;
  } = $props();

  let mode = $state<'form' | 'text'>('form');
  let error = $state('');

  let form = $state({
    pokemon: '',
    item: '',
    ability: '',
    nature: '',
    spread: '',
    moves: ['', '', '', ''],
  });
  let rawText = $state('');

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

  $effect(() => {
    if (open) {
      error = '';
      rawText = setTextValue || setText(member);
      form = {
        pokemon: member.pokemon,
        item: member.item || '',
        ability: member.ability || '',
        nature: member.nature || '',
        spread: member.spread || '',
        moves: [
          member.moves[0] || '',
          member.moves[1] || '',
          member.moves[2] || '',
          member.moves[3] || '',
        ],
      };
    }
  });

  const builds = $derived(popularBuilds(form.pokemon, teams, 5));
  const suggestions = $derived(catalogSuggestions(form.pokemon, teams));

  function loadBuild(event: Event) {
    const target = event.target as HTMLSelectElement;
    const index = Number(target.value);
    if (isNaN(index) || !builds[index]) return;
    const build = builds[index];
    form.item = build.item || '';
    form.ability = build.ability || '';
    form.nature = build.nature || '';
    form.spread = build.spread || '';
    form.moves = [
      build.moves[0] || '',
      build.moves[1] || '',
      build.moves[2] || '',
      build.moves[3] || '',
    ];
    target.value = '';
  }

  function apply() {
    error = '';
    try {
      let text = '';
      if (mode === 'form') {
        const moves = form.moves.map((m) => m.trim()).filter(Boolean);
        const setMember: Member = {
          pokemon: form.pokemon.trim(),
          item: form.item.trim() || null,
          ability: form.ability.trim() || null,
          nature: form.nature.trim() || null,
          spread: form.spread.trim() || null,
          moves,
        };
        text = setText(setMember);
        parseSetBlock(text);
      } else {
        parseSetBlock(rawText);
        text = rawText.trim();
      }
      onapply(text);
      open = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid set format.';
    }
  }

  function switchMode(newMode: 'form' | 'text') {
    if (newMode === 'text' && mode === 'form') {
      const moves = form.moves.map((m) => m.trim()).filter(Boolean);
      rawText = setText({
        pokemon: form.pokemon.trim(),
        item: form.item.trim() || null,
        ability: form.ability.trim() || null,
        nature: form.nature.trim() || null,
        spread: form.spread.trim() || null,
        moves,
      });
    } else if (newMode === 'form' && mode === 'text') {
      try {
        const parsed = parseSetBlock(rawText);
        form = {
          pokemon: parsed.pokemon,
          item: parsed.item || '',
          ability: parsed.ability || '',
          nature: parsed.nature || '',
          spread: parsed.spread || '',
          moves: [
            parsed.moves[0] || '',
            parsed.moves[1] || '',
            parsed.moves[2] || '',
            parsed.moves[3] || '',
          ],
        };
        error = '';
      } catch (err) {
        error =
          err instanceof Error
            ? err.message
            : 'Could not parse text into form.';
        return;
      }
    }
    mode = newMode;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/60 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-2xl border bg-card p-4 shadow-2xl duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
    >
      <div class="flex items-center justify-between border-b pb-3">
        <div class="flex items-center gap-3">
          <PokemonSprite pokemon={form.pokemon} size={44} />
          <div>
            <Dialog.Title class="text-lg leading-none font-semibold"
              >{form.pokemon}</Dialog.Title
            >
            <Dialog.Description class="mt-1 text-xs text-muted-foreground">
              Edit Pokémon set details
            </Dialog.Description>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-lg border bg-muted p-0.5 text-xs">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-medium transition-colors {mode ===
              'form'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => switchMode('form')}
            >
              Form
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 font-medium transition-colors {mode ===
              'text'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => switchMode('text')}
            >
              Text
            </button>
          </div>
          <Dialog.Close
            class="rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2"
          >
            <X class="size-5" />
            <span class="sr-only">Close</span>
          </Dialog.Close>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto py-3">
        {#if mode === 'form'}
          {#if builds.length}
            <div
              class="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3"
            >
              <label
                for="catalog-build-select"
                class="flex items-center gap-1.5 text-xs font-semibold text-primary"
              >
                <Sparkles class="size-3.5" />
                Popular catalog builds
              </label>
              <select
                id="catalog-build-select"
                class="filter-select mt-1.5 w-full text-xs"
                onchange={loadBuild}
              >
                <option value="">Choose a build to autofill…</option>
                {#each builds as build, i (build.label)}
                  <option value={i}>{build.label}</option>
                {/each}
              </select>
            </div>
          {/if}

          <div class="space-y-3">
            <div>
              <label
                for="set-item-input"
                class="block text-xs font-medium text-muted-foreground"
                >Item</label
              >
              <div class="relative mt-1 flex items-center">
                {#if form.item}
                  <span class="pointer-events-none absolute left-2.5">
                    <ItemIcon item={form.item} />
                  </span>
                {/if}
                <input
                  id="set-item-input"
                  list="item-suggestions"
                  class="h-10 w-full rounded-lg border bg-background pr-3 {form.item
                    ? 'pl-9'
                    : 'pl-3'} text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="e.g. Sitrus Berry"
                  bind:value={form.item}
                />
                <datalist id="item-suggestions">
                  {#each suggestions.items as item (item)}
                    <option value={item}></option>
                  {/each}
                </datalist>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label
                  for="set-ability-input"
                  class="block text-xs font-medium text-muted-foreground"
                  >Ability</label
                >
                <input
                  id="set-ability-input"
                  list="ability-suggestions"
                  class="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="e.g. Intimidate"
                  bind:value={form.ability}
                />
                <datalist id="ability-suggestions">
                  {#each suggestions.abilities as ability (ability)}
                    <option value={ability}></option>
                  {/each}
                </datalist>
              </div>
              <div>
                <label
                  for="set-nature-select"
                  class="block text-xs font-medium text-muted-foreground"
                  >Nature</label
                >
                <select
                  id="set-nature-select"
                  class="filter-select mt-1 h-10 w-full text-sm"
                  bind:value={form.nature}
                >
                  <option value="">Select Nature…</option>
                  {#each NATURES as nature (nature)}
                    <option value={nature}>{nature}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div>
              <p class="block text-xs font-medium text-muted-foreground">
                Moves (up to 4)
              </p>
              <datalist id="moves-suggestions">
                {#each suggestions.moves as move (move)}
                  <option value={move}></option>
                {/each}
              </datalist>
              <div class="mt-1.5 grid grid-cols-2 gap-2">
                {#each [0, 1, 2, 3] as i (i)}
                  <input
                    aria-label={`Move ${i + 1}`}
                    list="moves-suggestions"
                    class="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder={`Move ${i + 1}`}
                    bind:value={form.moves[i]}
                  />
                {/each}
              </div>
            </div>

            <div>
              <label
                for="set-evs-input"
                class="block text-xs font-medium text-muted-foreground"
                >EV Spread</label
              >
              <input
                id="set-evs-input"
                list="spreads-suggestions"
                class="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="252 HP / 252 SpA / 4 Spe"
                bind:value={form.spread}
              />
              <datalist id="spreads-suggestions">
                {#each suggestions.spreads as spread (spread)}
                  <option value={spread}></option>
                {/each}
              </datalist>
            </div>
          </div>
        {:else}
          <div>
            <label
              for="set-raw-textarea"
              class="block text-xs font-medium text-muted-foreground"
              >Set Text (Showdown format)</label
            >
            <textarea
              id="set-raw-textarea"
              class="mt-1 min-h-64 w-full rounded-lg border bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              bind:value={rawText}></textarea>
          </div>
        {/if}

        {#if error}
          <p role="alert" class="mt-3 text-xs font-medium text-destructive">
            {error}
          </p>
        {/if}
      </div>

      <div class="mt-3 flex items-center justify-end gap-2 border-t pt-3">
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button onclick={apply}>Apply set</Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
