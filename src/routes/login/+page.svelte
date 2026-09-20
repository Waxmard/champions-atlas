<script lang="ts">
  import Compass from '@lucide/svelte/icons/compass';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import { signIn, sync } from '$lib/sync.svelte';

  const signingIn = $derived(sync.status === 'syncing');
</script>

<svelte:head>
  <title>Sign in — Champion's Atlas</title>
</svelte:head>

<main
  class="flex min-h-svh flex-col items-center justify-center bg-base-200 px-4 py-8"
>
  <div class="w-full max-w-sm">
    <div class="mb-6 flex justify-center">
      <Compass class="size-16 text-primary" aria-hidden="true" />
    </div>
    <div class="card bg-base-100 p-6 shadow-sm card-border">
      <h1 class="text-center text-2xl font-semibold tracking-tight">
        Champion's Atlas
      </h1>
      <p class="mt-1 mb-5 text-center text-sm text-base-content/70">
        Sign in to browse and sync your teams
      </p>
      <div class="mb-5 h-px bg-base-300" aria-hidden="true"></div>

      {#if sync.configured}
        <Button
          variant="outline"
          class="w-full gap-3"
          onclick={signIn}
          disabled={signingIn}
        >
          {#if signingIn}
            <LoaderCircle class="size-5 animate-spin" aria-hidden="true" />
          {:else}
            <svg class="size-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
          {/if}
          Sign in with Google
        </Button>
      {:else}
        <p class="text-center text-sm text-base-content/70">
          Sign-in is not configured.
        </p>
      {/if}

      {#if sync.error}
        <div class="mt-4 alert alert-error">{sync.error}</div>
      {/if}
    </div>
    <p class="mt-6 text-center text-xs text-base-content/70">
      An independent fan project. Pokémon belongs to its respective owners.
    </p>
  </div>
</main>
