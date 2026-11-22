import { Canvas, useFrame } from '@react-three/fiber';
import { type ReactNode, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { actions } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { Environment } from './Environment.tsx';
import { Field } from './Field.tsx';
import { Fixtures } from './Fixtures.tsx';
import { buildLabelModels, createLabelRegistry, LabelLayer, LabelTracker } from './Labels.tsx';
import { Roof } from './Roof.tsx';
import { Seats } from './Seats.tsx';
import { Stands } from './Stands.tsx';
import './scene.css';

/**
 * The 3D stage: owns the <Canvas> and everything visible in it. `children`
 * (the camera rig) render inside the canvas. Sector labels are DOM chips in
 * a layer above the canvas, positioned by a tracker inside it.
 */

/** Calls actions.markSceneReady() once, after the first frame has rendered. */
function FirstFrame() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    // Defer to the next task so the frame is on screen before the UI reacts.
    setTimeout(() => actions.markSceneReady(), 0);
  });
  return null;
}

export function Stage({ venue, children }: { venue: Venue; children?: ReactNode }) {
  const labels = useMemo(() => buildLabelModels(venue), [venue]);
  const registry = useMemo(() => createLabelRegistry(labels.length), [labels]);
  const b = venue.structure.bounds;

  return (
    <div className="stage">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        // A sensible default view (high above Tribuna I); the camera rig takes over.
        camera={{ fov: 40, near: 1, far: 9000, position: [0, b.halfLength * 1.9, -b.halfLength * 1.55] }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = SRGBColorSpace;
          // Dev-only handle for screenshots / perf checks from Playwright.
          if (import.meta.env.DEV) Object.assign(window, { __stage: { gl, scene, camera } });
        }}
      >
        <Environment venue={venue} />
        <Field venue={venue} />
        <Stands venue={venue} />
        <Seats venue={venue} />
        <Roof venue={venue} />
        <Fixtures venue={venue} />
        <LabelTracker models={labels} registry={registry} />
        <FirstFrame />
        {children}
      </Canvas>
      <LabelLayer models={labels} registry={registry} />
    </div>
  );
}
