import { error } from '@sveltejs/kit';
import {
  catalogState,
  initCatalogRuntime,
} from '#lib/catalog-runtime.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  let team = catalogState.catalog.teams.find((entry) => entry.id === params.id);
  if (!team && !catalogState.ready) {
    await initCatalogRuntime();
    team = catalogState.catalog.teams.find((entry) => entry.id === params.id);
  }
  if (!team) error(404, 'Team not found in this catalog.');
  return { team };
};
