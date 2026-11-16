import { error } from '@sveltejs/kit';
import { findTeamById } from '#lib/team-collections.ts';
import {
  catalogState,
  initCatalogRuntime,
} from '#lib/catalog-runtime.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  let team = findTeamById(catalogState.catalog.teams, params.id);
  if (!team && !catalogState.ready) {
    await initCatalogRuntime();
    team = findTeamById(catalogState.catalog.teams, params.id);
  }
  if (!team) error(404, 'Team not found in this catalog.');
  return { team };
};
