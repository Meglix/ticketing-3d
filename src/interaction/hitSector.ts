import { signedDistance, wrapS, type ReferenceCurve } from '../geometry/roundedRect.ts';
import { standSection } from '../geometry/structure.ts';
import type { Vec2, Vec3 } from '../geometry/types.ts';
import type { Venue } from '../venue/loadVenue.ts';

/**
 * Which sector's solid contains a world point? Exact, from the venue geometry
 * alone (independent of how the scene names its meshes). Used by the test seam
 * to prove that a tap at a screen point really lands on the intended sector.
 */

/** Arc length s of the point on the reference line nearest to plan point p. */
export function nearestParam(curve: ReferenceCurve, p: Vec2): number {
  const R = curve.spec.cornerRadius;
  let best = { s: 0, dist: Infinity };
  for (const seg of curve.segments) {
    if (seg.kind === 'line') {
      const t = Math.min(Math.max((p.x - seg.start.x) * seg.dir.x + (p.z - seg.start.z) * seg.dir.z, 0), seg.length);
      const q = { x: seg.start.x + seg.dir.x * t, z: seg.start.z + seg.dir.z * t };
      const dist = Math.hypot(p.x - q.x, p.z - q.z);
      if (dist < best.dist) best = { s: seg.s0 + t, dist };
    } else {
      const phi = Math.atan2(p.z - seg.center.z, p.x - seg.center.x);
      // Angle relative to the middle of the arc, wrapped to (−π, π], then clamped to the arc.
      let rel = phi - (seg.phi0 + Math.PI / 4);
      rel = Math.atan2(Math.sin(rel), Math.cos(rel)) + Math.PI / 4;
      rel = Math.min(Math.max(rel, 0), Math.PI / 2);
      const a = seg.phi0 + rel;
      const q = { x: seg.center.x + R * Math.cos(a), z: seg.center.z + R * Math.sin(a) };
      const dist = Math.hypot(p.x - q.x, p.z - q.z);
      if (dist < best.dist) best = { s: seg.s0 + rel * R, dist };
    }
  }
  return best.s;
}

/** Highest point of a section's top chain at distance d (null outside it). */
export function sectionTopAt(top: { d: number; y: number }[], d: number): number | null {
  let best: number | null = null;
  for (let k = 0; k < top.length - 1; k++) {
    const p = top[k]!;
    const q = top[k + 1]!;
    if (q.d - p.d > 1e-9 && d >= p.d - 1e-9 && d <= q.d + 1e-9) {
      const y = p.y + ((Math.min(Math.max(d, p.d), q.d) - p.d) / (q.d - p.d)) * (q.y - p.y);
      best = best === null ? y : Math.max(best, y);
    }
  }
  return best;
}

interface SectorShape {
  code: string;
  from: number;
  to: number;
  top: { d: number; y: number }[];
  bottomY: (d: number) => number;
}

const shapesCache = new WeakMap<Venue, SectorShape[]>();

function shapes(venue: Venue): SectorShape[] {
  let list = shapesCache.get(venue);
  if (!list) {
    list = [];
    for (const stand of venue.config.stands)
      for (const ring of stand.rings)
        for (const sector of ring.sectors) {
          const { top, bottomY } = standSection(ring, sector);
          list.push({ code: sector.code, from: sector.span.from, to: sector.span.to, top, bottomY });
        }
    shapesCache.set(venue, list);
  }
  return list;
}

/** Tolerances: surfaces are hit exactly up to float noise; seats sit up to ~1 m above the treads. */
const SURFACE_TOL = 0.05;
const ABOVE_TREAD = 1.2;

export function sectorAtPoint(venue: Venue, point: Vec3): string | null {
  const curve = venue.curve;
  const d = signedDistance(curve.spec, point);
  const s = nearestParam(curve, point);
  for (const shape of shapes(venue)) {
    const along = wrapS(curve, s - shape.from);
    const span = shape.to - shape.from;
    const inSpan = along <= span + SURFACE_TOL || along >= curve.perimeter - SURFACE_TOL;
    if (!inSpan) continue;
    const dMin = shape.top[0]!.d;
    const dMax = shape.top[shape.top.length - 1]!.d;
    if (d < dMin - SURFACE_TOL || d > dMax + SURFACE_TOL) continue;
    const top = sectionTopAt(shape.top, Math.min(Math.max(d, dMin), dMax));
    if (top === null) continue;
    if (point.y < shape.bottomY(d) - SURFACE_TOL || point.y > top + ABOVE_TREAD) continue;
    return shape.code;
  }
  return null;
}
