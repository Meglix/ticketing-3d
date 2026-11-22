import { CameraRig } from './camera/CameraRig.tsx';
import { FpsMeter, showFps } from './debug/FpsMeter.tsx';
import { RendererProbe } from './debug/RendererProbe.tsx';
import { Stage } from './scene/Stage.tsx';
import { ConfigError } from './ui/ConfigError.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { getVenue } from './venue/currentVenue.ts';
import type { Venue } from './venue/loadVenue.ts';

/**
 * Composition root: the only place where the lanes meet.
 *
 *   venue (validated data + generated geometry)
 *     ├─ Stage      — <Canvas> + everything visible (src/scene)
 *     │    └─ CameraRig — flies/looks the camera from the store (src/camera)
 *     └─ Overlay    — Romanian DOM UI on top (src/ui)
 *
 * A bad venue config shows its validation errors instead of a half-working
 * scene (fail fast, visibly).
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
        <RendererProbe />
      </Stage>
      <Overlay venue={venue} />
      {showFps() && <FpsMeter />}
    </div>
  );
}
