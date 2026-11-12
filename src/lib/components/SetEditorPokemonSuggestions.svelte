<script lang="ts">
  import { tick } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import SetPreview from '#lib/components/SetPreview.svelte';
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { type Member } from '#lib/catalog.js';
  import type { PokemonSuggestion } from '#lib/swap-suggestions.js';

  let {
    pokemon = $bindable(),
    accepted,
    options,
    hasMore = false,
    favoriteSlotSets = [],
    error = '',
    errorField = null,
    onshowmore,
    onchoose,
    onresetquery,
    oninputchange,
    oncommit,
  }: {
    pokemon: string;
    accepted: string;
    options: PokemonSuggestion[];
    hasMore?: boolean;
    favoriteSlotSets?: {
      member: Member;
      teamName: string;
      reason: string;
      key: string;
    }[];
    error?: string;
    errorField?: EditableSetField | null;
    onshowmore?: () => void;
    onchoose: (member: Member) => void;
    onresetquery: () => void;
    oninputchange: (value: string) => void;
    oncommit: (blurOnSuccess?: boolean) => boolean;
  } = $props();
  const optionKey = (option: PokemonSuggestion) =>
    `${option.favorite ? 'fav:' + (option.favoriteTeamName ?? '') : 'cat'}:${option.pokemon}:${option.member.item ?? ''}:${option.member.ability ?? ''}:${option.member.nature ?? ''}:${option.member.spread ?? ''}:${option.member.moves.join(',')}`;
  const favoriteLabel = (option: PokemonSuggestion) =>
    option.favorite
      ? option.favoriteTeamName
        ? `Favorite (${option.favoriteTeamName})`
        : 'Favorite'
      : '';
  let preview = $state.raw<{ member: Member; title: string } | null>(null);
  let section = $state<HTMLElement>();
  let listScroll = 0;
  let typed = '';

  function openPreview(member: Member, note: string) {
    listScroll = section?.parentElement?.scrollTop ?? 0;
    typed = pokemon;
    pokemon = accepted;
    preview = {
      member,
      title: [`Replaces ${accepted}`, note].filter(Boolean).join(' · '),
    };
  }
  function closePreview(restore: boolean) {
    const scroller = section?.parentElement;
    const top = restore ? listScroll : 0;
    if (restore) pokemon = typed;
    preview = null;
    void tick().then(() => {
      if (scroller) scroller.scrollTop = top;
    });
  }
  function applyPreview() {
    if (!preview) return;
    onchoose(preview.member);
    closePreview(false);
  }
</script>

{#if preview}
  <SetPreview
    title={preview.title}
    member={preview.member}
    onback={() => closePreview(true)}
    onapply={applyPreview}
  />
{/if}

<section bind:this={section} hidden={!!preview} class="grid gap-4">
  <label for="set-pokemon-input" class="sr-only">Pokémon</label>
  <label class="field">
    <PokemonSprite {pokemon} size={28} />
    <input
      id="set-pokemon-input"
      aria-label="Pokémon"
      class="grow bg-transparent text-sm focus:outline-none"
      placeholder="Pokémon"
      bind:value={pokemon}
      onfocus={onresetquery}
      onclick={onresetquery}
      oninput={(event) => oninputchange(event.currentTarget.value)}
      onblur={() => {
        if (!preview) oncommit(false);
      }}
      onkeydown={(event) => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          oncommit(true);
        }
      }}
    />
    {#if pokemon !== accepted}
      <Button
        variant="quiet"
        size="icon-compact"
        class="-me-2"
        aria-label={`Revert Pokémon to ${accepted}`}
        onpointerdown={(event) => event.preventDefault()}
        onclick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          oninputchange(accepted);
          oncommit(true);
        }}
      >
        <X class="size-4" />
      </Button>
    {/if}
  </label>
  <p class="provenance">
    Tap a suggested Pokémon to preview its set before applying it.
  </p>
  {#if favoriteSlotSets.length}
    <SuggestionList
      id="set-favorite-sets"
      label="Favorite sets for this Pokémon"
      count={favoriteSlotSets.length}
    >
      {#each favoriteSlotSets as fav (fav.key)}
        <SuggestionRow
          label={`Preview favorite ${fav.member.pokemon} set from ${fav.teamName}`}
          glyph={{ kind: 'pokemon', value: fav.member.pokemon }}
          primary={fav.member.pokemon}
          secondary={[
            'Favorite',
            fav.teamName,
            fav.member.item,
            fav.member.ability,
            fav.member.nature,
          ]
            .filter(Boolean)
            .join(' · ')}
          disabled={!!fav.reason}
          onclick={() => openPreview(fav.member, `Favorite (${fav.teamName})`)}
        />
      {/each}
    </SuggestionList>
  {/if}
  <SuggestionList
    id="set-pokemon-suggestions"
    label="Pokémon suggestions"
    count={options.length}
    {hasMore}
    {onshowmore}
  >
    {#each options as option (optionKey(option))}
      <SuggestionRow
        label={`Preview ${option.pokemon} set`}
        glyph={{ kind: 'pokemon', value: option.pokemon }}
        primary={option.pokemon}
        secondary={[
          favoriteLabel(option),
          option.member.item,
          option.member.ability,
          option.member.nature,
        ]
          .filter(Boolean)
          .join(' · ')}
        onclick={() => openPreview(option.member, favoriteLabel(option))}
      />
    {/each}
  </SuggestionList>
  {#if error && errorField === 'pokemon'}
    <p
      role="alert"
      tabindex="-1"
      class="text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {error}
    </p>
  {/if}
</section>
