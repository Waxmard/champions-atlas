import { base } from '$app/paths';
import { normalize } from '$lib/catalog';

const localImages = __LOCAL_IMAGE_ASSETS__;

export function localImageSrc(
  directory: 'sprites' | 'items',
  name: string
): string {
  if (!name) return '';
  const path = `${directory}/${normalize(name)}.png`;
  return localImages[path] ? `${base}/${path}` : '';
}
