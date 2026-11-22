import { CameraRig } from './camera/CameraRig.tsx';
import { Stage } from './scene/Stage.tsx';
import { ConfigError } from './ui/ConfigError.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { getVenue } from './venue/currentVenue.ts';
import type { Venue } from './venue/loadVenue.ts';

/**
 * Composition root. Loads (and validates) the venue once; a bad config shows
 * the validation errors instead of a half-working scene (fail fast, visibly).
 */
export function App() {
  let venue: Venue;
  try {
    venue = getVenue();
  } catch (error) {
    return <ConfigError error={error} />;
  }
  return (
    <div className="app">
      <Stage venue={venue}>
        <CameraRig venue={venue} />
      </Stage>
      <Overlay venue={venue} />
    </div>
  );
}
