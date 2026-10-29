<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { normalize, type Member } from '#lib/catalog.js';
  import type { CurrentSetChoice } from '#lib/current-sets.js';
  import type { CatalogSuggestion } from '#lib/workbench.js';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { NATURES } from '#lib/paste.js';

  interface Props {
    item: string;
    ability: string;
    nature: string;
    activeSuggestions: string | null;
    filteredItems: CatalogSuggestion[];
    filteredAbilities: CatalogSuggestion[];
    inGameMember?: Member;
    legacyNature: string | null;
    error: string;
    errorField: EditableSetField | null;
    onitemchange: (val: string) => void;
    onabilitychange: (val: string) => void;
    onnaturechange: (val: string) => void;
    oningame: (choice: CurrentSetChoice, displayed: Member) => void;
    onopensuggestions: (field: string) => void;
    onclearsuggestions: () => void;
    onclearerror: () => void;
    oncommit: () => void;
  }

  let {
    item,
    ability,
    nature,
    activeSuggestions,
    filteredItems,
    filteredAbilities,
    inGameMember,
    legacyNature,
    error,
    errorField,
    onitemchange,
    onabilitychange,
    onnaturechange,
    oningame,
    onopensuggestions,
    onclearsuggestions,
    onclearerror,
    oncommit,
  }: Props = $props();
  const inGameNature = $derived(
    NATURES.find(
      (value) => normalize(value) === normalize(inGameMember?.nature ?? '')
    ) ?? null
  );
</script>

{#snippet detailField(
  field: 'item' | 'ability',
  label: string,
  value: string,
  placeholder: string,
  onvaluechange: (value: string) => void,
  options: CatalogSuggestion[]
)}
  <label for={`set-${field}-input`} class="term">{label}</label>
  <div
    class="input mt-1.5 flex min-h-11 items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
  >
    {#if field === 'item'}
      <ItemIcon item={value} size={20} />
    {/if}
    <input
      id={`set-${field}-input`}
      class="grow bg-transparent text-sm focus:outline-none"
      {placeholder}
      {value}
      onfocus={() => onopensuggestions(field)}
      onclick={() => onopensuggestions(field)}
      oninput={(event) => onvaluechange(event.currentTarget.value)}
      onblur={(event) => {
        if (!(
          event.relatedTarget instanceof HTMLElement &&
          event.relatedTarget.closest('[data-detail-choice]')
        ))
          oncommit();
      }}
      onkeydown={(event) => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          onclearsuggestions();
          oncommit();
        }
      }}
    />
    {#if value}
      <Button
        variant="quiet"
        size="icon-compact"
        class="-me-2"
        aria-label={`Clear ${field}`}
        data-detail-choice
        onpointerdown={(event) => event.preventDefault()}
        onclick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onvaluechange('');
          oncommit();
        }}
      >
        <X class="size-4" />
      </Button>
    {/if}
  </div>

  {#if activeSuggestions === field}
    <section
      id={`set-${field}-suggestions`}
      aria-label={`${label} suggestions`}
      class="plate mt-2 max-h-60 overflow-y-auto"
    >
      <ul role="list" class="divide-y">
        {#each options as opt (opt.value)}
          <li>
            <button
              type="button"
              class="option-row"
              data-detail-choice
              onpointerdown={(event) => event.preventDefault()}
              onclick={() => {
                if (opt.inGame) {
                  if (inGameMember) oningame({ kind: field }, inGameMember);
                  return;
                }
                onvaluechange(opt.value);
                onclearsuggestions();
                oncommit();
              }}
            >
              {#if field === 'item'}
                <ItemIcon item={opt.value} size={20} />
                <span class="value">{opt.value}</span>
              {:else}
                {opt.value}
              {/if}
              {#if opt.original || opt.inGame}
                <span class="provenance" class:ms-2={field === 'ability'}>
                  {opt.original
                    ? opt.inGame
                      ? 'Original · In-game'
                      : 'Original'
                    : 'In-game'}
                </span>
              {/if}
            </button>
          </li>
        {:else}
          <li class="provenance p-3">No matching suggestions.</li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

<section class="grid gap-5">
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="min-w-0">
      {@render detailField(
        'item',
        'Item',
        item,
        'Custom item',
        onitemchange,
        filteredItems
      )}
    </div>

    <div class="min-w-0">
      {@render detailField(
        'ability',
        'Ability',
        ability,
        'Custom ability',
        onabilitychange,
        filteredAbilities
      )}
    </div>

    <div class="min-w-0 sm:col-span-2">
      <label for="set-nature-input" class="term">Nature</label>
      <select
        id="set-nature-input"
        class="select mt-1.5 min-h-11 w-full text-sm"
        value={nature}
        onfocus={onclearsuggestions}
        onchange={(e) => {
          const selected = e.currentTarget.value;
          if (selected === inGameNature) {
            if (inGameMember) oningame({ kind: 'nature' }, inGameMember);
            e.currentTarget.value = nature;
            return;
          }
          onnaturechange(selected);
          onclearerror();
          oncommit();
        }}
      >
        <option value="">Unknown</option>
        {#if legacyNature}
          <option value={legacyNature}>{legacyNature}</option>
        {/if}
        {#if inGameNature && inGameMember}
          <option value={inGameNature}>{inGameNature} — In-game</option>
        {/if}
        {#each NATURES as n (n)}
          {#if n !== inGameNature}<option value={n}>{n}</option>{/if}
        {/each}
      </select>
    </div>
  </div>

  {#if error && (errorField === 'item' || errorField === 'ability' || errorField === 'nature')}
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
