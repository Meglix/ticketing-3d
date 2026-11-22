import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type ReactNode, useMemo, useRef, useState } from 'react';
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

/** `?dpr=1.5` pins the pixel ratio (screenshots, perf comparisons); otherwise it adapts. */
function pinnedDpr(): number | null {
  const v = Number(new URLSearchParams(window.location.search).get('dpr'));
  return Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.5, v)) : null;
}

/**
 * Adaptive resolution: fill rate is the cost that grows with screen density
 * (measured: DPR 2 roughly halves the frame rate of DPR 1). drei's
 * PerformanceMonitor samples the frame rate; if a device can't hold it, the
 * pixel ratio steps down by 0.5 (never below 1), and back up when there is
 * headroom. After a few flip-flops it settles at 1.
 */
function useAdaptiveDpr() {
  const pinned = useMemo(pinnedDpr, []);
  const max = Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(pinned ?? max);
  const monitor =
    pinned === null ? (
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(1, d - 0.5))}
        onIncline={() => setDpr((d) => Math.min(max, d + 0.5))}
        onFallback={() => setDpr(1)}
      />
    ) : null;
  return { dpr, monitor };
}

export function Stage({ venue, children }: { venue: Venue; children?: ReactNode }) {
  const { dpr, monitor } = useAdaptiveDpr();
  const labels = useMemo(() => buildLabelModels(venue), [venue]);
  const registry = useMemo(() => createLabelRegistry(labels.length), [labels]);
  const b = venue.structure.bounds;

  return (
    <div className="stage">
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        // A sensible default view (high above Tribuna I); the camera rig takes over.
        camera={{ fov: 40, near: 1, far: 9000, position: [0, b.halfLength * 1.9, -b.halfLength * 1.55] }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = SRGBColorSpace;
          // GPU reset / memory pressure: don't leave a frozen canvas, show the fallback.
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            actions.failScene('context-lost');
          });
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
        {monitor}
        {children}
      </Canvas>
      <LabelLayer models={labels} registry={registry} />
    </div>
  );
}
