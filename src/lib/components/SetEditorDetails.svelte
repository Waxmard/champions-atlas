<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import type { Member } from '#lib/catalog.js';
  import type { CurrentSetChoice } from '#lib/current-sets.js';
  import type { CatalogSuggestion } from '#lib/workbench.js';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import SuggestionList from '#lib/components/SuggestionList.svelte';
  import SuggestionRow from '#lib/components/SuggestionRow.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    item: string;
    ability: string;
    filteredItems: CatalogSuggestion[];
    filteredAbilities: CatalogSuggestion[];
    hasMoreItems: boolean;
    hasMoreAbilities: boolean;
    onshowmoreitems: () => void;
    onshowmoreabilities: () => void;
    inGameMember?: Member;
    error: string;
    errorField: EditableSetField | null;
    onitemchange: (val: string) => void;
    onabilitychange: (val: string) => void;
    oningame: (choice: CurrentSetChoice, displayed: Member) => void;
    onresetquery: (field: string) => void;
    oncommit: (blurOnSuccess?: boolean) => void;
  }

  let {
    item,
    ability,
    filteredItems,
    filteredAbilities,
    hasMoreItems,
    hasMoreAbilities,
    onshowmoreitems,
    onshowmoreabilities,
    inGameMember,
    error,
    errorField,
    onitemchange,
    onabilitychange,
    oningame,
    onresetquery,
    oncommit,
  }: Props = $props();
</script>

{#snippet detailField(
  field: 'item' | 'ability',
  label: string,
  value: string,
  placeholder: string,
  onvaluechange: (value: string) => void,
  options: CatalogSuggestion[],
  hasMore: boolean,
  onshowmore: () => void
)}
  <label for={`set-${field}-input`} class="term">{label}</label>
  <div class="field mt-1.5">
    <span class="grid size-7 shrink-0 place-items-center" aria-hidden="true">
      {#if field === 'item'}
        <ItemIcon item={value} size={20} />
      {/if}
    </span>
    <input
      id={`set-${field}-input`}
      class="grow bg-transparent text-sm focus:outline-none"
      {placeholder}
      {value}
      onfocus={() => onresetquery(field)}
      onclick={() => onresetquery(field)}
      oninput={(event) => onvaluechange(event.currentTarget.value)}
      onblur={() => oncommit(false)}
      onkeydown={(event) => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          oncommit(true);
        }
      }}
    />
    {#if value}
      <Button
        variant="quiet"
        size="icon-compact"
        class="-me-2"
        aria-label={`Clear ${field}`}
        onpointerdown={(event) => event.preventDefault()}
        onclick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onvaluechange('');
          oncommit(true);
        }}
      >
        <X class="size-4" />
      </Button>
    {/if}
  </div>

  <SuggestionList
    id={`set-${field}-suggestions`}
    label={`${label} suggestions`}
    count={options.length}
    {hasMore}
    {onshowmore}
  >
    {#each options as opt (opt.value)}
      <SuggestionRow
        label={`Use ${opt.value}${opt.inGame ? ' in-game' : opt.favorite ? ' favorite' : ''} ${field}`}
        glyph={field === 'item'
          ? { kind: 'item', value: opt.value }
          : { kind: 'none' }}
        primary={opt.value}
        secondary={[
          opt.original ? 'Original' : '',
          opt.inGame ? 'In-game' : '',
          opt.favorite ? 'Favorite' : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        onclick={() => {
          if (opt.inGame) {
            if (inGameMember) oningame({ kind: field }, inGameMember);
            return;
          }
          onvaluechange(opt.value);
          oncommit(true);
        }}
      />
    {/each}
  </SuggestionList>
{/snippet}

<section class="grid gap-5">
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="min-w-0">
      {@render detailField(
        'item',
        'Item',
        item,
        'Item',
        onitemchange,
        filteredItems,
        hasMoreItems,
        onshowmoreitems
      )}
    </div>

    <div class="min-w-0">
      {@render detailField(
        'ability',
        'Ability',
        ability,
        'Ability',
        onabilitychange,
        filteredAbilities,
        hasMoreAbilities,
        onshowmoreabilities
      )}
    </div>
  </div>

  {#if error && (errorField === 'item' || errorField === 'ability')}
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
