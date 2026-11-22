import type { Vec3 } from '../geometry/types.ts';

/**
 * Pure camera math (no three.js, no React): easing, the overview pose that
 * frames the whole venue for any screen shape, and the seat pose with its
 * look-around limits. CameraRig.tsx applies these to the real camera.
 *
 * Angles: yaw = atan2(z, x) in the plan (radians), pitch = elevation of the
 * view direction above the horizon (radians, negative = looking down).
 */

export interface CameraPose {
  position: Vec3;
  /** Point the camera looks at. */
  target: Vec3;
  /** Vertical field of view, degrees (three.js convention). */
  fov: number;
}

export interface Bounds {
  halfLength: number;
  halfWidth: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Small vector helpers
// ---------------------------------------------------------------------------
export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : vec(0, 0, 0);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const lerpNumber = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const deg = (d: number): number => (d * Math.PI) / 180;
export const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Wrap an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  const r = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // [0, 2π)
  const w = r - Math.PI; // [−π, π)
  return w <= -Math.PI ? w + 2 * Math.PI : w;
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/** Ease-in-out cubic on [0, 1]; clamps outside. Slow start, fast middle, slow arrival. */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewOrbit {
  /** Plan angle of the camera around the centre spot (yaw of the offset target → camera). */
  azimuth: number;
  /** Angle of the camera above the horizon, seen from the target. */
  elevation: number;
  /** Multiplier on the distance that exactly frames the venue (< 1 = closer). */
  zoom: number;
}

export const OVERVIEW_FOV = 40;
export const OVERVIEW_LIMITS = {
  minElevation: deg(25),
  maxElevation: deg(82),
  minZoom: 0.4,
  maxZoom: 1.35,
};

export const isPortrait = (aspect: number): boolean => aspect < 1;

/**
 * Default overview orbit. Landscape: camera behind Tribuna II (+z), looking at
 * the main stand, so Tribuna I's premium inventory (VIP 1C/1D, press, the
 * 100-lei sectors) faces the camera with both rings visible. Seen from behind
 * Tribuna I, its own upper-ring overhang hid the lower ring. The pitch's long
 * axis runs left–right. Portrait (phones): camera behind Peluza I (−x), so the
 * long axis runs up–down and the stadium fills the screen.
 */
export function defaultOverviewOrbit(aspect: number): OverviewOrbit {
  return isPortrait(aspect)
    ? { azimuth: Math.PI, elevation: deg(60), zoom: 1 }
    : { azimuth: Math.PI / 2, elevation: deg(52), zoom: 1 };
}

/** Unit vector from the orbit target towards the camera. */
export function orbitDirection(azimuth: number, elevation: number): Vec3 {
  const c = Math.cos(elevation);
  return vec(c * Math.cos(azimuth), Math.sin(elevation), c * Math.sin(azimuth));
}

/** The 8 corners of the venue's bounding box (a conservative framing outline). */
export function boxCorners(bounds: Bounds): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) for (const y of [0, bounds.height]) out.push(vec(sx * bounds.halfLength, y, sz * bounds.halfWidth));
  return out;
}

/**
 * Smallest camera distance (along `dir` from `target`) at which every point
 * of `outline` is inside the view frustum, with `margin` (> 1 leaves a
 * border). Exact: each point gives a linear bound on the distance.
 */
export function fitDistance(
  outline: Vec3[],
  target: Vec3,
  dir: Vec3,
  fovDeg: number,
  aspect: number,
  margin: number,
): number {
  const forward = scale(normalize(dir), -1);
  const right = normalize(cross(forward, vec(0, 1, 0)));
  const up = cross(right, forward);
  const tanV = Math.tan(deg(fovDeg) / 2) / margin;
  const tanH = tanV * aspect;
  let dist = 0;
  for (const p of outline) {
    const rel = sub(p, target);
    const x = dot(rel, right);
    const yy = dot(rel, up);
    const depth = dot(rel, forward); // + is further from the camera than the target
    dist = Math.max(dist, Math.abs(x) / tanH - depth, Math.abs(yy) / tanV - depth);
  }
  return dist;
}

/**
 * Overview pose for the current screen shape and orbit. `outline` = points
 * that must be visible (the venue's real outline at ground and roof height
 * frames tighter than its bounding box).
 */
export function overviewPose(outline: Vec3[], aspect: number, orbit: OverviewOrbit): CameraPose {
  const target = vec(0, 0, 0);
  const dir = orbitDirection(orbit.azimuth, orbit.elevation);
  // Phones get a slightly larger border: header and legend sit over the canvas.
  const margin = isPortrait(aspect) ? 1.1 : 1.05;
  const distance = fitDistance(outline, target, dir, OVERVIEW_FOV, aspect, margin) * orbit.zoom;
  return { position: add(target, scale(dir, distance)), target, fov: OVERVIEW_FOV };
}

/** Keep a user-modified orbit inside its limits. */
export function clampOrbit(orbit: OverviewOrbit): OverviewOrbit {
  return {
    azimuth: wrapAngle(orbit.azimuth),
    elevation: clamp(orbit.elevation, OVERVIEW_LIMITS.minElevation, OVERVIEW_LIMITS.maxElevation),
    zoom: clamp(orbit.zoom, OVERVIEW_LIMITS.minZoom, OVERVIEW_LIMITS.maxZoom),
  };
}

