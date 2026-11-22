import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';
import type { Venue } from '../venue/loadVenue.ts';

/**
 * LANE B STUB — replaced by the scene lane.
 * Owns the <Canvas> and everything visible in it; renders `children`
 * (camera rig etc.) inside the canvas.
 */
export function Stage({ venue, children }: { venue: Venue; children?: ReactNode }) {
  void venue;
  return <Canvas>{children}</Canvas>;
}
