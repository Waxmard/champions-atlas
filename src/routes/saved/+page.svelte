<script lang="ts">
  import { resolve } from '$app/paths';
  import Plus from '@lucide/svelte/icons/plus';
  import CollectionPage from '#lib/components/CollectionPage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    orderedSaved,
    removeSavedTeam,
    reorderSaved,
    setCurrentTeam,
    setTeamFavorite,
  } from '#lib/team-collections.js';
</script>

{#snippet addTeam(className: string)}
  <Button href={resolve('saved/new')} variant="quiet" class={className}>
    <Plus class="size-4" aria-hidden="true" />
    <span>Add custom team</span>
  </Button>
{/snippet}

{#snippet importForm(empty: boolean)}
  {#if !empty}{@render addTeam('-ms-2 min-h-11')}{/if}
{/snippet}

{#snippet emptyAction()}
  {@render addTeam('')}
{/snippet}

<CollectionPage
  collection="saved"
  orderTeams={orderedSaved}
  reorderTeams={reorderSaved}
  removeTeam={removeSavedTeam}
  setFavorite={setTeamFavorite}
  setCurrent={setCurrentTeam}
  {importForm}
  {emptyAction}
  emptyTitle="No saved teams yet"
  empty="Choose Save on a team in Browse or Wishlist, or add a custom team."
/>
