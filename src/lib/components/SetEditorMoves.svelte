<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import type { Member } from '#lib/catalog.js';
  import type { CurrentSetChoice } from '#lib/current-sets.js';
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
  import TypeMark from '#lib/components/TypeMark.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { CatalogSuggestion } from '#lib/workbench.js';
  import { getMoveType, TYPE_COLORS } from '#lib/types.js';
  let {
    moves,
    activeMoveSlot,
    moveOptions,
    hasMore = false,
    onshowmore,
    inGameMember,
    error,
    errorField,
    onfocus,
    onchange,
    onchoose,
    oningame,
    onclear,
    oncommit,
  }: {
    moves: string[];
    activeMoveSlot: number;
    moveOptions: CatalogSuggestion[];
    hasMore?: boolean;
    onshowmore?: () => void;
    inGameMember?: Member;
    error: string;
    errorField: EditableSetField | null;
    onfocus: (index: number) => void;
    onchange: (index: number, value: string) => void;
    onchoose: (index: number, value: string) => void;
    oningame: (choice: CurrentSetChoice, displayed: Member) => void;
    onclear: (index: number) => void;
    oncommit: () => void;
  } = $props();
</script>

<section aria-label="Moves" class="grid gap-4">
  <div class="grid gap-2 sm:grid-cols-2">
    {#each moves as move, index (index)}
      {@const type = getMoveType(move)}
      <div
        class="field"
        data-tint={type ?? undefined}
        style:--field-tint={type ? TYPE_COLORS[type] : undefined}
      >
        <span
          class="grid size-7 shrink-0 place-items-center"
          aria-hidden="true"
        >
          <TypeMark {type} size="md" />
        </span>
        <input
          id={`set-move-${index + 1}`}
          aria-label={`Move ${index + 1}`}
          type="text"
          tabindex={0}
          class="grow bg-transparent text-sm focus:outline-none"
          placeholder={`Move ${index + 1}`}
          value={move}
          onfocus={() => onfocus(index)}
          onclick={() => onfocus(index)}
          oninput={(event) => onchange(index, event.currentTarget.value)}
          onblur={oncommit}
          onkeydown={(event) => {
            if (event.key === 'Enter' && !event.isComposing) {
              event.preventDefault();
              oncommit();
            }
          }}
        />
        <Button
          variant="quiet"
          size="icon-compact"
          class="-me-2"
          aria-label={`Clear move ${index + 1}`}
          tabindex={0}
          disabled={!move}
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => onclear(index)}><X class="size-4" /></Button
        >
      </div>
    {/each}
  </div>
  <SuggestionList
    id="set-move-suggestions"
    label={`Move ${activeMoveSlot + 1} suggestions`}
    count={moveOptions.length}
    {hasMore}
    {onshowmore}
  >
    {#each moveOptions as option (option.value)}
      <SuggestionRow
        label={`Use ${option.value}${option.inGame ? ' in-game' : option.favorite ? ' favorite' : ''}`}
        glyph={{ kind: 'move', value: option.value }}
        primary={option.value}
        secondary={[
          option.original ? 'Original' : '',
          option.inGame ? 'In-game' : '',
          option.favorite ? 'Favorite' : '',
          option.totalCount === 0 ? 'Movepool' : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        onclick={() => {
          if (option.inGame) {
            if (inGameMember)
              oningame(
                { kind: 'move', index: activeMoveSlot, move: option.value },
                inGameMember
              );
          } else onchoose(activeMoveSlot, option.value);
        }}
      />
    {/each}
  </SuggestionList>
  {#if error && errorField === 'moves'}
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
