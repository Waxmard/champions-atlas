import { error } from '@sveltejs/kit';
import catalog from '$lib/data/catalog.json';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  const team = catalog.teams.find((team) => team.id === params.id);
  if (!team) error(404, 'Team not found in this catalog.');
  return { team, currentRegulation: catalog.currentRegulation };
};
