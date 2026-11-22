import type { Vec2 } from './types.ts';

/**
 * The bowl reference line: a rounded rectangle centred on the centre spot.
 *
 * Why a rounded rectangle? Its offset curve at distance d is again a rounded
 * rectangle (same straights, corner radius R + d). So every row of a bowl is
 * an exact offset of this one line, aisles run along its normals, and lengths
 * have closed forms. An athletics bowl with semicircular ends is the special
 * case cornerRadius = halfWidth.
 *
 * Parametrisation: arc length `s` along the line (metres), starting at the
 * middle of the -z side (point (0, -halfWidth)), moving towards +x. Seen from
 * above (+y) that is clockwise. `s` may be any real number; it wraps with the
 * perimeter. The outward normal angle φ (atan2(nz, nx)) grows monotonically
 * with s, from -π/2 at s = 0.
 */

export interface RoundedRectSpec {
  halfLength: number;
  halfWidth: number;
  cornerRadius: number;
}

interface LineSegment {
  kind: 'line';
  s0: number;
  length: number;
  start: Vec2;
  dir: Vec2;
  normal: Vec2;
}

interface ArcSegment {
  kind: 'arc';
  s0: number;
  length: number;
  center: Vec2;
  /** Outward-normal angle at the start of the arc; it grows by π/2 over the arc. */
  phi0: number;
}

type Segment = LineSegment | ArcSegment;

export interface ReferenceCurve {
  spec: RoundedRectSpec;
  perimeter: number;
  segments: Segment[];
}

export interface CurveFrame {
  point: Vec2;
  /** Unit outward normal (pointing away from the field). */
  normal: Vec2;
  /** Unit tangent in the direction of increasing s. */
  tangent: Vec2;
}

export function makeReferenceCurve(spec: RoundedRectSpec): ReferenceCurve {
  const { halfLength: A, halfWidth: B, cornerRadius: R } = spec;
  if (!(R > 0 && R <= A && R <= B)) {
    throw new Error(`cornerRadius must be in (0, min(halfLength, halfWidth)], got ${R}`);
  }
  const sx = A - R; // half-length of the straights along x
  const sz = B - R; // half-length of the straights along z
  const arc = (Math.PI / 2) * R;

  const raw: Array<Omit<LineSegment, 's0'> | Omit<ArcSegment, 's0'>> = [
    // -z side, from x = 0 towards +x (first half)
    { kind: 'line', length: sx, start: { x: 0, z: -B }, dir: { x: 1, z: 0 }, normal: { x: 0, z: -1 } },
    { kind: 'arc', length: arc, center: { x: sx, z: -sz }, phi0: -Math.PI / 2 },
    // +x end
    { kind: 'line', length: 2 * sz, start: { x: A, z: -sz }, dir: { x: 0, z: 1 }, normal: { x: 1, z: 0 } },
    { kind: 'arc', length: arc, center: { x: sx, z: sz }, phi0: 0 },
    // +z side
    { kind: 'line', length: 2 * sx, start: { x: sx, z: B }, dir: { x: -1, z: 0 }, normal: { x: 0, z: 1 } },
    { kind: 'arc', length: arc, center: { x: -sx, z: sz }, phi0: Math.PI / 2 },
    // -x end
    { kind: 'line', length: 2 * sz, start: { x: -A, z: sz }, dir: { x: 0, z: -1 }, normal: { x: -1, z: 0 } },
    { kind: 'arc', length: arc, center: { x: -sx, z: -sz }, phi0: Math.PI },
    // -z side, back to x = 0 (second half)
    { kind: 'line', length: sx, start: { x: -sx, z: -B }, dir: { x: 1, z: 0 }, normal: { x: 0, z: -1 } },
  ];

  let s = 0;
  const segments: Segment[] = [];
  for (const seg of raw) {
    if (seg.length <= 0) continue; // a zero-length straight (e.g. semicircular ends)
    segments.push({ ...seg, s0: s } as Segment);
    s += seg.length;
  }
  return { spec, perimeter: s, segments };
}

/** s reduced into [0, perimeter). */
export function wrapS(curve: ReferenceCurve, s: number): number {
  const p = curve.perimeter;
  const r = s % p;
  return r < 0 ? r + p : r;
}

function segmentAt(curve: ReferenceCurve, sWrapped: number): Segment {
  const segs = curve.segments;
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i]!;
    if (sWrapped >= seg.s0) return seg;
  }
  return segs[0]!;
}

