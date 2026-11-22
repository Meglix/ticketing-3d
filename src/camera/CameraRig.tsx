import type { Venue } from '../venue/loadVenue.ts';

/** LANE C STUB — replaced by the camera lane. Drives the camera from the store (rendered inside <Canvas>). */
export function CameraRig({ venue }: { venue: Venue }) {
  void venue;
  return null;
}
