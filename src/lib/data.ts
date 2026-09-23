import type { Bird, LocationRec, Photo } from './types';
import sampleBirds from '../data/birds.sample.json';

/*
 * The real data files are written by the Notion sync script and may not exist
 * yet. `import.meta.glob` on a literal path resolves to an empty object when
 * the file is missing, which gives us an optional import without try/catch.
 * Delete nothing here — once birds.json lands it simply wins over the fixture.
 */
const birdsMod = import.meta.glob('../data/birds.json', { eager: true, import: 'default' });
const photosMod = import.meta.glob('../data/photos.json', { eager: true, import: 'default' });
const locationsMod = import.meta.glob('../data/locations.json', { eager: true, import: 'default' });

const first = <T,>(mod: Record<string, unknown>): T | null => {
  const values = Object.values(mod);
  return values.length ? (values[0] as T) : null;
};

const realBirds = first<Bird[]>(birdsMod);

/** True while we are still running on src/data/birds.sample.json. */
export const usingFixture = realBirds === null;

export const birds: Bird[] = realBirds ?? (sampleBirds as Bird[]);
export const photos: Photo[] = first<Photo[]>(photosMod) ?? [];
export const locations: LocationRec[] = first<LocationRec[]>(locationsMod) ?? [];

export const photosById = new Map(photos.map((p) => [p.id, p]));
export const locationsById = new Map(locations.map((l) => [l.id, l]));

/** Spotted birds with a usable date, oldest first. */
export const timelineBirds: Bird[] = birds
  .filter((b) => b.spotted && typeof b.firstSpotted === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b.firstSpotted))
  .sort((a, b) => (a.firstSpotted! < b.firstSpotted! ? -1 : a.firstSpotted! > b.firstSpotted! ? 1 : a.name.localeCompare(b.name)));

/** First photo file for a bird, or null when the download has not landed yet. */
export function firstPhotoFile(bird: Bird): string | null {
  for (const pid of bird.photoIds ?? []) {
    const photo = photosById.get(pid);
    const file = photo?.files?.[0];
    if (file) return file;
  }
  return null;
}

export function locationNames(bird: Bird): string[] {
  return (bird.locationIds ?? [])
    .map((id) => locationsById.get(id)?.name)
    .filter((n): n is string => Boolean(n));
}
