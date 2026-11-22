import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export interface RenderInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
}

declare global {
  interface Window {
    /** Renderer statistics of the last frame (read by the e2e performance check). */
    __renderInfo?: () => RenderInfo;
  }
}

/**
 * Exposes three.js renderer statistics on `window.__renderInfo` (inside <Canvas>). Renders nothing.
 * The post-processing composer renders several passes per frame, and three.js
 * resets its counters on every render call by default, which would leave only
 * the last full-screen pass (1 call, 1 triangle). So counting is switched to
 * manual and reset once at the start of each frame: the numbers are whole-frame
 * totals (scene + effect passes).
 */
export function RendererProbe() {
  const gl = useThree((s) => s.gl);
  useFrame(() => gl.info.reset(), -10); // before everything else renders this frame
  useEffect(() => {
    gl.info.autoReset = false;
    window.__renderInfo = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      pixelRatio: gl.getPixelRatio(),
    });
    return () => {
      gl.info.autoReset = true;
      delete window.__renderInfo;
    };
  }, [gl]);
  return null;
}
