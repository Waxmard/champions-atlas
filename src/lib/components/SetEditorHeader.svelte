<script lang="ts" module>
  export type EditorView = 'pokemon' | 'details' | 'moves' | 'spread';
  const SECTIONS: { id: EditorView; label: string; title: string }[] = [
    { id: 'pokemon', label: 'Pokémon', title: 'Pokémon' },
    { id: 'details', label: 'Details', title: 'Item and ability' },
    { id: 'spread', label: 'EVs', title: 'EV spread' },
    { id: 'moves', label: 'Moves', title: 'Moves' },
  ];
</script>

<script lang="ts">
  import SpeciesLabel from '#lib/components/SpeciesLabel.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  let {
    heading = $bindable(),
    view,
    section,
    pokemon,
    staged,
    onswitch,
    onapply,
    onpointerdown,
  }: {
    heading?: HTMLElement;
    view: EditorView;
    section: string;
    pokemon: string;
    staged: boolean;
    onswitch: (view: EditorView) => void;
    onapply: () => void;
    onpointerdown: (event: PointerEvent) => void;
  } = $props();
</script>

<header
  class="max-h-[30dvh] shrink-0 overflow-y-auto overscroll-contain border-b border-base-300 px-5 pt-4 pb-3 sm:px-6 sm:pt-5 phone-landscape:max-h-none phone-landscape:border-r phone-landscape:border-b-0 phone-landscape:px-4 phone-landscape:pt-4"
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2
      bind:this={heading}
      class="min-w-[min(6rem,100%)] flex-1 font-display text-lg leading-tight font-semibold tracking-tight wrap-anywhere sm:text-[1.375rem] phone-landscape:text-lg"
      tabindex="-1"
      data-editor-section={section}
    >
      {SECTIONS.find(({ id }) => id === view)?.title}
    </h2>
    <div
      class="ms-auto flex max-w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-selector)] border border-base-300 px-2.5 py-1 text-xs text-base-content/70"
    >
      <SpeciesLabel
        {pokemon}
        spriteSize={20}
        textClass="max-w-[120px] truncate text-xs font-medium"
      />
    </div>
    {#if staged}
      <Button variant="primary" {onpointerdown} onclick={onapply}
        >Apply swap</Button
      >
    {/if}
  </div>
  <nav
    aria-label="Set sections"
    class="mt-2.5 flex flex-wrap gap-1 phone-landscape:grid phone-landscape:grid-cols-2"
  >
    {#each SECTIONS as { id, label } (id)}
      <Button
        variant={view === id ? 'primary' : 'quiet'}
        size="dense"
        aria-current={view === id ? 'page' : undefined}
        {onpointerdown}
        onclick={() => onswitch(id)}
      >
        {label}
      </Button>
    {/each}
  </nav>
</header>
