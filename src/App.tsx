import { useEffect } from 'react';
import { CameraRig } from './camera/CameraRig.tsx';
import { FpsMeter, showFps } from './debug/FpsMeter.tsx';
import { RendererProbe } from './debug/RendererProbe.tsx';
import { Stage } from './scene/Stage.tsx';
import { ConfigError } from './ui/ConfigError.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { SceneBoundary, SceneFailure, webglAvailable } from './ui/SceneFailure.tsx';
import { installHistorySync } from './state/history.ts';
import { useAppState } from './state/store.ts';
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
 * scene (fail fast, visibly). If 3D cannot run (no WebGL, lost GPU context,
 * a crash inside the scene) a Romanian fallback screen replaces the blank page.
 */
export function App() {
  const failure = useAppState((s) => s.sceneFailure);
  let venue: Venue;
  try {
    venue = getVenue();
  } catch (error) {
    return <ConfigError error={error} />;
  }
  if (failure) return <SceneFailure reason={failure} />;
  if (!webglAvailable()) return <SceneFailure reason="no-webgl" />;
  return <VenueApp venue={venue} />;
}

function VenueApp({ venue }: { venue: Venue }) {
  useEffect(() => {
    document.title = `${venue.config.name} · Vederea de pe loc (demo)`;
  }, [venue]);
  useEffect(installHistorySync, []);
  return (
    <div className="app">
      <SceneBoundary>
        <Stage venue={venue}>
          <CameraRig venue={venue} />
          <RendererProbe />
        </Stage>
      </SceneBoundary>
      <Overlay venue={venue} />
      {showFps() && <FpsMeter />}
    </div>
  );
}
