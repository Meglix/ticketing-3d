import { describe, expect, it } from 'vitest';
import {
  anglesOf,
  boxCorners,
  clampLook,
  clampOrbit,
  cross,
  defaultOverviewOrbit,
  deg,
  directionOf,
  dot,
  easeInOutCubic,
  fitDistance,
  normalize,
  OVERVIEW_FOV,
  OVERVIEW_LIMITS,
  overviewPose,
  scale,
  SEAT_LOOK_LIMITS,
  seatFov,
  seatPose,
  sub,
  vec,
  wrapAngle,
  type CameraPose,
} from './cameraMath.ts';

const bounds = { halfLength: 123.1, halfWidth: 81.1, height: 33.6 };
const box = boxCorners(bounds);

/** Project a world point with a pose to normalised screen coords (−1..1). */
function project(pose: CameraPose, aspect: number, p: { x: number; y: number; z: number }) {
  const f = normalize(sub(pose.target, pose.position));
  const r = normalize(cross(f, vec(0, 1, 0)));
  const u = cross(r, f);
  const rel = sub(p, pose.position);
  const depth = dot(rel, f);
  const t = Math.tan(deg(pose.fov) / 2);
  return { x: dot(rel, r) / depth / (t * aspect), y: dot(rel, u) / depth / t, depth };
}

const corners = () => box;

describe('easing', () => {
  it('runs 0 → 1, is symmetric and monotonic, and clamps', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
    let prev = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v + easeInOutCubic(1 - t)).toBeCloseTo(1, 12);
      prev = v;
    }
    // Starts and ends slowly.
    expect(easeInOutCubic(0.05)).toBeLessThan(0.01);
  });
});

describe('angles', () => {
  it('wraps into (−π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5, 12);
    expect(wrapAngle(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 12);
  });

  it('round-trips look angles and directions', () => {
    const a = { yaw: 1.1, pitch: -0.4 };
    const back = anglesOf(vec(0, 0, 0), directionOf(a));
    expect(back.yaw).toBeCloseTo(a.yaw, 12);
    expect(back.pitch).toBeCloseTo(a.pitch, 12);
  });
});

describe('overview framing', () => {
  for (const [name, aspect] of [
    ['laptop 1440×900', 1440 / 900],
    ['phone 390×844', 390 / 844],
  ] as const) {
    it(`fits every corner of the venue on screen (${name}) and is tight`, () => {
      const pose = overviewPose(box, aspect, defaultOverviewOrbit(aspect));
      let maxExtent = 0;
      for (const c of corners()) {
        const s = project(pose, aspect, c);
        expect(s.depth).toBeGreaterThan(0);
        expect(Math.abs(s.x)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(s.y)).toBeLessThanOrEqual(1 + 1e-9);
        maxExtent = Math.max(maxExtent, Math.abs(s.x), Math.abs(s.y));
      }
      // Tight: the widest corner is within the margin of the frame edge.
      expect(maxExtent).toBeGreaterThan(0.85);
      expect(pose.fov).toBe(OVERVIEW_FOV);
    });
  }

  it('lays the long axis horizontally on a laptop and vertically on a phone', () => {
    for (const aspect of [1440 / 900, 390 / 844]) {
      const pose = overviewPose(box, aspect, defaultOverviewOrbit(aspect));
      const a = project(pose, aspect, vec(-bounds.halfLength, 0, 0));
      const b = project(pose, aspect, vec(bounds.halfLength, 0, 0));
      // Compare in pixels (x is scaled by aspect).
      const dxPx = Math.abs(a.x - b.x) * aspect;
      const dyPx = Math.abs(a.y - b.y);
      if (aspect > 1) expect(dxPx).toBeGreaterThan(dyPx);
      else expect(dyPx).toBeGreaterThan(dxPx);
    }
  });

  it('looks down at an angle and zoom scales the distance', () => {
    const aspect = 1.6;
    const orbit = defaultOverviewOrbit(aspect);
    const pose = overviewPose(box, aspect, orbit);
    expect(pose.position.y).toBeGreaterThan(bounds.height * 2);
    const closer = overviewPose(box, aspect, { ...orbit, zoom: 0.5 });
    expect(Math.hypot(closer.position.x, closer.position.y, closer.position.z)).toBeCloseTo(
      0.5 * Math.hypot(pose.position.x, pose.position.y, pose.position.z),
      6,
    );
  });

  it('fitDistance grows when the frame is narrower', () => {
    const dir = normalize(vec(0, 1, -1));
    expect(fitDistance(box, vec(0, 0, 0), dir, 40, 0.5, 1)).toBeGreaterThan(fitDistance(box, vec(0, 0, 0), dir, 40, 1.6, 1));
  });

  it('clamps user orbits', () => {
    const o = clampOrbit({ azimuth: 7, elevation: deg(5), zoom: 9 });
    expect(o.elevation).toBe(OVERVIEW_LIMITS.minElevation);
    expect(o.zoom).toBe(OVERVIEW_LIMITS.maxZoom);
    expect(o.azimuth).toBeCloseTo(7 - 2 * Math.PI, 12);
  });
});

describe('seat view', () => {
  it('puts the eye above the tread and looks at the centre spot', () => {
    const pose = seatPose(vec(10, 5, -60), 1.2, 1.6);
    expect(pose.position).toEqual(vec(10, 6.2, -60));
    expect(pose.target).toEqual(vec(0, 0, 0));
  });

  it('uses ~55° vertical fov on a laptop and a capped wider fov on a phone', () => {
    expect(seatFov(1440 / 900)).toBeGreaterThan(50);
    expect(seatFov(1440 / 900)).toBeLessThan(60);
    expect(seatFov(390 / 844)).toBe(78);
    // Horizontal coverage on a laptop is ~80°.
    const h = 2 * Math.atan(Math.tan(deg(seatFov(1.6)) / 2) * 1.6);
    expect((h * 180) / Math.PI).toBeCloseTo(80, 0);
  });

  it('clamps look-around to ±75° yaw and −50°…+20° pitch', () => {
    const base = { yaw: Math.PI / 2, pitch: -0.3 };
    const far = clampLook(base, { yaw: base.yaw + 2, pitch: 1.2 });
    expect(wrapAngle(far.yaw - base.yaw)).toBeCloseTo(SEAT_LOOK_LIMITS.yaw, 12);
    expect(far.pitch).toBe(SEAT_LOOK_LIMITS.maxPitch);
    const other = clampLook(base, { yaw: base.yaw - 2, pitch: -1.5 });
    expect(wrapAngle(other.yaw - base.yaw)).toBeCloseTo(-SEAT_LOOK_LIMITS.yaw, 12);
    expect(other.pitch).toBe(SEAT_LOOK_LIMITS.minPitch);
    // Across the ±π seam.
    const seam = clampLook({ yaw: Math.PI - 0.1, pitch: 0 }, { yaw: -Math.PI + 0.2, pitch: 0 });
    expect(wrapAngle(seam.yaw - (Math.PI - 0.1))).toBeCloseTo(0.3, 12);
    const inside = clampLook(base, { yaw: base.yaw + 0.2, pitch: -0.2 });
    expect(inside.yaw).toBeCloseTo(base.yaw + 0.2, 12);
    expect(scale(directionOf(inside), 1).y).toBeLessThan(0);
  });
});
