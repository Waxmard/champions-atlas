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
  <div class="grid gap-4">
    <!-- Item -->
    <div class="min-w-0">
      <label
        for="set-item-input"
        class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
      >
        Item
      </label>
      <label
        class="input mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-base-300"
      >
        {#if item}
          <ItemIcon {item} size={20} />
        {:else}
          <span
            class="flex size-5 shrink-0 items-center justify-center text-sm opacity-40"
            >🎒</span
          >
        {/if}
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
      </label>

      {#if activeSuggestions === 'item'}
        <section
          aria-label="Item suggestions"
          class="mt-2 grid max-h-60 gap-1 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-sm"
        >
          {#each filteredItems as opt (opt.value)}
            <button
              type="button"
              class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
              onclick={() => {
                onitemchange(opt.value);
                onclearsuggestions();
              }}
            >
              <ItemIcon item={opt.value} size={20} />
              <span>{opt.value}</span>
            </button>
          {:else}
            <p class="p-3 text-sm text-base-content/70">
              No matching suggestions.
            </p>
          {/each}
        </section>
      {/if}
    </div>

    <!-- Ability -->
    <div class="min-w-0">
      <label
        for="set-ability-input"
        class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
      >
        Ability
      </label>
      <label
        class="input mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-base-300"
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
      </label>

      {#if activeSuggestions === 'ability'}
        <section
          aria-label="Ability suggestions"
          class="mt-2 grid max-h-60 gap-1 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-sm"
        >
          {#each filteredAbilities as opt (opt.value)}
            <button
              type="button"
              class="min-h-11 rounded-lg px-3 text-left text-sm hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-primary"
              onclick={() => {
                onabilitychange(opt.value);
                onclearsuggestions();
              }}
            >
              {opt.value}
            </button>
          {:else}
            <p class="p-3 text-sm text-base-content/70">
              No matching suggestions.
            </p>
          {/each}
        </section>
      {/if}
    </div>

    <!-- Nature -->
    <div class="min-w-0">
      <label
        for="set-nature-input"
        class="text-xs font-semibold tracking-wider text-base-content/70 uppercase"
      >
        Nature
      </label>
      <select
        id="set-nature-input"
        aria-label="Nature"
        class="select mt-1.5 min-h-11 w-full rounded-xl border border-base-300 text-sm"
        value={nature}
        onfocus={onclearsuggestions}
        onchange={(e) => {
          onnaturechange(e.currentTarget.value);
          onclearerror();
        }}
      >
        <option value="">Unknown</option>
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
    <p role="alert" class="text-sm font-medium text-error">
      {error}
    </p>
  {/if}
</section>
