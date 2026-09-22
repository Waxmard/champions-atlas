<script lang="ts">
  import { Combobox } from 'bits-ui';
  import Search from '@lucide/svelte/icons/search';
  import { normalize } from '$lib/catalog';
  import SpeciesLabel from './SpeciesLabel.svelte';

  let {
    options,
    onselect,
    disabled = false,
    label = 'Add Pokémon filter',
    placeholder = 'Find a Pokémon…',
    disabledPlaceholder = 'Six Pokémon selected',
  }: {
    options: string[];
    onselect: (pokemon: string) => void;
    disabled?: boolean;
    label?: string;
    placeholder?: string;
    disabledPlaceholder?: string;
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
    search = '';
    selected = '';
    open = false;
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
      class="pointer-events-none absolute top-3.5 left-3.5 z-10 size-5 text-base-content/70"
      aria-hidden="true"
    />
    <Combobox.Input
      aria-label={label}
      placeholder={disabled ? disabledPlaceholder : placeholder}
      oninput={(event) => {
        search = event.currentTarget.value;
        open = true;
      }}
      class="input h-12 w-full pr-4 pl-11 text-base disabled:opacity-50"
    />
  </div>
  <Combobox.Portal>
    <Combobox.Content
      sideOffset={6}
      class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <Combobox.Viewport>
        {#each filtered as pokemon (pokemon)}
          <Combobox.Item
            value={pokemon}
            label={pokemon}
            class="flex min-h-11 cursor-pointer items-center gap-2 border-b border-base-300 px-3 text-sm outline-none last:border-b-0 data-highlighted:bg-base-200 data-highlighted:text-base-content"
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
