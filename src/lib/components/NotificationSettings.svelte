<script lang="ts">
  import Modal from './Modal.svelte';
  import PokemonPicker from './PokemonPicker.svelte';
  import SpeciesLabel from './SpeciesLabel.svelte';
  import RemovableChip from './RemovableChip.svelte';
  import { notifiablePokemon } from '#lib/rosters.js';
  import { pokemonId } from '#lib/catalog.js';
  import { catalogState } from '#lib/catalog-runtime.svelte.js';
  import {
    readNotificationSettings,
    writeNotificationSettings,
    type NotificationSettings,
  } from '#lib/catalog-news.js';
  import { syncPushToken } from '#lib/sync.svelte.js';

  let { onclose }: { onclose: () => void } = $props();

  let settings = $state.raw(readNotificationSettings(localStorage));
  let busy = $state(false);
  let message = $state('');

  const available = $derived.by(() => {
    const chosen = new Set(settings.pokemon.map(pokemonId));
    return notifiablePokemon(
      catalogState.catalog.teams,
      catalogState.catalog.currentRegulation
    ).filter((name) => !chosen.has(pokemonId(name)));
  });

  async function save(next: NotificationSettings) {
    const previous = settings;
    busy = true;
    message = '';
    try {
      settings = next;
      writeNotificationSettings(localStorage, next);
      const result = await syncPushToken();
      if (
        ((next.newTeams && !previous.newTeams) ||
          next.pokemon.length > previous.pokemon.length) &&
        !(result?.granted && result.token)
      ) {
        settings = previous;
        writeNotificationSettings(localStorage, previous);
        if (result?.token) await syncPushToken();
        message =
          result && !result.granted
            ? 'Notifications are turned off for this app. Allow them in iPhone Settings, then turn this on again.'
            : 'Notifications could not be turned on. Try again.';
      }
    } catch {
      settings = readNotificationSettings(localStorage);
      message = 'This setting could not be saved.';
    } finally {
      busy = false;
    }
  }
</script>

{#snippet withoutEvs(
  key: 'newTeamsWithoutEvs' | 'pokemonWithoutEvs',
  off: boolean
)}
  <label class="flex min-h-11 cursor-pointer items-center gap-3 ps-8">
    <input
      type="checkbox"
      class="size-5 accent-primary"
      checked={settings[key]}
      disabled={busy || off}
      onchange={(event) =>
        void save({ ...settings, [key]: event.currentTarget.checked })}
    />
    <span>Include teams without EV spreads</span>
  </label>
{/snippet}

<Modal title="Notifications" {onclose}>
  <div class="space-y-5">
    <section>
      <label class="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          class="size-5 accent-primary"
          checked={settings.newTeams}
          disabled={busy}
          onchange={(event) =>
            void save({ ...settings, newTeams: event.currentTarget.checked })}
        />
        <span class="min-w-0">
          <span class="block font-semibold">New teams</span>
          <span class="provenance block"
            >When teams are added to the current regulation.</span
          >
        </span>
      </label>
      {@render withoutEvs('newTeamsWithoutEvs', !settings.newTeams)}
    </section>
    <section class="space-y-2 border-t border-base-300 pt-4">
      <h3 class="font-semibold">Teams with your Pokémon</h3>
      <p class="provenance">
        A separate notification when a new team has any of these Pokémon.
      </p>
      <PokemonPicker
        portal={false}
        options={available}
        onselect={(pokemon) =>
          void save({ ...settings, pokemon: [...settings.pokemon, pokemon] })}
        disabled={busy}
        label="Add a Pokémon to notify about"
        placeholder="Add a Pokémon…"
        disabledPlaceholder="Saving…"
      />
      {#if settings.pokemon.length}
        <ul class="flex flex-wrap items-center gap-2">
          {#each settings.pokemon as pokemon (pokemon)}
            <li class="max-w-full min-w-0">
              <RemovableChip
                label={pokemon}
                disabled={busy}
                onremove={() =>
                  void save({
                    ...settings,
                    pokemon: settings.pokemon.filter(
                      (name) => name !== pokemon
                    ),
                  })}
              >
                <SpeciesLabel {pokemon} spriteSize={24} textClass="truncate" />
              </RemovableChip>
            </li>
          {/each}
        </ul>
      {/if}
      {@render withoutEvs('pokemonWithoutEvs', settings.pokemon.length === 0)}
    </section>
    {#if message}
      <p
        role="alert"
        class="mt-3 text-sm"
        style="color: var(--color-error-content)"
      >
        {message}
      </p>
    {/if}
  </div>
</Modal>
