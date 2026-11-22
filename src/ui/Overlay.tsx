import type { Venue } from '../venue/loadVenue.ts';

/** LANE D STUB — replaced by the UI lane. The Romanian DOM overlay above the canvas. */
export function Overlay({ venue }: { venue: Venue }) {
  return <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff' }}>{venue.config.name}</div>;
}
