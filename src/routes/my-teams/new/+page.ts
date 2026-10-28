import { catalogState } from '#lib/catalog-runtime.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({
  get currentRegulation() {
    return catalogState.catalog.currentRegulation;
  },
});
