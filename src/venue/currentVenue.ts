import { loadVenue, type Venue } from './loadVenue.ts';

/**
 * Every JSON file in /venues is bundled; the app shows the one named by
 * `?venue=<id>` (default: cluj-arena). Adding a venue = adding a JSON file.
 *
 * Loaded lazily and memoised. A bad config throws a VenueConfigError here;
 * App catches it and shows the messages instead of a broken scene.
 */
const files = import.meta.glob<unknown>('../../venues/*.json', { eager: true, import: 'default' });

export const DEFAULT_VENUE_ID = 'cluj-arena';

/** `?venue=` names a venue that has no JSON file (distinct from an invalid config). */
export class UnknownVenueError extends Error {
  constructor(id: string, known: string[]) {
    super(`Unknown venue "${id}". Available: ${known.join(', ')}`);
    this.name = 'UnknownVenueError';
  }
}

function requestedVenueId(): string {
  if (typeof window === 'undefined') return DEFAULT_VENUE_ID;
  return new URLSearchParams(window.location.search).get('venue') ?? DEFAULT_VENUE_ID;
}

let cached: Venue | null = null;

export function getVenue(): Venue {
  if (cached) return cached;
  const id = requestedVenueId();
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${id}.json`));
  if (!entry) {
    const known = Object.keys(files).map((p) => p.replace(/^.*\/(.*)\.json$/, '$1'));
    throw new UnknownVenueError(id, known);
  }
  cached = loadVenue(entry[1]);
  return cached;
}
