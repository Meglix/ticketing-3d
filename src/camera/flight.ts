import { signedDistance, type RoundedRectSpec } from '../geometry/roundedRect.ts';
import { standSection } from '../geometry/structure.ts';
import type { Vec3 } from '../geometry/types.ts';
import type { VenueConfig } from '../venue/schema.ts';
import { add, anglesOf, directionOf, length, lerp, lerpNumber, normalize, scale, sub, vec, type CameraPose } from './cameraMath.ts';

/**
 * Camera flights that never pass through the roof or the stands.
 *
 * Idea: a seat is "inside" the structure (under the roof, maybe under an
 * upper-ring overhang). The only clean way in or out is over the pitch. So
 * every seat gets a PORTAL: a point above the pitch, in front of the seat
 * (towards the centre spot), at a cruise height just above the roof. The
 * straight line portal → eye is chosen long enough that it passes *under*
 * every overhang edge above the seat (roof leading edge, upper-ring fascia).
 *
 * A flight is then:  [start] —line→ [start portal] —curve→ [end portal] —line→ [end]
 * where a portal is only inserted for endpoints inside the structure (the
 * overview camera is high above, so it needs none). The middle part is a
 * cubic Hermite curve whose end tangents continue the straight lines, so the
 * path is smooth (C1). Segments get parameter ranges proportional to their
 * lengths, so the speed along the path is uniform before easing.
 *
 * Everything is derived from the venue config (no Cluj-specific numbers).
 */

/** An edge above the seats that the camera must pass under (or above). */
export interface Overhang {
  /** Distance of the edge from the bowl reference line. */
  distance: number;
  /** Highest the camera may be when passing below the edge. */
  clearY: number;
}

export interface FlightEnvelope {
  spec: RoundedRectSpec;
  /** Cruise height of the portals (above the roof). */
  portalY: number;
  overhangs: Overhang[];
  /** Portals must be at least this far inside the reference line (over the field, clear of the roof edge). */
  portalMaxDistance: number;
}

/** Margin below an overhang edge that the camera keeps. */
const OVERHANG_MARGIN = 1.2;
/** Shortest approach line (m). */
const MIN_APPROACH = 25;

export function flightEnvelope(config: VenueConfig): FlightEnvelope {
  const overhangs: Overhang[] = [];
  let maxEye = 0;
  for (const stand of config.stands) {
    for (const ring of stand.rings) {
      for (const sector of ring.sectors) {
        const last = sector.rows[sector.rows.length - 1]!;
        maxEye = Math.max(maxEye, last.elevation + config.eyeHeight);
        if (ring.slabThickness === null) continue;
        // An elevated ring: its front (parapet / fascia bottom) is an edge to pass under.
        const { top, bottomY } = standSection(ring, sector);
        const front = top[0]!.d;
        const edge = { distance: front, clearY: bottomY(front) - OVERHANG_MARGIN };
        if (!overhangs.some((o) => Math.abs(o.distance - edge.distance) < 0.01 && Math.abs(o.clearY - edge.clearY) < 0.01)) {
          overhangs.push(edge);
        }
      }
    }
  }
  const roof = config.roof;
  let portalY = maxEye + 10;
  let portalMaxDistance = -5;
  if (roof) {
    // The fascia hangs 1 m below the leading edge of the roof skin (see structure.ts).
    overhangs.push({ distance: roof.inner.distance, clearY: roof.inner.height - 1 - OVERHANG_MARGIN });
    portalY = Math.max(roof.inner.height, roof.outer.height) + 4;
    portalMaxDistance = roof.inner.distance - 5;
  }
  return { spec: config.layout.referenceLine, portalY, overhangs, portalMaxDistance };
}

/** True if a camera position is inside the structure (in the stands, below cruise height). */
export function needsPortal(env: FlightEnvelope, p: Vec3): boolean {
  return signedDistance(env.spec, p) > env.portalMaxDistance && p.y < env.portalY - 0.5;
}

/** Horizontal distance from p, along unit plan direction dir, to where sd drops to `level`. */
function distanceToLevel(env: FlightEnvelope, p: Vec3, dir: Vec3, level: number): number {
  const at = (t: number) => signedDistance(env.spec, { x: p.x + dir.x * t, z: p.z + dir.z * t });
  if (at(0) <= level) return 0;
  let hi = 1;
  while (at(hi) > level && hi < 1e5) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > level) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The portal above the pitch for a camera position inside the structure. */
