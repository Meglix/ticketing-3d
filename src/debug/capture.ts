import { advance } from '@react-three/fiber';

/**
 * Frame-accurate capture for the flow video (`?capture`). Test tooling only.
 *
 * Headless browsers in CI render WebGL in software at ~2 fps, so a real-time
 * screen recording of the flow is a slideshow and says nothing about how the
 * camera moves. In capture mode the canvas has no loop of its own
 * (frameloop="never") and the app's clock is virtual: `performance.now()`
 * (the intro, the light pulses) and R3F's clock (flights, damping) both
 * follow it. `window.__capture.step(ms)` moves time forward by `ms` and
 * renders exactly one frame. e2e/flow.spec.ts steps at 25 fps and screenshots
 * every frame. Only time is simulated; every frame is the real app's rendering.
 *
 * Must be imported before anything reads the clock (first import in main.tsx).
 */
export const captureMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('capture');

declare global {
  interface Window {
    __capture?: { step(ms: number): void; seconds(): number };
  }
}

if (captureMode) {
  const baseMs = performance.now();
  let seconds = 0;
  performance.now = () => baseMs + seconds * 1000;
  window.__capture = {
    step(ms: number) {
      seconds += ms / 1000;
      advance(seconds);
    },
    seconds: () => seconds,
  };
}
