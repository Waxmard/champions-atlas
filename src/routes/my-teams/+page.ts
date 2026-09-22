import catalog from '$lib/data/catalog.json';
import tags from '$lib/data/team-tags.json';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({ catalog, tags });
