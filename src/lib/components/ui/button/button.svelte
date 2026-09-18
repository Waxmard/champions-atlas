<script lang="ts" module>
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from 'svelte/elements';

  export type ButtonVariant =
    'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  export type ButtonSize =
    'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

  const variants: Record<ButtonVariant, string> = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    outline:
      'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 shadow-xs',
    secondary:
      'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]',
    ghost: 'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
    destructive: 'bg-destructive/10 hover:bg-destructive/20 text-destructive',
    link: 'text-primary underline-offset-4 hover:underline',
  };

  const sizes: Record<ButtonSize, string> = {
    default: 'h-9 gap-1.5 px-2.5',
    xs: 'h-6 gap-1 px-2 text-xs',
    sm: 'h-8 gap-1 px-2.5',
    lg: 'h-10 gap-1.5 px-2.5',
    icon: 'size-9',
    'icon-xs': 'size-6',
    'icon-sm': 'size-8',
    'icon-lg': 'size-10',
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
    return [
      "focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border border-transparent text-sm font-medium focus-visible:ring-3 active:translate-y-px inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      variants[variant] || variants.default,
      sizes[size] || sizes.default,
      className,
    ]
      .filter(Boolean)
      .join(' ');
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
