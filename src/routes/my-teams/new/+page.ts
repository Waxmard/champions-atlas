import catalog from '#lib/catalog-data.js';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({
  currentRegulation: catalog.currentRegulation,
});
