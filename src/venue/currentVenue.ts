import rawConfig from '../../venues/cluj-arena.json';
import { loadVenue, type Venue } from './loadVenue.ts';

/**
 * The venue shown by the app, loaded lazily and memoised. A bad config
 * throws here; App catches it and shows the error instead of a broken scene.
 */
let cached: Venue | null = null;

export function getVenue(): Venue {
  if (!cached) cached = loadVenue(rawConfig);
  return cached;
}
