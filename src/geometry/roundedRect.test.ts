import { describe, expect, it } from 'vitest';
import {
  frameAt,
  makeReferenceCurve,
  offsetLength,
  paramAtOffsetLength,
  pointAt,
  sampleSpan,
  signedDistance,
  turning,
  wrapS,
} from './roundedRect.ts';

const spec = { halfLength: 92, halfWidth: 50, cornerRadius: 30 };
const curve = makeReferenceCurve(spec);

/** Length of the offset row by brute force: sum of many short chords. */
function numericLength(s0: number, s1: number, d: number, steps = 20000): number {
  let len = 0;
  let prev = pointAt(curve, s0, d);
  for (let i = 1; i <= steps; i++) {
    const p = pointAt(curve, s0 + ((s1 - s0) * i) / steps, d);
    len += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return len;
}

describe('rounded-rectangle reference curve', () => {
  it('has the closed-form perimeter 4(A−R) + 4(B−R) + 2πR', () => {
    expect(curve.perimeter).toBeCloseTo(4 * 62 + 4 * 20 + 2 * Math.PI * 30, 9);
  });

  it('starts at the middle of the −z side with an outward normal −z', () => {
    const f = frameAt(curve, 0);
    expect(f.point.x).toBeCloseTo(0);
    expect(f.point.z).toBeCloseTo(-50);
    expect(f.normal).toEqual({ x: 0, z: -1 });
  });

  it('is continuous across every segment boundary and wraps around', () => {
    for (const seg of curve.segments) {
      const before = frameAt(curve, seg.s0 - 1e-9);
      const after = frameAt(curve, seg.s0 + 1e-9);
      expect(Math.hypot(before.point.x - after.point.x, before.point.z - after.point.z)).toBeLessThan(1e-6);
      expect(Math.hypot(before.normal.x - after.normal.x, before.normal.z - after.normal.z)).toBeLessThan(1e-6);
    }
    const a = frameAt(curve, -10);
    const b = frameAt(curve, curve.perimeter - 10);
    expect(a.point.x).toBeCloseTo(b.point.x, 9);
    expect(wrapS(curve, -1)).toBeCloseTo(curve.perimeter - 1, 9);
  });

  it('has unit normals perpendicular to unit tangents', () => {
    for (let s = 0; s < curve.perimeter; s += 3.7) {
      const { normal: n, tangent: t } = frameAt(curve, s);
      expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 12);
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(1, 12);
      expect(n.x * t.x + n.z * t.z).toBeCloseTo(0, 12);
    }
  });

  it('accumulates exactly 2π of turning per lap', () => {
    expect(turning(curve, curve.perimeter)).toBeCloseTo(2 * Math.PI, 9);
    expect(turning(curve, 2 * curve.perimeter + 5) - turning(curve, 5)).toBeCloseTo(4 * Math.PI, 9);
  });

  it('computes offset row lengths exactly (vs. numeric integration)', () => {
    const cases: Array<[number, number, number]> = [
      [-85.56, 85.56, 0],
      [-85.56, 85.56, 12],
      [60, 130, 20],
      [300, 600, 5], // wraps past the start
    ];
    for (const [s0, s1, d] of cases) {
      expect(offsetLength(curve, s0, s1, d)).toBeCloseTo(numericLength(s0, s1, d), 3);
    }
  });

  it('inverts offsetLength with paramAtOffsetLength', () => {
    for (const [s0, d] of [[-80, 3], [100, 15], [400, 22]] as const) {
      for (const L of [0, 1, 17.3, 55, 140]) {
        const s1 = paramAtOffsetLength(curve, s0, d, L);
        expect(offsetLength(curve, s0, s1, d)).toBeCloseTo(L, 9);
      }
    }
  });

  it('makes rows level sets of the signed distance (the basis of the sightline test)', () => {
    for (let s = 0; s < curve.perimeter; s += 5.3) {
      for (const d of [0, 1, 7.5, 22, 31]) {
        expect(signedDistance(spec, pointAt(curve, s, d))).toBeCloseTo(d, 9);
      }
    }
    expect(signedDistance(spec, { x: 0, z: 0 })).toBeCloseTo(-50, 9);
  });

  it('samples straights by their ends and arcs densely', () => {
    // [-40, 40] lies on the −z straight, which is split at s = 0 (the seam of the parametrisation).
    const straight = sampleSpan(curve, -40, 40);
    expect(straight).toEqual([-40, 0, 40]);
    expect(sampleSpan(curve, 5, 50)).toEqual([5, 50]);
    const corner = sampleSpan(curve, 62, 62 + (Math.PI / 2) * 30);
    expect(corner.length).toBeGreaterThan(20);
    expect(corner[0]).toBe(62);
  });

  it('supports semicircular ends (cornerRadius = halfWidth) and rejects impossible radii', () => {
    const athletics = makeReferenceCurve({ halfLength: 90, halfWidth: 48, cornerRadius: 48 });
    expect(athletics.perimeter).toBeCloseTo(4 * 42 + 2 * Math.PI * 48, 9);
    expect(() => makeReferenceCurve({ halfLength: 40, halfWidth: 50, cornerRadius: 45 })).toThrow(/cornerRadius/);
  });
});
