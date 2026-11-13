<script lang="ts">
  import { resolve } from '$app/paths';
  import Plus from '@lucide/svelte/icons/plus';
  import CollectionPage from '#lib/components/CollectionPage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    orderedSaved,
    removeSavedTeam,
    reorderSaved,
    setTeamFavorite,
  } from '#lib/team-collections.js';
</script>

{#snippet importForm()}
  <Button href={resolve('saved/new')} variant="quiet" class="-ms-2 min-h-11">
    <Plus class="size-4" aria-hidden="true" />
    <span>Add custom team</span>
  </Button>
{/snippet}

<CollectionPage
  collection="saved"
  orderTeams={orderedSaved}
  reorderTeams={reorderSaved}
  removeTeam={removeSavedTeam}
  setFavorite={setTeamFavorite}
  {importForm}
  empty="No saved teams yet. Choose Save on a team in Browse or Wishlist, or add a custom team."
/>
