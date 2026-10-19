<script lang="ts">
  import { twMerge } from 'tailwind-merge';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';

  let {
    pokemon,
    spriteSize = 32,
    textClass = '',
  }: {
    pokemon: string;
    spriteSize?: number;
    textClass?: string;
  } = $props();
</script>

<span class="flex min-w-0 items-center gap-2">
  <span class="shrink-0">
    <PokemonSprite {pokemon} size={spriteSize} />
  </span>
  <span class={twMerge('min-w-0', textClass)}>{pokemon}</span>
</span>
