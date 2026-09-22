<script lang="ts">
  import { twMerge } from 'tailwind-merge';
  import PokemonSprite from '$lib/components/PokemonSprite.svelte';

  let {
    pokemon,
    spriteSize = 32,
    spriteClass = '',
    textClass = '',
    class: className = '',
  }: {
    pokemon: string;
    spriteSize?: number;
    spriteClass?: string;
    textClass?: string;
    class?: string;
  } = $props();
</script>

<span class={twMerge('flex min-w-0 items-center gap-2', className)}>
  <span class={twMerge('shrink-0', spriteClass)}>
    <PokemonSprite {pokemon} size={spriteSize} />
  </span>
  <span class={twMerge('min-w-0', textClass)}>{pokemon}</span>
</span>
