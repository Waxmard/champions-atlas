<script lang="ts">
  import CollectionPage from '#lib/components/CollectionPage.svelte';
  import {
    orderedSaved,
    removeSavedTeam,
    reorderSaved,
    setTeamFavorite,
    useSavedTeam,
  } from '#lib/team-collections.js';
</script>

<CollectionPage
  collection="saved"
  orderTeams={orderedSaved}
  reorderTeams={reorderSaved}
  useTeam={useSavedTeam}
  removeTeam={removeSavedTeam}
  setFavorite={setTeamFavorite}
  empty="No saved teams yet. Teams you add to My Teams appear here."
/>
