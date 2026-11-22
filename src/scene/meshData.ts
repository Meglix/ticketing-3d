import { BufferAttribute, BufferGeometry } from 'three';
import type { MeshData } from '../geometry/types.ts';

/** Wrap the generator's plain arrays in a three.js geometry (no copy: the typed arrays are shared). */
export function toBufferGeometry(mesh: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Scalar smoothstep for fades driven from useFrame. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How "high" the camera is, 0 (at seat level, under the roof) → 1 (overview).
 * The roof, facade and labels all key off the same value so they fade together.
 */
export function overviewFactor(cameraY: number): number {
  return smoothstep(38, 95, cameraY);
}
