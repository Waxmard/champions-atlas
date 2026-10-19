<script lang="ts">
  import { Combobox } from 'bits-ui';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Button } from '#lib/components/ui/button/index.js';
  import { rankSavedTeams } from '#lib/team-collections.js';
  import type { SavedTeam } from '#lib/workbench.js';
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
    fieldEl = $state<HTMLElement | null>(null),
    contentEl = $state<HTMLElement | null>(null);
  const selected = $derived(teams.find((team) => team.id === value));
  const options = $derived(open ? rankSavedTeams(teams, field) : teams);
  const roster = (team: SavedTeam) =>
    team.members.map((member) => member.pokemon);

  $effect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || fieldEl?.contains(target) || contentEl?.contains(target))
        return;
      closeMenu();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  });

  function openMenu() {
    open = true;
    field = '';
  }

  function closeMenu() {
    open = false;
    field = '';
  }

  function toggleTrigger() {
    if (disabled) return;
    if (open) closeMenu();
    else openMenu();
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu();
    }
  }

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
      closeMenu();
    }
  }

  export function focus() {
    inputEl?.focus();
  }
</script>

<div class="max-w-xl">
  <label class="term block" for={id}>
    Saved team<span class="sr-only">
      {selected ? `, currently ${selected.name}` : ''}
    </span>
  </label>
  <Combobox.Root
    type="single"
    bind:open
    bind:value={selectedId}
    inputValue={field}
    onValueChange={choose}
    allowDeselect={false}
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
        placeholder="Search or scroll saved teams"
        autocomplete="off"
        onclick={() => {
          if (!open) openMenu();
        }}
        oninput={(event) => {
          field = event.currentTarget.value;
          if (!open) openMenu();
        }}
        onkeydown={closeOnEscape}
        class="w-full min-w-0 bg-transparent text-base outline-none"
      >
        {#snippet child({ props })}
          <input {...props} value={field} />
        {/snippet}
      </Combobox.Input>
      <Button
        variant="quiet"
        size="icon-touch"
        class="absolute top-1/2 right-0.5 -translate-y-1/2"
        aria-label="Show saved teams"
        aria-haspopup="listbox"
        aria-expanded={open}
        {disabled}
        onpointerdown={(event) => event.stopPropagation()}
        onclick={toggleTrigger}
        onkeydown={closeOnEscape}
      >
        <ChevronDown class="size-5" aria-hidden="true" />
      </Button>
    </div>
    <Combobox.Portal>
      <Combobox.Content
        bind:ref={contentEl}
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
              class="option-row cursor-pointer border-b border-base-300 outline-none last:border-b-0 data-highlighted:bg-base-200 data-highlighted:text-base-content"
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
