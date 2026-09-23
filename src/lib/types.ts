/** Shapes documented in CLAUDE.md § 数据契约. Keep in sync with the sync script. */

/** Exactly as stored in Notion — note the "Birds" suffix on the first two. */
export type BirdType =
  | 'Perching Birds'
  | 'Water Birds'
  | 'Wading & Shorebirds'
  | 'Raptors'
  | 'Tree-Climbers'
  | 'Landfowls'
  | 'Doves & Pigeons'
  | 'Swifts & Hummingbirds'
  | 'Specialists';

export interface Bird {
  id: string;
  slug: string;
  name: string;
  genus: string;
  description?: string;
  type: BirdType | string;
  tags?: string[];
  colors?: string[];
  behavior?: string[];
  wingShape?: string[];
  tailShape?: string[];
  conservation?: string;
  sizeInches?: number | null;
  population?: number | null;
  migratory?: boolean;
  spotted: boolean;
  wishlist?: boolean;
  favorite?: boolean;
  /** ISO date, e.g. "2026-08-15". Null for un-spotted birds. */
  firstSpotted: string | null;
  locationIds?: string[];
  photoIds?: string[];
}

export interface LocationRec {
  id: string;
  slug: string;
  name: string;
  scope: 'local' | 'travel' | string;
  birdCount?: number;
  /** Percentage (0-100) of the viewBox named by `mapSpace`. */
  x: number | null;
  y: number | null;
  /** Real coordinates — authoritative. Reproject from these, never from x/y. */
  lat?: number;
  lng?: number;
  /** Which map viewBox x/y belong to. See src/data/map-meta.json. */
  mapSpace?: 'us' | 'triangle';
  /** Set when the pin sits in an inset box rather than at its true position. */
  inset?: 'hawaii' | 'puerto_rico';
  placeNote?: string;
}

export interface Photo {
  id: string;
  birdId: string;
  locationIds?: string[];
  camera?: string;
  /** File names inside src/assets/photos/, in page order. */
  files: string[];
}