/** Point, outward normal and tangent of the reference line at arc length s. */
export function frameAt(curve: ReferenceCurve, s: number): CurveFrame {
  const sw = wrapS(curve, s);
  const seg = segmentAt(curve, sw);
  const u = sw - seg.s0;
  if (seg.kind === 'line') {
    return {
      point: { x: seg.start.x + seg.dir.x * u, z: seg.start.z + seg.dir.z * u },
      normal: seg.normal,
      tangent: seg.dir,
    };
  }
  const R = curve.spec.cornerRadius;
  const phi = seg.phi0 + u / R;
  const n = { x: Math.cos(phi), z: Math.sin(phi) };
  return {
    point: { x: seg.center.x + R * n.x, z: seg.center.z + R * n.z },
    normal: n,
    // d(point)/ds = d(n)/dphi = (-sin, cos)
    tangent: { x: -n.z, z: n.x },
  };
}

/** Point at arc length s on the row offset by d (metres, outwards) from the reference line. */
export function pointAt(curve: ReferenceCurve, s: number, d: number): Vec2 {
  const f = frameAt(curve, s);
  return { x: f.point.x + d * f.normal.x, z: f.point.z + d * f.normal.z };
}

/**
 * Total turning of the normal (radians) from s = 0 up to s, unwrapped:
 * Θ(s + perimeter) = Θ(s) + 2π. Straights add nothing; arcs add Δs / R.
 */
export function turning(curve: ReferenceCurve, s: number): number {
  const p = curve.perimeter;
  const k = Math.floor(s / p);
  const sw = s - k * p;
  const R = curve.spec.cornerRadius;
  let theta = 0;
  for (const seg of curve.segments) {
    if (sw <= seg.s0) break;
    if (seg.kind === 'arc') theta += Math.min(sw - seg.s0, seg.length) / R;
  }
  return 2 * Math.PI * k + theta;
}

/**
 * Length of the row at offset d between reference arc lengths s0 < s1.
 * Exact: straights keep their length, arcs scale by (R + d) / R.
 */
export function offsetLength(curve: ReferenceCurve, s0: number, s1: number, d: number): number {
  return s1 - s0 + d * (turning(curve, s1) - turning(curve, s0));
}

/**
 * Inverse of offsetLength: the reference arc length s1 >= s0 at which the row
 * at offset d has covered `length` metres from s0. Walks the segments, so it
 * is exact (no iteration).
 */
export function paramAtOffsetLength(curve: ReferenceCurve, s0: number, d: number, length: number): number {
  if (length < 0) throw new Error('length must be >= 0');
  const R = curve.spec.cornerRadius;
  const p = curve.perimeter;
  let current = s0;
  let remaining = length;
  // At most one full lap of segments plus one.
  for (let guard = 0; guard < curve.segments.length * 2 + 2; guard++) {
    const k = Math.floor(current / p);
    const sw = current - k * p;
    const seg = segmentAt(curve, sw);
    const segEnd = k * p + seg.s0 + seg.length;
    const slope = seg.kind === 'arc' ? (R + d) / R : 1;
    const available = (segEnd - current) * slope;
    if (remaining <= available) return current + remaining / slope;
    remaining -= available;
    current = segEnd;
  }
  throw new Error('paramAtOffsetLength: length exceeds one lap');
}

/**
 * Signed horizontal distance from plan point p to the reference line
 * (negative inside the bowl). Rows are exactly the level sets sd = distance,
 * which is what makes the sightline test exact.
 */
export function signedDistance(spec: RoundedRectSpec, p: Vec2): number {
  const qx = Math.abs(p.x) - (spec.halfLength - spec.cornerRadius);
  const qz = Math.abs(p.z) - (spec.halfWidth - spec.cornerRadius);
  const ox = Math.max(qx, 0);
  const oz = Math.max(qz, 0);
  const outside = Math.hypot(ox, oz);
  const inside = Math.min(Math.max(qx, qz), 0);
  return outside + inside - spec.cornerRadius;
}

/**
 * Reference arc lengths at which to sample a span [s0, s1] so that straight
 * parts get just their end points and arcs get one sample per `maxArcStep`
 * radians. Used to sweep cross-sections into meshes.
 */
export function sampleSpan(curve: ReferenceCurve, s0: number, s1: number, maxArcStep = Math.PI / 48): number[] {
  const out: number[] = [s0];
  const p = curve.perimeter;
  const R = curve.spec.cornerRadius;
  let current = s0;
  for (let guard = 0; guard < curve.segments.length * 2 + 2 && current < s1 - 1e-9; guard++) {
    const k = Math.floor(current / p);
    const seg = segmentAt(curve, current - k * p);
    const segEnd = Math.min(k * p + seg.s0 + seg.length, s1);
    if (seg.kind === 'arc') {
      const steps = Math.max(1, Math.ceil((segEnd - current) / R / maxArcStep));
      for (let i = 1; i <= steps; i++) out.push(current + ((segEnd - current) * i) / steps);
    } else {
      out.push(segEnd);
    }
    current = segEnd;
  }
  // Remove near-duplicates (segment boundaries that coincide with s0/s1).
  return out.filter((s, i) => i === 0 || s - out[i - 1]! > 1e-6);
}
