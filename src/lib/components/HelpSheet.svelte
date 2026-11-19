<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '#lib/components/Modal.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    closeHelp,
    help,
    openHelp,
    type HelpTopic,
  } from '#lib/help.svelte.js';
  import { sync } from '#lib/sync.svelte.js';
  import { VP_COSTS } from '#lib/vp-cost.js';

  const helpSeenKey = 'champions-atlas:help-seen:v1';
  const topics: { id: HelpTopic; title: string; body: string }[] = [
    {
      id: 'regulation',
      title: 'Regulation',
      body: 'The rule set for a season of official play. It decides which Pokémon are allowed. Each team shows the regulation it was built for.',
    },
    {
      id: 'set',
      title: 'Set',
      body: 'How one Pokémon is built: its held item, ability, nature, EVs, and four moves.',
    },
    {
      id: 'evs',
      title: 'EVs',
      body: 'Stat points. Each Pokémon has 66 to spend, with at most 32 in one stat. An EV spread is how those points are divided. The stats are HP, Atk (Attack), Def (Defense), SpA (Special Attack), SpD (Special Defense), and Spe (Speed).',
    },
    {
      id: 'nature',
      title: 'Nature',
      body: 'Raises one stat by 10% and lowers another by 10%. A neutral nature changes nothing.',
    },
    {
      id: 'mega',
      title: 'Mega',
      body: 'A Pokémon holding its Mega Stone can Mega Evolve during a battle. Searching for a Pokémon also finds teams that use its Mega form.',
    },
    {
      id: 'vp',
      title: 'VP and estimated spend',
      body: `VP (Victory Points) is what Pokémon Champions charges to change a Pokémon's moves, ability, nature, or stat points. Estimated spend is roughly how much VP a team would cost you, based on your in-game sets. Items are not counted, and a Pokémon with no in-game set counts as ${VP_COSTS.unrecorded.toLocaleString('en-US')} VP.`,
    },
    {
      id: 'in-game',
      title: 'In-game set',
      body: 'Your note of how a Pokémon is built in your own game right now. Record one from a team in Saved. The app uses it to estimate VP and to suggest your own builds while you edit. Recording never changes Pokémon Champions.',
    },
    {
      id: 'replica',
      title: 'Replica code',
      body: 'A code a player shared from Pokémon Champions. Enter it under Replica Teams in the game to copy that team. Editing a team here does not create a new code.',
    },
    {
      id: 'pokepaste',
      title: 'Poképaste',
      body: 'A website, pokepast.es, where players share a team as text. Add one from the Wishlist tab.',
    },
    {
      id: 'showdown',
      title: 'Pokémon Showdown',
      body: 'A free online battle simulator. Its team text is the usual way to share a team.',
    },
    {
      id: 'record',
      title: 'Win–loss record',
      body: 'On a team in Saved, tap Win or Loss after each game. The percentage is the share of games you won.',
    },
    {
      id: 'new',
      title: 'Blue dot',
      body: 'Marks a team added in the latest update.',
    },
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

{#if help.open}
  <Modal title={topic?.title ?? 'Help'} onclose={closeHelp}>
    {#if topic}
      <p class="text-[0.9375rem] leading-relaxed">{topic.body}</p>
      <Button variant="quiet" class="-ms-3 mt-3" onclick={() => openHelp()}>
        All help
      </Button>
    {:else}
      <section class="text-[0.9375rem] leading-relaxed">
        <h3 class="text-base leading-tight font-extrabold">How it works</h3>
        <p class="mt-2">
          Champion's Atlas collects Pokémon Champions doubles teams that players
          have published, from tournaments, online ladders, and video creators.
        </p>
        <ul class="mt-2 space-y-2">
          <li>
            <span class="font-bold">Browse</span> Find a team. Add Pokémon to the
            search to see only teams that use all of them, then tap a team to see
            how each Pokémon is built.
          </li>
          <li>
            <span class="font-bold">Wishlist</span> Bookmark teams you might want
            to try.
          </li>
          <li>
            <span class="font-bold">Saved</span> Keep the teams you play. Change their
            Pokémon, moves, and stats, and track your wins and losses.
          </li>
        </ul>
        <p class="mt-2">
          Nothing you do here changes Pokémon Champions. To play a team, build
          it in the game yourself, or use its replica code when the team has
          one.
        </p>
        <p class="mt-2">
          The app does not check whether a team is legal in a regulation.
        </p>
      </section>
      <section class="mt-6">
        <h3 class="text-base leading-tight font-extrabold">Words you'll see</h3>
        <dl class="mt-2 space-y-3">
          {#each topics as { id, title, body } (id)}
            <div>
              <dt class="font-bold">{title}</dt>
              <dd class="text-[0.9375rem] leading-relaxed text-base-content/70">
                {body}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
      <section class="mt-6 text-[0.9375rem] leading-relaxed">
        <h3 class="text-base leading-tight font-extrabold">About</h3>
        <p class="mt-2">
          Champion's Atlas is an independent fan project. It is not affiliated
          with Nintendo, Game Freak, or The Pokémon Company.
        </p>
        <p class="mt-2">Questions or feedback: {@render email()}</p>
        {#if sync.configured}
          <p class="mt-2">
            If sync fails, choose Copy sync log in the account menu and paste it
            into your email.
          </p>
        {/if}
        <h4 class="mt-3 font-bold">Your data</h4>
        {#if sync.configured}
          <p class="mt-1">
            Signing in with Google gives the app your name, email address, and
            profile picture, so it can show which account is signed in. Your
            Saved and Wishlist teams, win–loss records, in-game sets, and
            regulation choices are stored on this device and in your account, so
            they sync between your devices. If you turn on notifications, a
            notification token for this device and your notification choices are
            stored too. The app has no ads and no analytics. To have your
            account and data deleted, email {@render email()}.
          </p>
        {:else}
          <p class="mt-1">Everything you save stays on this device.</p>
        {/if}
        <p class="provenance mt-3">Version {__APP_VERSION__}</p>
      </section>
    {/if}
  </Modal>
{/if}
