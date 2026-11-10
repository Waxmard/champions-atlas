<script lang="ts">
  import { Popover } from 'bits-ui';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { rankSavedTeams, savedTeamHeading } from '#lib/team-collections.js';
  import type { SavedTeam } from '#lib/workbench.js';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    teams,
    value,
    onselect,
    disabled = false,
  }: {
    teams: SavedTeam[];
    value: string;
    onselect: (id: string) => Promise<boolean>;
    disabled?: boolean;
  } = $props();
  let open = $state(false),
    query = $state(''),
    busy = $state(false);
  let trigger = $state<HTMLElement | null>(null);
  const selected = $derived(teams.find((team) => team.id === value));
  const heading = $derived(selected ? savedTeamHeading(selected) : null);
  const options = $derived(rankSavedTeams(teams, query));
  const roster = (team: SavedTeam) =>
    team.members.map((member) => member.pokemon);

  async function choose(next: string) {
    if (busy) return;
    if (next === value) {
      open = false;
      return;
    }
    busy = true;
    try {
      await onselect(next);
    } finally {
      busy = false;
      open = false;
    }
  }

  export function focus() {
    trigger?.focus();
  }
</script>

<Popover.Root
  bind:open
  onOpenChange={(isOpen) => {
    if (!isOpen) query = '';
  }}
>
  <h2 class="min-w-0">
    <Popover.Trigger
      bind:ref={trigger}
      {disabled}
      aria-label={heading
        ? `Switch team, currently ${heading.title}`
        : 'Choose saved team'}
      class="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-field)] text-start disabled:pointer-events-none disabled:opacity-50"
    >
      <span class="min-w-0">
        <span
          class="line-clamp-2 text-xl leading-tight font-extrabold wrap-anywhere landscape:md:text-base"
          >{heading?.title ?? 'Choose saved team'}</span
        >
        {#if heading?.context}<span
            class="provenance line-clamp-1 wrap-anywhere"
            >{heading.context}</span
          >{/if}
      </span>
      <ChevronDown
        class="size-5 shrink-0 text-[color:var(--color-muted)]"
        aria-hidden="true"
      />
    </Popover.Trigger>
  </h2>
  <Popover.Portal>
    <Popover.Content
      role="dialog"
      aria-label="Saved teams"
      align="start"
      sideOffset={6}
      trapFocus={false}
      onOpenAutoFocus={(event) => event.preventDefault()}
      class="surface picker-popover-enter z-50 flex max-h-[min(26rem,calc(100dvh-12rem))] w-[calc(100vw-2rem)] max-w-sm flex-col p-1 text-base-content shadow-lg outline-none"
    >
      <input
        type="search"
        aria-label="Search saved teams"
        placeholder="Search saved teams"
        autocomplete="off"
        class="input mb-1 min-h-11 w-full shrink-0 text-base"
        bind:value={query}
      />
      <ul role="list" class="min-h-0 overflow-y-auto overscroll-contain">
        {#each options as team (team.id)}
          {@const option = savedTeamHeading(team)}
          <li class="border-b border-base-300 last:border-b-0">
            <button
              type="button"
              class="option-row w-full py-1.5"
              aria-current={team.id === value ? 'true' : undefined}
              aria-label={`${option.title}${option.context ? `, ${option.context}` : ''}: ${roster(team).join(', ')}`}
              disabled={busy}
              onclick={() => choose(team.id)}
            >
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="flex flex-wrap gap-1" aria-hidden="true">
                  {#each roster(team) as pokemon, slot (slot)}
                    <PokemonSprite {pokemon} size={32} />
                  {/each}
                </span>
                <span
                  class="text-[0.8125rem] leading-tight wrap-break-word {team.id ===
                  value
                    ? 'font-bold'
                    : 'text-base-content/70'}">{option.title}</span
                >
                {#if option.context}<span class="provenance wrap-anywhere"
                    >{option.context}</span
                  >{/if}
              </span>
              {#if team.id === value}<Check
                  class="size-4 shrink-0"
                  aria-hidden="true"
                />{/if}
            </button>
          </li>
        {:else}
          <li class="p-3 text-sm text-base-content/70">No matching teams.</li>
        {/each}
      </ul>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
