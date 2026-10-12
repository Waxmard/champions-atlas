<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { Combobox } from 'bits-ui';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { rankSavedTeams } from '$lib/team-collections';
  import type { SavedTeam } from '$lib/workbench';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    teams,
    value,
    onselect,
    disabled = false,
  }: {
    teams: SavedTeam[];
    value: string;
    onselect: (id: string) => Promise<boolean>;
    disabled?: boolean;
  } = $props();
  const id = $props.id();
  let open = $state(false),
    field = $state(''),
    busy = $state(false);
  let selectedId = $derived(value);
  let inputEl = $state<HTMLInputElement | null>(null),
    fieldEl = $state<HTMLElement | null>(null);
  let quiet = false;
  const selected = $derived(teams.find((team) => team.id === value));
  const options = $derived(open ? rankSavedTeams(teams, field) : teams);
  const roster = (team: SavedTeam) =>
    team.members.map((member) => member.pokemon);

  $effect(() => {
    if (open) untrack(() => (field = ''));
    else field = selected?.name ?? '';
  });

  async function choose(next: string) {
    if (!next || next === value || busy) {
      selectedId = value;
      return;
    }
    busy = true;
    try {
      await onselect(next);
    } finally {
      busy = false;
      selectedId = value;
      open = false;
      field = '';
      await tick();
      field = selected?.name ?? '';
    }
  }

  export function focus() {
    quiet = true;
    inputEl?.focus();
    quiet = false;
  }

  function toggleTrigger(event: MouseEvent) {
    event.preventDefault();
    const willOpen = !(open && document.activeElement === inputEl);
    quiet = true;
    inputEl?.focus();
    quiet = false;
    open = willOpen;
  }
</script>

<div class="max-w-xl">
  <label class="term block" for={id}>Saved team</label>
  <Combobox.Root
    type="single"
    bind:open
    bind:value={selectedId}
    inputValue={field}
    onValueChange={choose}
    {disabled}
  >
    <div
      bind:this={fieldEl}
      class="input relative mt-2 flex h-auto min-h-11 w-full flex-col items-stretch gap-1.5 py-2.5 pr-12"
    >
      <div class="flex gap-1" aria-hidden="true">
        {#each selected ? roster(selected) : [] as pokemon, slot (slot)}
          <PokemonSprite {pokemon} size={32} />
        {/each}
      </div>
      <Combobox.Input
        {id}
        bind:ref={inputEl}
        placeholder={selected?.name ?? ''}
        autocomplete="off"
        onfocus={() => {
          if (!quiet) open = true;
        }}
        oninput={(event) => (field = event.currentTarget.value)}
        onclick={() => (open = true)}
        onblur={() => (open = false)}
        class="w-full min-w-0 bg-transparent text-base outline-none"
      />
      <button
        type="button"
        aria-label="Show saved teams"
        aria-haspopup="listbox"
        aria-expanded={open}
        onpointerdown={toggleTrigger}
        onclick={(event) => event.detail === 0 && toggleTrigger(event)}
        class="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-[var(--radius-field)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronDown class="size-5" aria-hidden="true" />
      </button>
    </div>
    <Combobox.Portal>
      <Combobox.Content
        customAnchor={fieldEl}
        sideOffset={6}
        onpointerdown={(event) => event.preventDefault()}
        class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <Combobox.Viewport>
          {#each options as team (team.id)}
            <Combobox.Item
              value={team.id}
              label={team.name}
              aria-label={`${team.name}: ${roster(team).join(', ')}`}
              class="flex min-h-11 cursor-pointer items-center gap-2 border-b border-base-300 px-3 py-2 outline-none last:border-b-0 data-highlighted:bg-base-200 data-highlighted:text-base-content"
            >
              {#snippet children({ selected: isSelected })}
                <span class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="flex gap-1" aria-hidden="true">
                    {#each roster(team) as pokemon, slot (slot)}
                      <PokemonSprite {pokemon} size={32} />
                    {/each}
                  </span>
                  <span
                    class="text-[0.8125rem] leading-tight wrap-break-word {isSelected
                      ? 'font-bold'
                      : 'text-base-content/70'}">{team.name}</span
                  >
                </span>
                {#if isSelected}<Check
                    class="size-4 shrink-0"
                    aria-hidden="true"
                  />{/if}
              {/snippet}
            </Combobox.Item>
          {:else}
            <p class="p-3 text-sm text-base-content/70">No matching teams.</p>
          {/each}
        </Combobox.Viewport>
      </Combobox.Content>
    </Combobox.Portal>
  </Combobox.Root>
</div>
