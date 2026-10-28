import { catalogState } from '#lib/catalog-runtime.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = () => ({
  get catalog() {
    return catalogState.catalog;
  },
  get tags() {
    return catalogState.tags;
  },
});
