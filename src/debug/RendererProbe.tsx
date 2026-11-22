import { useThree } from '@react-three/fiber';
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

/** Exposes three.js renderer statistics on `window.__renderInfo` (inside <Canvas>). Renders nothing. */
export function RendererProbe() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    window.__renderInfo = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      pixelRatio: gl.getPixelRatio(),
    });
    return () => {
      delete window.__renderInfo;
    };
  }, [gl]);
  return null;
}
