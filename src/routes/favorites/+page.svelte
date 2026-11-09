<script lang="ts">
  import CollectionPage from '#lib/components/CollectionPage.svelte';
  import {
    orderedFavorites,
    removeFavoriteTeam,
    reorderFavorites,
    useFavoriteTeam,
  } from '#lib/team-collections.js';
</script>

<CollectionPage
  collection="favorites"
  orderTeams={orderedFavorites}
  reorderTeams={reorderFavorites}
  useTeam={useFavoriteTeam}
  removeTeam={removeFavoriteTeam}
  empty="No favorite teams yet. Choose “Move to Favorites” below a team in My Teams."
/>
