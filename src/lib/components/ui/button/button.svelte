<script lang="ts" module>
  import { clsx } from 'clsx';
  import { twMerge } from 'tailwind-merge';
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from 'svelte/elements';

  export type ButtonVariant =
    'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  export type ButtonSize =
    'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

  const variants: Record<ButtonVariant, string> = {
    default: 'atlas-button-primary',
    outline: 'atlas-button-outline',
    secondary: 'atlas-button-secondary',
    ghost: 'atlas-button-ghost',
    destructive: 'atlas-button-destructive',
    link: 'atlas-button-link',
  };

  const sizes: Record<ButtonSize, string> = {
    default: 'min-h-11 min-w-11 px-3 text-sm',
    xs: 'atlas-button-compact min-h-6 min-w-6 px-2 text-xs',
    sm: 'atlas-button-compact min-h-8 min-w-8 px-2.5 text-[13px]',
    lg: 'min-h-12 min-w-12 px-4 text-base',
    icon: 'size-11 min-h-11 min-w-11 p-0',
    'icon-xs': 'atlas-button-compact size-6 min-h-6 min-w-6 p-0',
    'icon-sm': 'atlas-button-compact size-8 min-h-8 min-w-8 p-0',
    'icon-lg': 'size-12 min-h-12 min-w-12 p-0',
  };

  export function buttonVariants({
    variant = 'default',
    size = 'default',
    class: className = '',
  }: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: HTMLButtonAttributes['class'];
  } = {}): string {
    return twMerge(
      "atlas-button [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      variants[variant] || variants.default,
      sizes[size] || sizes.default,
      clsx(className)
    );
  }

  export type ButtonProps = (HTMLButtonAttributes & HTMLAnchorAttributes) & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    ref?: HTMLElement | null;
  };
</script>

<script lang="ts">
  let {
    class: className = '',
    variant = 'default',
    size = 'default',
    ref = $bindable(null),
    href = undefined,
    type = 'button',
    disabled,
    children,
    ...restProps
  }: ButtonProps = $props();
</script>

{#if href}
  <a
    bind:this={ref}
    data-slot="button"
    class={buttonVariants({ variant, size, class: className })}
    href={disabled ? undefined : href}
    aria-disabled={disabled}
    role={disabled ? 'link' : undefined}
    tabindex={disabled ? -1 : undefined}
    {...restProps}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    class={buttonVariants({ variant, size, class: className })}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