export function portalFor(env: FlightEnvelope, p: Vec3): Vec3 {
  const plan = Math.hypot(p.x, p.z);
  // Head towards the centre spot (inwards for every stand, including corners).
  const dir = plan > 1e-6 ? vec(-p.x / plan, 0, -p.z / plan) : vec(1, 0, 0);
  const rise = env.portalY - p.y;
  let approach = Math.max(MIN_APPROACH, distanceToLevel(env, p, dir, env.portalMaxDistance) + 5);
  const sd = signedDistance(env.spec, p);
  for (const o of env.overhangs) {
    if (sd <= o.distance || p.y >= o.clearY) continue; // not under this edge
    const s = distanceToLevel(env, p, dir, o.distance);
    // Height on the line at horizontal distance s is p.y + rise * s / approach ≤ clearY.
    approach = Math.max(approach, (rise * s) / (o.clearY - p.y));
  }
  approach = Math.min(approach, plan + 25);
  return add(vec(p.x, env.portalY, p.z), scale(dir, approach));
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

type Segment =
  | { kind: 'line'; a: Vec3; b: Vec3; length: number }
  | { kind: 'curve'; a: Vec3; b: Vec3; ta: Vec3; tb: Vec3; length: number };

export interface Flight {
  /** Pose at path parameter u ∈ [0, 1] (apply easing to time before calling). */
  sample(u: number): CameraPose;
  /** The positions the path passes through (for tests and debugging). */
  waypoints: Vec3[];
}

function hermite(a: Vec3, b: Vec3, ta: Vec3, tb: Vec3, s: number): Vec3 {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return add(add(scale(a, h00), scale(ta, h10)), add(scale(b, h01), scale(tb, h11)));
}

export function planFlight(env: FlightEnvelope, from: CameraPose, to: CameraPose): Flight {
  const start = from.position;
  const end = to.position;
  const startPortal = needsPortal(env, start) ? portalFor(env, start) : null;
  const endPortal = needsPortal(env, end) ? portalFor(env, end) : null;

  const segments: Segment[] = [];
  const a = startPortal ?? start;
  const b = endPortal ?? end;
  if (startPortal) segments.push({ kind: 'line', a: start, b: startPortal, length: length(sub(startPortal, start)) });
  const chord = length(sub(b, a));
  if (chord > 1e-6) {
    // Tangents continue the straight approach lines (C1); their length equals the
    // chord so that speed matches the length-proportional parameterisation.
    const ta = scale(startPortal ? normalize(sub(startPortal, start)) : normalize(sub(b, a)), chord);
    const tb = scale(endPortal ? normalize(sub(end, endPortal)) : normalize(sub(b, a)), chord);
    segments.push({ kind: 'curve', a, b, ta, tb, length: chord });
  }
  if (endPortal) segments.push({ kind: 'line', a: endPortal, b: end, length: length(sub(end, endPortal)) });

  const total = segments.reduce((acc, s) => acc + s.length, 0);
  const position = (u: number): Vec3 => {
    if (total < 1e-9) return end;
    let along = Math.min(Math.max(u, 0), 1) * total;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (along <= seg.length || i === segments.length - 1) {
        const s = seg.length > 0 ? Math.min(along / seg.length, 1) : 1;
        return seg.kind === 'line' ? lerp(seg.a, seg.b, s) : hermite(seg.a, seg.b, seg.ta, seg.tb, s);
      }
      along -= seg.length;
    }
    return end;
  };

  // Orientation: interpolate the view DIRECTION (yaw on the shortest arc,
  // pitch linearly), not the look-target point. Lerping the target from the
  // sector (behind the camera's destination) to the far side of the field
  // swept it right under the moving camera: the view tipped straight down and
  // spun ~180° in a few frames. With angles, pitch never leaves the range of
  // its two endpoints and the turn is spread over the whole flight.
  const look0 = anglesOf(from.position, from.target);
  const look1 = anglesOf(to.position, to.target);
  const dYaw = Math.atan2(Math.sin(look1.yaw - look0.yaw), Math.cos(look1.yaw - look0.yaw));
  const dist0 = length(sub(from.target, from.position));
  const dist1 = length(sub(to.target, to.position));

  return {
    waypoints: [start, ...(startPortal ? [startPortal] : []), ...(endPortal ? [endPortal] : []), end],
    sample(u: number): CameraPose {
      const k = Math.min(Math.max(u, 0), 1);
      if (k === 0) return { position: from.position, target: from.target, fov: from.fov };
      if (k === 1) return { position: end, target: to.target, fov: to.fov };
      const p = position(k);
      const look = { yaw: look0.yaw + dYaw * k, pitch: lerpNumber(look0.pitch, look1.pitch, k) };
      const target = add(p, scale(directionOf(look), Math.max(10, lerpNumber(dist0, dist1, k))));
      return { position: p, target, fov: lerpNumber(from.fov, to.fov, k) };
    },
  };
}
