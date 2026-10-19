<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { normalize, type Member } from '$lib/catalog';
  import type { CurrentSetChoice } from '$lib/current-sets';
  import type { CatalogSuggestion } from '$lib/workbench';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import { NATURES } from '$lib/paste';

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

<section class="grid gap-5">
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="min-w-0">
      <label for="set-item-input" class="term">Item</label>
      <div
        class="input mt-1.5 flex min-h-11 items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
      >
        <ItemIcon {item} size={20} />
        <input
          id="set-item-input"
          aria-label="Item"
          role="combobox"
          aria-expanded={activeSuggestions === 'item'}
          aria-controls="set-item-suggestions"
          class="grow bg-transparent text-sm focus:outline-none"
          placeholder="Custom item"
          value={item}
          onfocus={() => onopensuggestions('item')}
          onclick={() => onopensuggestions('item')}
          oninput={(e) => onitemchange(e.currentTarget.value)}
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
        {#if item}
          <Button
            variant="quiet"
            size="icon-touch"
            class="-mr-2"
            aria-label="Clear item"
            tabindex={0}
            data-detail-choice
            onpointerdown={(event) => event.preventDefault()}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onitemchange('');
              oncommit();
            }}
          >
            <X class="size-4" />
          </Button>
        {/if}
      </div>

      {#if activeSuggestions === 'item'}
        <section
          id="set-item-suggestions"
          aria-label="Item suggestions"
          class="plate mt-2 max-h-60 overflow-y-auto"
        >
          <ul role="list" class="divide-y">
            {#each filteredItems as opt (opt.value)}
              <li>
                <button
                  type="button"
                  class="option-row"
                  data-detail-choice
                  onpointerdown={(event) => event.preventDefault()}
                  onclick={() => {
                    if (opt.inGame) {
                      if (inGameMember)
                        oningame({ kind: 'item' }, inGameMember);
                      return;
                    }
                    onitemchange(opt.value);
                    onclearsuggestions();
                    oncommit();
                  }}
                >
                  <ItemIcon item={opt.value} size={20} />
                  <span class="value">{opt.value}</span>
                  {#if opt.original || opt.inGame}<span class="provenance"
                      >{opt.original
                        ? opt.inGame
                          ? 'Original · In-game'
                          : 'Original'
                        : 'In-game'}</span
                    >{/if}
                </button>
              </li>
            {:else}
              <li class="provenance p-3">No matching suggestions.</li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <div class="min-w-0">
      <label for="set-ability-input" class="term">Ability</label>
      <div
        class="input mt-1.5 flex min-h-11 items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
      >
        <input
          id="set-ability-input"
          aria-label="Ability"
          role="combobox"
          aria-expanded={activeSuggestions === 'ability'}
          aria-controls="set-ability-suggestions"
          class="grow bg-transparent text-sm focus:outline-none"
          placeholder="Custom ability"
          value={ability}
          onfocus={() => onopensuggestions('ability')}
          onclick={() => onopensuggestions('ability')}
          oninput={(e) => onabilitychange(e.currentTarget.value)}
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
        {#if ability}
          <Button
            variant="quiet"
            size="icon-touch"
            class="-mr-2"
            aria-label="Clear ability"
            tabindex={0}
            data-detail-choice
            onpointerdown={(event) => event.preventDefault()}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onabilitychange('');
              oncommit();
            }}
          >
            <X class="size-4" />
          </Button>
        {/if}
      </div>

      {#if activeSuggestions === 'ability'}
        <section
          id="set-ability-suggestions"
          aria-label="Ability suggestions"
          class="plate mt-2 max-h-60 overflow-y-auto"
        >
          <ul role="list" class="divide-y">
            {#each filteredAbilities as opt (opt.value)}
              <li>
                <button
                  type="button"
                  class="option-row"
                  data-detail-choice
                  onpointerdown={(event) => event.preventDefault()}
                  onclick={() => {
                    if (opt.inGame) {
                      if (inGameMember)
                        oningame({ kind: 'ability' }, inGameMember);
                      return;
                    }
                    onabilitychange(opt.value);
                    onclearsuggestions();
                    oncommit();
                  }}
                >
                  {opt.value}{#if opt.original || opt.inGame}<span
                      class="provenance ml-2"
                      >{opt.original
                        ? opt.inGame
                          ? 'Original · In-game'
                          : 'Original'
                        : 'In-game'}</span
                    >{/if}
                </button>
              </li>
            {:else}
              <li class="provenance p-3">No matching suggestions.</li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <div class="min-w-0 sm:col-span-2">
      <label for="set-nature-input" class="term">Nature</label>
      <select
        id="set-nature-input"
        aria-label="Nature"
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
