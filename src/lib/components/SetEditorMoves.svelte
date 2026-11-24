<script lang="ts">
  import Pencil from '@lucide/svelte/icons/pencil';
  import X from '@lucide/svelte/icons/x';
  import { flushSync } from 'svelte';
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
    editingMoveSlot,
    query,
    moveOptions,
    hasMore = false,
    onshowmore,
    error,
    errorField,
    onselect,
    onedit,
    onchange,
    onchoose,
    onclear,
    oncommit,
  }: {
    moves: string[];
    activeMoveSlot: number;
    editingMoveSlot: number | null;
    query: string;
    moveOptions: CatalogSuggestion[];
    hasMore?: boolean;
    onshowmore?: () => void;
    error: string;
    errorField: EditableSetField | null;
    onselect: (index: number) => void;
    onedit: (index: number) => void;
    onchange: (value: string) => void;
    onchoose: (option: CatalogSuggestion) => void;
    onclear: (index: number) => void;
    oncommit: (pickFirst: boolean) => void;
  } = $props();
</script>

<section aria-label="Moves" class="enter-fade grid gap-4">
  <div class="grid gap-2 sm:grid-cols-2">
    {#each moves as move, index (index)}
      {@const type = getMoveType(move)}
      <div
        class="field"
        data-tint={type ?? undefined}
        style:--field-tint={type ? TYPE_COLORS[type] : undefined}
        data-active={index === activeMoveSlot || undefined}
      >
        <span
          class="grid size-7 shrink-0 place-items-center"
          aria-hidden="true"
        >
          <TypeMark {type} size="md" />
        </span>
        {#if editingMoveSlot === index}
          <input
            id={`set-move-${index + 1}`}
            aria-label={`Move ${index + 1}`}
            type="text"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="done"
            class="grow bg-transparent text-sm focus:outline-none"
            placeholder={move || `Move ${index + 1}`}
            value={query}
            oninput={(event) => onchange(event.currentTarget.value)}
            onblur={() => oncommit(false)}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                oncommit(true);
              }
            }}
          />
        {:else}
          <button
            type="button"
            id={`set-move-${index + 1}`}
            class="min-h-11 min-w-0 grow truncate text-start text-sm {move
              ? ''
              : 'text-base-content/60'}"
            aria-pressed={index === activeMoveSlot}
            aria-label={`Select move ${index + 1}${move ? `: ${move}` : ''}`}
            onclick={() => onselect(index)}
            >{move || `Move ${index + 1}`}</button
          >
        {/if}
        <Button
          variant="quiet"
          size="icon-compact"
          aria-label={`Type move ${index + 1}`}
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => {
            onedit(index);
            flushSync();
            document.getElementById(`set-move-${index + 1}`)?.focus();
          }}><Pencil class="size-4" /></Button
        >
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
  {#if error && errorField === 'moves'}
    <p
      role="alert"
      tabindex="-1"
      class="text-body leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {error}
    </p>
  {/if}
  <p class="term">
    {moves[activeMoveSlot]
      ? `Replace ${moves[activeMoveSlot]}`
      : `Choose move ${activeMoveSlot + 1}`}
  </p>
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
          option.totalCount === 0 &&
          !option.original &&
          !option.inGame &&
          !option.favorite
            ? 'Movepool'
            : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        onclick={() => onchoose(option)}
      />
    {/each}
  </SuggestionList>
</section>
