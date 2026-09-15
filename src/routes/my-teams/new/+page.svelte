<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { newCustomTeam, saveTeam } from '$lib/workbench';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let name = $state('');
  let paste = $state('');
  let message = $state('');

  async function save(event: SubmitEvent) {
    event.preventDefault();
    try {
      const saved = newCustomTeam(name, data.currentRegulation, paste);
      saveTeam(localStorage, saved);
      await goto(resolve(`/my-teams?team=${saved.id}`));
    } catch (error) {
      message =
        error instanceof Error
          ? error.message
          : 'Could not save this team. Existing saved teams were not replaced.';
    }
  }
</script>

<svelte:head><title>Add custom team — Champion's Atlas</title></svelte:head>
<main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">Add custom team</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Build your team in
        <a
          class="text-primary underline"
          href="https://play.pokemonshowdown.com/teambuilder"
          rel="external"
          target="_blank">Pokémon Showdown Teambuilder</a
        >, then paste its exported text. No legality check.
      </p>
    </div>
    <Button href={resolve('/my-teams')} variant="outline" class="min-h-11">
      Back to My teams
    </Button>
  </div>

  <form aria-label="Custom team import" class="mt-6 max-w-3xl" onsubmit={save}>
    <label class="block text-sm font-medium">
      Team name
      <input
        class="filter-select mt-2"
        maxlength="200"
        required
        bind:value={name}
      />
    </label>
    <label class="mt-4 block text-sm font-medium">
      Team text
      <textarea
        class="mt-2 min-h-96 w-full rounded-lg border bg-background p-3 font-mono text-xs leading-5"
        maxlength="50000"
        required
        bind:value={paste}></textarea>
    </label>
    <div class="mt-4 flex flex-wrap items-center gap-3">
      <Button type="submit" class="min-h-11">Save custom team</Button>
      <p class="text-xs text-muted-foreground">
        Saves locally as {data.currentRegulation}; legality remains unverified.
      </p>
    </div>
  </form>
  <p role="status" aria-live="polite" class="mt-4 min-h-6 text-sm text-primary">
    {message}
  </p>
</main>
