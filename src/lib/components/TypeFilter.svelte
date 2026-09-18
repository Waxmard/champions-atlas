<script lang="ts">
  import { Combobox } from 'bits-ui';
  import Search from '@lucide/svelte/icons/search';
  import { getTypeIcon, type PokemonType } from '$lib/types';

  let {
    options,
    selected,
    onselect,
  }: {
    options: PokemonType[];
    selected: PokemonType[];
    onselect: (next: PokemonType[]) => void;
  } = $props();
  let search = $state('');
  let open = $state(false);
  const filtered = $derived(
    options.filter((type) => type.includes(search.toLowerCase().trim()))
  );
</script>

<Combobox.Root
  type="multiple"
  bind:open
  value={selected}
  inputValue={search}
  onValueChange={(next) => onselect(next as PokemonType[])}
>
  <div class="relative">
    <Search
      class="pointer-events-none absolute top-3.5 left-3.5 size-5 text-muted-foreground"
      aria-hidden="true"
    />
    <Combobox.Input
      aria-label="Filter by type"
      placeholder="Find a type…"
      onfocus={() => (open = true)}
      oninput={(event) => {
        search = event.currentTarget.value;
        open = true;
      }}
      class="h-12 w-full rounded-xl border bg-card pr-4 pl-11 text-base transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-primary"
    />
  </div>
  <Combobox.Portal>
    <Combobox.Content
      sideOffset={6}
      class="z-50 max-h-72 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <Combobox.Viewport>
        {#each filtered as type (type)}
          <Combobox.Item
            value={type}
            label={type}
            class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
            ><img
              src={getTypeIcon(type)}
              alt=""
              class="size-5"
            />{type}</Combobox.Item
          >
        {:else}
          <p class="p-3 text-sm text-muted-foreground">No matching type.</p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
