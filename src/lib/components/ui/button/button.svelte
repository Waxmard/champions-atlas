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
    default: 'btn-primary',
    outline: 'btn-outline',
    secondary: 'btn-soft',
    ghost: 'btn-ghost',
    destructive: 'btn-soft btn-error',
    link: 'btn-link',
  };

  const sizes: Record<ButtonSize, string> = {
    default: 'btn-md',
    xs: 'btn-xs',
    sm: 'btn-sm',
    lg: 'btn-lg',
    icon: 'btn-square btn-md',
    'icon-xs': 'btn-square btn-xs',
    'icon-sm': 'btn-square btn-sm',
    'icon-lg': 'btn-square btn-lg',
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
      "btn [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
