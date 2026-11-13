<script lang="ts">
  import { tick } from 'svelte';
  import { Combobox } from 'bits-ui';
  import Search from '@lucide/svelte/icons/search';
  import { normalize } from '#lib/catalog.js';
  import SpeciesLabel from './SpeciesLabel.svelte';

  let {
    options,
    onselect,
    disabled = false,
    label = 'Add Pokémon filter',
    placeholder = 'Find a Pokémon…',
    disabledPlaceholder = 'Six Pokémon selected',
    portal = true,
  }: {
    options: string[];
    onselect: (pokemon: string) => void;
    disabled?: boolean;
    label?: string;
    placeholder?: string;
    disabledPlaceholder?: string;
    portal?: boolean;
  } = $props();
  let search = $state('');
  let selected = $state('');
  let open = $state(false);
  let fieldEl = $state<HTMLDivElement | null>(null);
  const filtered = $derived(
    options.filter((name) => normalize(name).includes(normalize(search)))
  );

  function choose(value: string) {
    if (!value) return;
    onselect(value);
    open = false;
    void tick().then(() => {
      selected = '';
      search = '';
    });
  }
</script>

<Combobox.Root
  type="single"
  bind:open
  bind:value={selected}
  inputValue={search}
  onValueChange={choose}
  {disabled}
>
  <div bind:this={fieldEl} class="field {disabled ? 'opacity-50' : ''}">
    <Search class="size-5 shrink-0 text-base-content/70" aria-hidden="true" />
    <Combobox.Input
      clearOnDeselect
      aria-label={label}
      placeholder={disabled ? disabledPlaceholder : placeholder}
      oninput={(event) => {
        search = event.currentTarget.value;
        open = true;
      }}
      class="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
    />
  </div>
  <Combobox.Portal disabled={!portal}>
    <Combobox.Content
      customAnchor={fieldEl}
      sideOffset={6}
      class="surface popover-motion z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto p-1 shadow-lg"
    >
      <Combobox.Viewport>
        {#each filtered as pokemon (pokemon)}
          <Combobox.Item
            value={pokemon}
            label={pokemon}
            class="option-row border-b border-base-300 last:border-b-0"
            ><SpeciesLabel {pokemon} spriteSize={32} /></Combobox.Item
          >
        {:else}
          <p class="p-3 text-sm text-base-content/70">No matching Pokémon.</p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
