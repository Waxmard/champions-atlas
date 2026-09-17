<script lang="ts">
  import ItemIcon from '$lib/components/ItemIcon.svelte';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { Member } from '$lib/catalog';

  type EditableSetField =
    'item' | 'ability' | 'nature' | 'spread' | 'moves' | 'text';

  let {
    member,
    changing,
    editing,
    onedit,
    onchange,
  }: {
    member: Member;
    changing: boolean;
    editing: boolean;
    onedit: (field: EditableSetField) => void;
    onchange: () => void;
  } = $props();
</script>

<div class="flex items-center gap-3">
  <PokemonSprite pokemon={member.pokemon} size={64} />
  <h2 class="min-w-0 font-semibold wrap-break-word">{member.pokemon}</h2>
</div>
<div class="mt-4 grid gap-2 text-left text-sm">
  <button
    type="button"
    class="rounded-lg border bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    aria-label={`Edit ${member.pokemon} item`}
    data-set-field="item"
    onclick={() => onedit('item')}
  >
    <span class="text-xs font-medium text-muted-foreground">Item</span>
    <span class="mt-1 flex items-center gap-1 wrap-break-word text-primary"
      >{#if member.item}<ItemIcon item={member.item} />{/if}{member.item ||
        'Unknown'}</span
    >
  </button>
  <button
    type="button"
    class="rounded-lg border bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    aria-label={`Edit ${member.pokemon} ability`}
    data-set-field="ability"
    onclick={() => onedit('ability')}
  >
    <span class="text-xs font-medium text-muted-foreground">Ability</span>
    <p class="mt-1 wrap-break-word">
      {member.ability ? `Ability: ${member.ability}` : 'Ability unknown'}
    </p>
  </button>
  <button
    type="button"
    class="rounded-lg border bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    aria-label={`Edit ${member.pokemon} nature`}
    data-set-field="nature"
    onclick={() => onedit('nature')}
  >
    <span class="text-xs font-medium text-muted-foreground">Nature</span>
    <span class="mt-1 block wrap-break-word">{member.nature || 'Unknown'}</span>
  </button>
  <button
    type="button"
    class="rounded-lg border bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    aria-label={`Edit ${member.pokemon} EVs`}
    data-set-field="spread"
    onclick={() => onedit('spread')}
  >
    <span class="text-xs font-medium text-muted-foreground">EVs</span>
    <span class="mt-1 block wrap-break-word">{member.spread || 'Unknown'}</span>
  </button>
  <button
    type="button"
    class="rounded-lg border bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    aria-label={`Edit ${member.pokemon} moves`}
    data-set-field="moves"
    onclick={() => onedit('moves')}
  >
    <span class="text-xs font-medium text-muted-foreground">Moves</span>
    {#if member.moves.length}
      <span class="mt-1 flex flex-wrap gap-x-1.5 gap-y-1">
        {#each member.moves as move (move)}
          <span class="wrap-break-word">{move}</span>
        {/each}
      </span>
    {:else}
      <span class="mt-1 block">Moves unknown</span>
    {/if}
  </button>
</div>
<div class="mt-3 grid grid-cols-2 gap-2">
  <Button
    variant="outline"
    class="min-h-11"
    aria-label={`Edit ${member.pokemon} set text`}
    data-set-field="text"
    onclick={() => onedit('text')}>Edit set text</Button
  ><Button
    variant={changing ? 'default' : 'outline'}
    class="min-h-11"
    aria-label={`Change ${member.pokemon}`}
    aria-pressed={changing}
    disabled={editing}
    onclick={onchange}>Change Pokémon</Button
  >
</div>
