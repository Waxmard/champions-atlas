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
  <div class="relative">
    <Search
      class="pointer-events-none absolute start-3.5 top-3.5 z-10 size-5 text-base-content/70"
      aria-hidden="true"
    />
    <Combobox.Input
      clearOnDeselect
      aria-label={label}
      placeholder={disabled ? disabledPlaceholder : placeholder}
      oninput={(event) => {
        search = event.currentTarget.value;
        open = true;
      }}
      class="input h-12 w-full ps-11 pe-4 text-base disabled:opacity-50"
    />
  </div>
  <Combobox.Portal disabled={!portal}>
    <Combobox.Content
      sideOffset={6}
      class="picker-popover-enter z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 shadow-lg"
    >
      <Combobox.Viewport>
        {#each filtered as pokemon (pokemon)}
          <Combobox.Item
            value={pokemon}
            label={pokemon}
            class="option-row cursor-pointer border-b border-base-300 outline-none last:border-b-0 data-highlighted:bg-info data-highlighted:text-info-content"
            ><SpeciesLabel {pokemon} spriteSize={32} /></Combobox.Item
          >
        {:else}
          <p class="p-3 text-sm text-base-content/70">
            No matching Pokémon in this catalog.
          </p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
