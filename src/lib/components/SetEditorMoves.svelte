<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import type { Member } from '#lib/catalog.js';
  import type { CurrentSetChoice } from '#lib/current-sets.js';
  import TypeMark from '#lib/components/TypeMark.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { CatalogSuggestion } from '#lib/workbench.js';
  import { getMoveType, TYPE_COLORS } from '#lib/types.js';
  let {
    moves,
    activeMoveSlot,
    activeSuggestions,
    moveOptions,
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
    activeSuggestions: string | null;
    moveOptions: CatalogSuggestion[];
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
      {@const typeColor = type ? TYPE_COLORS[type] : null}
      <div
        class="input flex min-h-11 items-center gap-2 border transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary {activeMoveSlot ===
        index
          ? 'border-primary'
          : 'border-base-content/55 hover:border-base-content/80'}"
        style={typeColor ? `border-left: 4px solid ${typeColor};` : ''}
      >
        <span class="term w-4 text-center tabular-nums">{index + 1}</span>
        <TypeMark {type} size="md" />
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
          onblur={(event) => {
            if (!(
              event.relatedTarget instanceof HTMLElement &&
              event.relatedTarget.closest('[data-move-choice]')
            ))
              oncommit();
          }}
          onkeydown={(event) => {
            if (event.key === 'Enter' && !event.isComposing) {
              event.preventDefault();
              oncommit();
            }
          }}
        />
        <Button
          variant="quiet"
          size="icon-touch"
          class="-mr-2"
          aria-label={`Clear move ${index + 1}`}
          tabindex={0}
          disabled={!move}
          data-move-choice
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => onclear(index)}><X class="size-4" /></Button
        >
      </div>
    {/each}
  </div>
  {#if activeSuggestions === `move-${activeMoveSlot}`}
    <section
      aria-label="Move suggestions"
      class="plate max-h-60 divide-y overflow-y-auto"
    >
      <div class="term px-3 py-1.5">Move {activeMoveSlot + 1} suggestions</div>
      <ul role="list" class="divide-y">
        {#each moveOptions as option (option.value)}
          {@const optionType = getMoveType(option.value)}
          {@const optionColor = optionType ? TYPE_COLORS[optionType] : null}
          <li>
            <button
              type="button"
              data-move-choice
              onpointerdown={(event) => event.preventDefault()}
              class="option-row"
              style={optionColor
                ? `border-left: 3px solid ${optionColor};`
                : ''}
              onclick={() => {
                if (option.inGame) {
                  if (inGameMember)
                    oningame(
                      {
                        kind: 'move',
                        index: activeMoveSlot,
                        move: option.value,
                      },
                      inGameMember
                    );
                } else onchoose(activeMoveSlot, option.value);
              }}
              ><TypeMark type={optionType} size="md" /><span class="value"
                >{option.value}</span
              >{#if option.original || option.inGame}<span class="provenance"
                  >{option.original
                    ? option.inGame
                      ? 'Original · In-game'
                      : 'Original'
                    : 'In-game'}</span
                >{/if}</button
            >
          </li>
        {:else}
          <li class="provenance p-3">No matching move suggestions.</li>
        {/each}
      </ul>
    </section>
  {/if}
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
