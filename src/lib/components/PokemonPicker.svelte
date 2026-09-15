<script lang="ts">
  import { Combobox } from 'bits-ui';
  import Search from '@lucide/svelte/icons/search';
  import { normalize } from '$lib/catalog';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    options,
    onselect,
    disabled = false,
  }: {
    options: string[];
    onselect: (pokemon: string) => void;
    disabled?: boolean;
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
      class="pointer-events-none absolute top-3.5 left-3.5 size-5 text-muted-foreground"
      aria-hidden="true"
    />
    <Combobox.Input
      aria-label="Add Pokémon filter"
      placeholder={disabled ? 'Six Pokémon selected' : 'Find a Pokémon…'}
      oninput={(event) => {
        search = event.currentTarget.value;
        open = true;
      }}
      class="h-12 w-full rounded-xl border bg-background pr-4 pl-11 text-base transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
    />
  </div>
  <Combobox.Portal>
    <Combobox.Content
      sideOffset={6}
      class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <Combobox.Viewport>
        {#each filtered as pokemon (pokemon)}
          <Combobox.Item
            value={pokemon}
            label={pokemon}
            class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
            ><PokemonSprite {pokemon} size={32} />{pokemon}</Combobox.Item
          >
        {:else}
          <p class="p-3 text-sm text-muted-foreground">
            No matching Pokémon in this catalog.
          </p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
