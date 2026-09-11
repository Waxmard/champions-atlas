<script lang="ts">
  import { resolve } from '$app/paths';
  import Compass from '@lucide/svelte/icons/compass';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import { Button } from '$lib/components/ui/button';
</script>

<svelte:head>
  <title>Champion's Atlas — Find your next team</title>
  <meta
    name="description"
    content="Explore Pokémon Champions doubles teams, discover proven cores, and find your next team."
  />
</svelte:head>

<div class="mx-auto flex min-h-svh max-w-6xl flex-col px-5 sm:px-10">
  <header class="flex items-center justify-between gap-4 border-b py-6">
    <a
      href={resolve('/')}
      class="flex min-h-11 items-center gap-3 rounded-md font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <Compass class="size-6 text-primary" aria-hidden="true" />
      Champion's Atlas
    </a>
    <span class="text-sm text-muted-foreground">Doubles</span>
  </header>

  <main id="main" class="flex flex-1 flex-col justify-center py-16 sm:py-24">
    <p
      class="mb-5 text-xs font-semibold tracking-[0.2em] text-primary uppercase"
    >
      A world of teams. Your next six.
    </p>
    <h1
      class="max-w-3xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-7xl"
    >
      Find your<br />next team.
    </h1>
    <p class="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
      Start with a Pokémon you love. Discover the team around it.
    </p>

    <section
      aria-labelledby="catalog-heading"
      class="mt-12 rounded-2xl border bg-card p-6 sm:p-8"
    >
      <div
        class="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"
      >
        <div class="max-w-md">
          <h2 id="catalog-heading" class="text-lg font-semibold">
            The atlas is taking shape
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
            No teams loaded yet. Explore the source collections while we prepare
            the catalog.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <Button
            href="https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit"
            class="min-h-11 px-4"
            >VGCPastes <ArrowUpRight aria-hidden="true" /></Button
          >
          <Button
            href="https://limitlessvgc.com/teams"
            variant="outline"
            class="min-h-11 px-4"
            >Limitless <ArrowUpRight aria-hidden="true" /></Button
          >
        </div>
      </div>
    </section>
  </main>

  <footer class="border-t py-6 text-xs leading-relaxed text-muted-foreground">
    An independent fan project. Not affiliated with The Pokémon Company.
  </footer>
</div>
