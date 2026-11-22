import type { StandConfig, VenueConfig } from '../venue/schema.ts';
import { signedDistance, type RoundedRectSpec } from './roundedRect.ts';
import { standSection, treadEdges } from './structure.ts';
import type { Seat, Vec2, Vec3 } from './types.ts';

/**
 * Sightline check (the "C-value" used in stadium design guides).
 *
 * C is the vertical clearance between a spectator's line of sight and the eye
 * of a spectator sitting in a row in front. With C ≥ ~60 mm you can see over
 * heads; 90–120 mm is good design.
 *
 * Why exact: rows are level sets of the reference line's signed distance
 * sd(p). The line of sight runs from the eye towards a focus point inside the
 * bowl, so sd decreases along it, and it crosses each row in front at exactly
 * one point (sd is convex). We find that point by bisection and compare heights.
 *
 * Obstacles are taken from the seat's stand: every row of every ring (as an
 * eye height above the tread, with the slab underneath) and every ring's
 * front parapet. A line that passes *under* an elevated ring (below its
 * soffit) is not blocked by it, which is how the back rows of a lower ring
 * look out beneath an overhanging upper ring.
 */

interface Obstacle {
  /** Distance from the reference line. */
  distance: number;
  /** Lowest point of the obstacle (−Infinity for solid ground-supported rings). */
  bottom: number;
  /** Top: the eye of the spectator in that row, or the top of a parapet. */
  top: number;
  kind: 'row' | 'parapet';
}

export interface SightlineResult {
  /** Smallest clearance above the eyes of spectators in front (m). Infinity if no row is in front. */
  cValue: number;
  /** Smallest clearance above parapets in front (m). Infinity if none. */
  parapetClearance: number;
}

export function standObstacles(config: VenueConfig, stand: StandConfig): Obstacle[] {
  const out: Obstacle[] = [];
  const seen = new Set<string>();
  for (const ring of stand.rings) {
    for (const sector of ring.sectors) {
      const { top, bottomY } = standSection(ring, sector);
      const edges = treadEdges(sector.rows);
      for (const row of sector.rows) {
        const key = `${ring.ring}:${row.distance.toFixed(3)}:${row.elevation.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          distance: row.distance,
          bottom: ring.slabThickness === null ? -Infinity : bottomY(row.distance),
          top: row.elevation + config.eyeHeight,
          kind: 'row',
        });
      }
      if (ring.parapetHeight > 0) {
        const front = edges[0]!;
        const key = `p${ring.ring}:${front.toFixed(3)}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            distance: front - 0.1, // middle of the parapet wall
            bottom: ring.slabThickness === null ? -Infinity : bottomY(top[0]!.d),
            top: top[0]!.y,
            kind: 'parapet',
          });
        }
      }
    }
  }
  return out;
}

/** Point where the segment eye→focus crosses the level set sd = level (bisection on t ∈ [0, 1]). */
function crossingT(spec: RoundedRectSpec, from: Vec2, to: Vec2, level: number): number {
  let lo = 0; // sd(from) > level
  let hi = 1; // sd(to) < level
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const p = { x: from.x + (to.x - from.x) * mid, z: from.z + (to.z - from.z) * mid };
    if (signedDistance(spec, p) > level) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function sightline(
  spec: RoundedRectSpec,
  seat: Pick<Seat, 'position'>,
  seatDistance: number,
  eyeHeight: number,
  focus: Vec3,
  obstacles: Obstacle[],
): SightlineResult {
  const eye = { x: seat.position.x, z: seat.position.z };
  const eyeY = seat.position.y + eyeHeight;
  const focusPlan = { x: focus.x, z: focus.z };
  const focusSd = signedDistance(spec, focusPlan);
  let cValue = Infinity;
  let parapetClearance = Infinity;

  for (const ob of obstacles) {
    // Only things strictly between the eye and the focus point.
    if (ob.distance >= seatDistance - 1e-6 || ob.distance <= focusSd) continue;
    const t = crossingT(spec, eye, focusPlan, ob.distance);
    const lineY = eyeY + (focus.y - eyeY) * t;
    if (lineY <= ob.bottom) continue; // passes underneath an elevated ring
    const clearance = lineY - ob.top;
    if (ob.kind === 'row') cValue = Math.min(cValue, clearance);
    else parapetClearance = Math.min(parapetClearance, clearance);
  }
  return { cValue, parapetClearance };
}

/** Nearest point of the pitch rectangle's boundary to a plan point outside it (focus for the touchline check). */
export function nearestTouchlinePoint(pitch: { length: number; width: number }, p: Vec2): Vec3 {
  const hx = pitch.length / 2;
  const hz = pitch.width / 2;
  return { x: Math.max(-hx, Math.min(hx, p.x)), y: 0, z: Math.max(-hz, Math.min(hz, p.z)) };
}
