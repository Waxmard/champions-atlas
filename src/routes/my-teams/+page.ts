import catalog from '#lib/catalog-data.js';
import tags from '#lib/data/team-tags.json';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({ catalog, tags });