// ---------------------------------------------------------------------------
// Seat view
// ---------------------------------------------------------------------------

export interface LookAngles {
  yaw: number;
  pitch: number;
}

/** Look-around limits in the seat view. */
export const SEAT_LOOK_LIMITS = {
  /** Max turn either side of the direction to the pitch centre. */
  yaw: deg(75),
  minPitch: deg(-50),
  maxPitch: deg(20),
};

/**
 * Vertical fov for the seat view. We aim for ~90° of horizontal view (an
 * immersive "what I see from my seat" width that also keeps your own seat in
 * frame). On a landscape laptop that is ~64° vertical. On a portrait phone it would be absurdly tall, so the
 * vertical fov is capped at 78° and the user looks around by dragging.
 */
export function seatFov(aspect: number): number {
  const wantedHorizontal = deg(90);
  const vertical = 2 * Math.atan(Math.tan(wantedHorizontal / 2) / aspect);
  return clamp(toDeg(vertical), 50, 78);
}

/** Above this vertical fov the initial seat view is tilted down (see seatPose). */
export const SEAT_TILT_FROM_FOV = 66;

/** Downward tilt (radians) of the initial seat look for this screen shape; 0 on landscape screens. */
export function seatTilt(aspect: number): number {
  return deg(Math.max(0, seatFov(aspect) - SEAT_TILT_FROM_FOV) / 2);
}

/**
 * The camera pose when sitting on a seat: eye above the tread, looking towards
 * `focus` (the centre spot). From most seats that direction is close to the
 * horizon, so on a tall portrait view (fov 78°) centring on it would fill the
 * top of the screen with sky. There the initial look is tilted down by half
 * the extra fov, so the far stand sits near the top edge as it would on a
 * laptop. The yaw (and so the look-around limits) still centre on `focus`.
 */
export function seatPose(seatPosition: Vec3, eyeHeight: number, aspect: number, focus: Vec3 = vec(0, 0, 0)): CameraPose {
  const eye = add(seatPosition, vec(0, eyeHeight, 0));
  const fov = seatFov(aspect);
  const tilt = seatTilt(aspect);
  if (tilt === 0) return { position: eye, target: focus, fov };
  const base = anglesOf(eye, focus);
  const look = { yaw: base.yaw, pitch: Math.max(SEAT_LOOK_LIMITS.minPitch, base.pitch - tilt) };
  return { position: eye, target: add(eye, scale(directionOf(look), length(sub(focus, eye)))), fov };
}

export function anglesOf(from: Vec3, to: Vec3): LookAngles {
  const d = sub(to, from);
  return { yaw: Math.atan2(d.z, d.x), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}

export function directionOf(a: LookAngles): Vec3 {
  const c = Math.cos(a.pitch);
  return vec(c * Math.cos(a.yaw), Math.sin(a.pitch), c * Math.sin(a.yaw));
}

/** Clamp a look direction to the seat limits around `base` (the direction to the pitch centre). */
export function clampLook(base: LookAngles, look: LookAngles, limits = SEAT_LOOK_LIMITS): LookAngles {
  const relative = clamp(wrapAngle(look.yaw - base.yaw), -limits.yaw, limits.yaw);
  return {
    yaw: wrapAngle(base.yaw + relative),
    pitch: clamp(look.pitch, limits.minPitch, limits.maxPitch),
  };
}

// ---------------------------------------------------------------------------
// V2 seat view: "over the shoulder" so your own seat is in frame
// ---------------------------------------------------------------------------

/** How far behind the seat centre the V2 seat camera sits (m); 0.3 in a last row (back wall). */
export const SEAT_VIEW_BACK = 0.62;
export const SEAT_VIEW_BACK_LAST_ROW = 0.3;
/** Extra height over the seated eye point (m): the camera looks over your own seat back. */
export const SEAT_VIEW_LIFT = 0.25;
/** Extra downward tilt of the initial look, so armrests and the rows in front are in frame. */
export const SEAT_VIEW_DOWN = deg(9);

/**
 * The V2 seat-view camera. Like the reference, it sits just behind and above
 * the seated eye point (0.62 m back, 0.25 m up), so the bottom of the frame
 * shows your own seat back and armrests and the backs of the seats in front.
 * Yaw still centres on `focus` (look-around limits are unchanged). The exact
 * eye point (seatPose) is what the sightline maths uses.
 */
export function seatViewPose(
  seat: { position: Vec3; facing: { x: number; z: number } },
  eyeHeight: number,
  aspect: number,
  lastRow = false,
  focus: Vec3 = vec(0, 0, 0),
): CameraPose {
  const back = lastRow ? SEAT_VIEW_BACK_LAST_ROW : SEAT_VIEW_BACK;
  const eye = vec(
    seat.position.x - seat.facing.x * back,
    seat.position.y + eyeHeight + SEAT_VIEW_LIFT,
    seat.position.z - seat.facing.z * back,
  );
  const fov = seatFov(aspect);
  const base = anglesOf(eye, focus);
  const look = {
    yaw: base.yaw,
    pitch: Math.max(SEAT_LOOK_LIMITS.minPitch, base.pitch - SEAT_VIEW_DOWN - seatTilt(aspect)),
  };
  return { position: eye, target: add(eye, scale(directionOf(look), length(sub(focus, eye)))), fov };
}

