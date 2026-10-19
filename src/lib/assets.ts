import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';
import { normalize } from '#lib/catalog.js';

const localImages = __LOCAL_IMAGE_ASSETS__;

export function localImageSrc(
  directory: 'sprites' | 'items',
  name: string
): string {
  if (!name) return '';
  const path = `${directory}/${normalize(name)}.png`;
  return localImages[path] ? asset(path as AssetPath) : '';
}
