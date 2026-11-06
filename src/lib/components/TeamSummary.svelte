<script lang="ts">
  import { localImageSrc } from '#lib/assets.js';
  import type { Member } from '#lib/catalog.js';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import { getPokemonTypes, typeBand } from '#lib/types.js';
  import PokemonSprite from './PokemonSprite.svelte';

  let {
    name,
    context = '',
    reserveTitleActions = false,
    members,
  }: {
    name: string;
    context?: string;
    reserveTitleActions?: boolean;
    members: readonly Pick<Member, 'pokemon' | 'item'>[];
  } = $props();
</script>

<div class="mt-1.5 min-w-0 {reserveTitleActions ? 'min-h-11 pe-24' : ''}">
  <h2 class="text-lg leading-[1.4] font-extrabold wrap-anywhere">
    {name}
  </h2>
  {#if context}<p class="provenance mt-1 wrap-anywhere">{context}</p>{/if}
</div>
<ul class="mt-3 grid grid-cols-3 gap-2" aria-label="Team members">
  {#each members as member, index (index)}
    {@const types = getPokemonTypes(member.pokemon)}
    {@const band = typeBand(types)}
    <li class="flex min-w-0 flex-col gap-0.5">
      <p
        class="truncate px-0.5 text-[0.75rem] leading-tight font-bold text-[color:var(--color-muted)]"
        title={member.pokemon}
      >
        {member.pokemon}
      </p>
      <div
        class="plate flex items-center justify-between gap-1 px-2 py-1.5"
        style:background={band}
      >
        <PokemonSprite pokemon={member.pokemon} size={40} />
        {#if member.item?.trim() && localImageSrc('items', member.item)}
          <ItemIcon item={member.item} size={22} />
        {/if}
      </div>
    </li>
  {/each}
</ul>
