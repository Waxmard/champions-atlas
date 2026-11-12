<script lang="ts" module>
  import { clsx } from 'clsx';
  import { twMerge } from 'tailwind-merge';
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from 'svelte/elements';

  export type ButtonVariant = 'primary' | 'quiet' | 'danger-quiet';
  export type ButtonSize = 'compact' | 'dense' | 'icon-compact';

  const variants: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    quiet:
      'btn-ghost text-base-content/70 hover:text-base-content disabled:text-base-content/40',
    'danger-quiet':
      'btn-ghost text-error-content hover:bg-error focus-visible:bg-error disabled:text-base-content/40',
  };

  const sizes: Record<ButtonSize, string> = {
    compact: 'h-9 px-3 gap-1.5 max-md:h-auto max-md:min-h-11',
    // the EV stat row wraps on ≤320px phones; a 36px stepper adds 8px per row
    dense: 'h-9 gap-1 px-2 max-md:h-7 max-md:min-h-7',
    'icon-compact': 'size-9 p-0 max-md:size-11',
  };

  function buttonVariants({
    variant = 'quiet',
    size = 'compact',
    class: className = '',
  }: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: HTMLButtonAttributes['class'];
  } = {}): string {
    return twMerge(
      "btn whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] not-disabled:active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      variants[variant] ?? variants.quiet,
      sizes[size] ?? sizes.compact,
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
    variant = 'quiet',
    size = 'compact',
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
