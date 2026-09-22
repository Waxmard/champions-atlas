<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import type { EditableSetField } from '$lib/components/MemberCard.svelte';
  import { NATURES } from '$lib/paste';

  interface Props {
    item: string;
    ability: string;
    nature: string;
    activeSuggestions: string | null;
    filteredItems: Array<{ value: string }>;
    filteredAbilities: Array<{ value: string }>;
    legacyNature: string | null;
    error: string;
    errorField: EditableSetField | null;
    onitemchange: (val: string) => void;
    onabilitychange: (val: string) => void;
    onnaturechange: (val: string) => void;
    onopensuggestions: (field: string) => void;
    onclearsuggestions: () => void;
    onclearerror: () => void;
  }

  let {
    item = $bindable(),
    ability = $bindable(),
    nature = $bindable(),
    activeSuggestions,
    filteredItems,
    filteredAbilities,
    legacyNature,
    error,
    errorField,
    onitemchange,
    onabilitychange,
    onnaturechange,
    onopensuggestions,
    onclearsuggestions,
    onclearerror,
  }: Props = $props();
</script>

<section class="grid gap-5">
  <div class="grid gap-4 sm:grid-cols-2">
    <!-- Item -->
    <div class="min-w-0">
      <label for="set-item-input" class="term">Item</label>
      <div
        class="input mt-1.5 flex min-h-11 items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
      >
        <ItemIcon {item} size={20} />
        <input
          id="set-item-input"
          aria-label="Item"
          class="grow bg-transparent text-sm focus:outline-none"
          placeholder="Custom item"
          value={item}
          onfocus={() => onopensuggestions('item')}
          onclick={() => onopensuggestions('item')}
          oninput={(e) => onitemchange(e.currentTarget.value)}
        />
        {#if item}
          <button
            type="button"
            class="btn -mr-2 size-11 min-h-11 min-w-11 btn-ghost p-0 btn-xs"
            aria-label="Clear item"
            tabindex={activeSuggestions === 'item' ? -1 : 0}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onitemchange('');
            }}
          >
            <X class="size-4" />
          </button>
        {/if}
      </div>

      {#if activeSuggestions === 'item'}
        <section
          aria-label="Item suggestions"
          class="plate mt-2 grid max-h-60 divide-y overflow-y-auto"
        >
          {#each filteredItems as opt (opt.value)}
            <button
              type="button"
              class="flex min-h-11 items-center gap-2 px-3 text-left text-sm hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary"
              onclick={() => {
                onitemchange(opt.value);
                onclearsuggestions();
              }}
            >
              <ItemIcon item={opt.value} size={20} />
              <span class="value">{opt.value}</span>
            </button>
          {:else}
            <p class="provenance p-3">No matching suggestions.</p>
          {/each}
        </section>
      {/if}
    </div>

    <!-- Ability -->
    <div class="min-w-0">
      <label for="set-ability-input" class="term">Ability</label>
      <div
        class="input mt-1.5 flex min-h-11 items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
      >
        <input
          id="set-ability-input"
          aria-label="Ability"
          class="grow bg-transparent text-sm focus:outline-none"
          placeholder="Custom ability"
          value={ability}
          onfocus={() => onopensuggestions('ability')}
          onclick={() => onopensuggestions('ability')}
          oninput={(e) => onabilitychange(e.currentTarget.value)}
        />
        {#if ability}
          <button
            type="button"
            class="btn -mr-2 size-11 min-h-11 min-w-11 btn-ghost p-0 btn-xs"
            aria-label="Clear ability"
            tabindex={activeSuggestions === 'ability' ? -1 : 0}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onabilitychange('');
            }}
          >
            <X class="size-4" />
          </button>
        {/if}
      </div>

      {#if activeSuggestions === 'ability'}
        <section
          aria-label="Ability suggestions"
          class="plate mt-2 grid max-h-60 divide-y overflow-y-auto"
        >
          {#each filteredAbilities as opt (opt.value)}
            <button
              type="button"
              class="min-h-11 px-3 text-left text-sm hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary"
              onclick={() => {
                onabilitychange(opt.value);
                onclearsuggestions();
              }}
            >
              {opt.value}
            </button>
          {:else}
            <p class="provenance p-3">No matching suggestions.</p>
          {/each}
        </section>
      {/if}
    </div>

    <!-- Nature -->
    <div class="min-w-0 sm:col-span-2">
      <label for="set-nature-input" class="term">Nature</label>
      <select
        id="set-nature-input"
        aria-label="Nature"
        class="select mt-1.5 min-h-11 w-full text-sm"
        value={nature}
        onfocus={onclearsuggestions}
        onchange={(e) => {
          onnaturechange(e.currentTarget.value);
          onclearerror();
        }}
      >
        {#if legacyNature}
          <option value={legacyNature}>{legacyNature}</option>
        {/if}
        {#each NATURES as n (n)}
          <option value={n}>{n}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if error && (errorField === 'item' || errorField === 'ability' || errorField === 'nature')}
    <p
      role="alert"
      class="text-[0.9375rem] leading-relaxed"
      style="color: var(--color-error-content)"
    >
      {error}
    </p>
  {/if}
</section>
