<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button';
  import TypeMark from '$lib/components/TypeMark.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import type { CatalogSuggestion } from '$lib/workbench';
  import { getMoveType, TYPE_COLORS } from '$lib/types';
  let {
    moves,
    activeMoveSlot,
    activeSuggestions,
    moveOptions,
    error,
    errorField,
    onfocus,
    onchange,
    onchoose,
    onclear,
    oncommit,
  }: {
    moves: string[];
    activeMoveSlot: number;
    activeSuggestions: string | null;
    moveOptions: CatalogSuggestion[];
    error: string;
    errorField: EditableSetField | null;
    onfocus: (index: number) => void;
    onchange: (index: number, value: string) => void;
    onchoose: (index: number, value: string) => void;
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
        class="atlas-field flex min-h-11 items-center gap-2 border transition-colors {activeMoveSlot ===
        index
          ? 'border-primary'
          : 'border-base-content/55 hover:border-base-content/80'}"
        style={typeColor ? `border-left: 4px solid ${typeColor};` : ''}
      >
        <span class="value w-4 text-center text-base-content/60"
          >{index + 1}</span
        >
        <TypeMark {type} size="md" />
        <input
          id={`set-move-${index + 1}`}
          aria-label={`Move ${index + 1}`}
          type="text"
          tabindex={activeSuggestions !== null && activeMoveSlot !== index
            ? -1
            : 0}
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
          type="button"
          variant="ghost"
          size="icon"
          class="-mr-2"
          aria-label={`Clear move ${index + 1}`}
          tabindex={activeSuggestions !== null ? -1 : 0}
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
              class="flex min-h-11 items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary"
              style={optionColor
                ? `border-left: 3px solid ${optionColor};`
                : ''}
              onclick={() => onchoose(activeMoveSlot, option.value)}
              ><TypeMark type={optionType} size="md" /><span class="value"
                >{option.value}</span
              >{#if option.original}<span class="provenance">Original</span
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
