import catalog from '$lib/data/catalog.json';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({ catalog });
