import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { SRGBColorSpace } from 'three';
import { SeatPicker } from '../interaction/SeatPicker.tsx';
import { actions } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { Effects, type QualityTier } from './Effects.tsx';
import { Environment } from './Environment.tsx';
import { Field } from './Field.tsx';
import { Fixtures } from './Fixtures.tsx';
import { buildLabelModels, createLabelRegistry, LabelLayer, LabelTracker } from './Labels.tsx';
import { LedBoards } from './LedBoards.tsx';
import { LookDirector } from './look.ts';
import { Roof } from './Roof.tsx';
import { Seats } from './Seats.tsx';
import { Stands } from './Stands.tsx';
import './scene.css';

/**
 * The 3D stage: owns the <Canvas> and everything visible in it. `children`
 * (the camera rig) render inside the canvas. Labels are DOM chips in a layer
 * above the canvas, positioned by a tracker inside it.
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

const params = () => new URLSearchParams(window.location.search);

/** `?dpr=1.5` pins the pixel ratio (screenshots, perf comparisons); otherwise it adapts. */
function pinnedDpr(): number | null {
  const v = Number(params().get('dpr'));
  return Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.5, v)) : null;
}

/** `?quality=high|medium|low` pins the effects tier; otherwise it adapts. */
function pinnedTier(): QualityTier | null {
  const q = params().get('quality');
  return q === 'high' || q === 'medium' || q === 'low' ? q : null;
}

/**
 * Adaptive quality. drei's PerformanceMonitor samples the frame rate; if a
 * device can't hold it we step down a ladder — first resolution (fill rate
 * is what grows with screen density), then the expensive effects (grain,
 * speed blur, SMAA, bloom levels) — and back up when there is headroom.
 * After a few flip-flops it settles on the lower step.
 */
function useAdaptiveQuality() {
  const dprPin = useMemo(pinnedDpr, []);
  const tierPin = useMemo(pinnedTier, []);
  const max = Math.min(2, window.devicePixelRatio || 1);
  const ladder = useMemo(
    () =>
      [
        { dpr: max, tier: 'high' as const },
        { dpr: Math.max(1, max * 0.75), tier: 'high' as const },
        { dpr: 1, tier: 'medium' as const },
        { dpr: 1, tier: 'low' as const },
      ],
    [max],
  );
  const [step, setStep] = useState(0);
  const pinned = dprPin !== null || tierPin !== null;
  const level = ladder[step]!;
  const dpr = dprPin ?? level.dpr;
  const tier = tierPin ?? level.tier;
  const monitor = pinned ? null : (
    <PerformanceMonitor
      flipflops={3}
      onDecline={() => setStep((s) => Math.min(ladder.length - 1, s + 1))}
      onIncline={() => setStep((s) => Math.max(0, s - 1))}
      onFallback={() => setStep(ladder.length - 2)}
    />
  );
  return { dpr, tier, monitor };
}

export function Stage({ venue, children }: { venue: Venue; children?: ReactNode }) {
  const { dpr, tier, monitor } = useAdaptiveQuality();
  const labels = useMemo(() => buildLabelModels(venue), [venue]);
  const registry = useMemo(() => createLabelRegistry(labels.length), [labels]);
  const b = venue.structure.bounds;
  const floodGroups = Math.max(1, venue.config.roof?.segments.length ?? 1);

  return (
    // data-quality / data-dpr: the adaptive level in use (read by the e2e performance check).
    <div className="stage" data-quality={tier} data-dpr={dpr}>
      <Canvas
        dpr={dpr}
        // The composer renders off-screen and does its own anti-aliasing (SMAA).
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        // A sensible default view (high above Tribuna II); the camera rig takes over.
        camera={{ fov: 40, near: 1, far: 5000, position: [0, b.halfLength * 1.9, b.halfLength * 1.55] }}
        onCreated={({ gl, scene, camera }) => {
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
        <color attach="background" args={['#000000']} />
        <LookDirector groups={floodGroups} />
        <Environment venue={venue} />
        <Field venue={venue} />
        <Stands venue={venue} />
        <Seats venue={venue} />
        <SeatPicker venue={venue} />
        <Roof venue={venue} />
        <Fixtures venue={venue} />
        <LedBoards venue={venue} />
        <LabelTracker models={labels} registry={registry} />
        <FirstFrame />
        {monitor}
        {children}
        <Effects tier={tier} />
      </Canvas>
      <LabelLayer models={labels} registry={registry} />
    </div>
  );
}
