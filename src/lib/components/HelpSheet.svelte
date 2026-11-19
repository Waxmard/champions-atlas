<script lang="ts">
  import Bookmark from '@lucide/svelte/icons/bookmark';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Folder from '@lucide/svelte/icons/folder';
  import Search from '@lucide/svelte/icons/search';
  import { onMount } from 'svelte';
  import Modal from '#lib/components/Modal.svelte';
  import {
    closeHelp,
    help,
    openHelp,
    type HelpTopic,
  } from '#lib/help.svelte.js';
  import { sync } from '#lib/sync.svelte.js';

  const helpSeenKey = 'champions-atlas:help-seen:v1';
  const topics: { id: HelpTopic; title: string; body: string }[] = [
    {
      id: 'regulation',
      title: 'Regulation',
      body: "The season's rules. They decide which Pokémon are allowed.",
    },
    {
      id: 'evs',
      title: 'EVs',
      body: 'Stat points: 66 per Pokémon, up to 32 in one stat.',
    },
    {
      id: 'nature',
      title: 'Nature',
      body: 'Raises one stat by 10% and lowers another.',
    },
    {
      id: 'vp',
      title: 'VP',
      body: 'The in-game cost of changing a Pokémon. Estimated spend is roughly what this team would cost you.',
    },
    {
      id: 'in-game',
      title: 'In-game set',
      body: 'How a Pokémon is built in your game right now.',
    },
    {
      id: 'replica',
      title: 'Replica code',
      body: 'Enter it under Replica Teams in the game to copy a team.',
    },
  ];
  const tabs = [
    { icon: Search, name: 'Browse', text: 'Find teams players shared.' },
    { icon: Folder, name: 'Saved', text: 'Edit your teams and track wins.' },
    { icon: Bookmark, name: 'Wishlist', text: 'Bookmark teams to try.' },
  ];
  const topic = $derived(topics.find(({ id }) => id === help.topic));

  onMount(() => {
    try {
      if (localStorage.getItem(helpSeenKey)) return;
      localStorage.setItem(helpSeenKey, '1');
    } catch {
      return;
    }
    openHelp();
  });
</script>

{#snippet email()}<a
    class="link"
    rel="external"
    href="mailto:maxward4@gmail.com">maxward4@gmail.com</a
  >{/snippet}

{#snippet more(label: string)}
  <summary
    class="option-row -mx-3 cursor-pointer list-none rounded-[var(--radius-field)] font-semibold [&::-webkit-details-marker]:hidden"
  >
    <span class="flex-1">{label}</span>
    <ChevronDown
      class="size-4 transition-transform group-open:rotate-180"
      aria-hidden="true"
    />
  </summary>
{/snippet}

{#if help.open}
  <Modal title={topic?.title ?? 'How it works'} onclose={closeHelp}>
    {#if topic}
      <p class="text-[0.9375rem] leading-relaxed">{topic.body}</p>
    {:else}
      <ul class="space-y-3">
        {#each tabs as { icon: Icon, name, text } (name)}
          <li class="flex items-center gap-3">
            <Icon
              class="size-5 shrink-0 text-base-content/70"
              aria-hidden="true"
            />
            <div>
              <p class="leading-tight font-bold">{name}</p>
              <p class="text-sm text-base-content/70">{text}</p>
            </div>
          </li>
        {/each}
      </ul>
      <details class="group mt-3">
        {@render more('Glossary')}
        <dl class="space-y-2 pb-2">
          {#each topics as { id, title, body } (id)}
            <div>
              <dt class="font-bold">{title}</dt>
              <dd class="text-sm text-base-content/70">{body}</dd>
            </div>
          {/each}
        </dl>
      </details>
      <details class="group">
        {@render more('About')}
        <div class="space-y-2 text-sm text-base-content/70">
          <p>
            Independent fan project, not affiliated with Nintendo, Game Freak,
            or The Pokémon Company.
          </p>
          {#if sync.configured}
            <p>
              Your teams sync to your account. No ads or analytics. To delete
              your account, email {@render email()}.
            </p>
          {:else}
            <p>Everything you save stays on this device.</p>
          {/if}
          <p>Feedback: {@render email()}</p>
          <p class="provenance">Version {__APP_VERSION__}</p>
        </div>
      </details>
    {/if}
  </Modal>
{/if}
