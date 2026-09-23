import type { ImageMetadata } from 'astro';

/** Every photo Astro can optimise, keyed by bare file name ("<photoId>-0.png"). */
const assets = import.meta.glob<ImageMetadata>(
  '../assets/photos/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,avif}',
  { eager: true, import: 'default' },
);

export const photoAssets = new Map<string, ImageMetadata>(
  Object.entries(assets).map(([path, meta]) => [path.split('/').pop()!, meta]),
);

/** Same key without the extension — photos.json and disk disagree on .jpg/.png. */
const byStem = new Map<string, ImageMetadata>();
for (const [name, meta] of photoAssets) {
  const stem = name.replace(/\.[^.]+$/, '');
  if (!byStem.has(stem)) byStem.set(stem, meta);
}

export function photoAsset(file: string | null): ImageMetadata | null {
  if (!file) return null;
  return photoAssets.get(file) ?? byStem.get(file.replace(/\.[^.]+$/, '')) ?? null;
}
