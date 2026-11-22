import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '../geometry/types.ts';
import { TestSeam } from '../interaction/TestSeam.tsx';
import { actions, appStore } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import {
  anglesOf,
  clamp,
  clampLook,
  clampOrbit,
  defaultOverviewOrbit,
  deg,
  directionOf,
  easeInOutCubic,
  isPortrait,
  length,
  lerp,
  lerpNumber,
  OVERVIEW_LIMITS,
  overviewPose,
  scale,
  seatFov,
  seatTilt,
  seatViewPose,
  sub,
  add,
  vec,
  wrapAngle,
  type CameraPose,
  type LookAngles,
  type OverviewOrbit,
} from './cameraMath.ts';
import { INTRO_SECONDS, look, skipIntro } from '../scene/look.ts';
import { flightEnvelope, planFlight, type Flight } from './flight.ts';
import { sectorFocusPose } from './focus.ts';
import { framingOutline } from './framing.ts';

/**
 * Drives the single camera. A small state machine, advanced in useFrame:
 *
 *   intro ──► overview ◄──► flying ◄──► seat
 *
 * - The store says where the camera should be (view + seatId). Whenever that
 *   changes, a new 1.5 s flight starts FROM THE CURRENT POSE. That is why rapid
 *   taps are safe: each tap re-targets smoothly, nothing is queued or snapped.
 * - When a flight ends, actions.arrive() clears `inTransit`.
 * - Overview: drag = orbit, wheel / pinch = zoom (within limits).
 *   Seat: drag = look around (±75° yaw around the pitch centre, −50°…+20° pitch).
 * - The frame loop reads the store directly (appStore.get()), so moving the
 *   camera never re-renders React.
 */

/** Flight durations (s): between levels, and the cinematic dive into a seat. */
const FLIGHT_SECONDS = 1.6;
const SEAT_FLIGHT_SECONDS = 2.2;
/** A pointer that moves less than this (CSS px) is a tap, not a drag. Same threshold as the sector handlers. */
export const TAP_SLOP_PX = 6;
const ORBIT_SPEED = 0.005; // rad per px
const TILT_SPEED = 0.004; // rad per px
const ORIGIN = vec(0, 0, 0);

type Mode = 'intro' | 'overview' | 'flying' | 'sector' | 'seat';

interface RigState {
  mode: Mode;
  /** Destination currently being served: 'overview' or 'seat:<id>'. */
  goalKey: string;
  flight: Flight | null;
  flightStart: number;
  flightGoal: 'overview' | 'sector' | 'seat';
  flightSeconds: number;
  introFrom: OverviewOrbit;
  orbit: OverviewOrbit;
  aspect: number;
  lookBase: LookAngles;
  look: LookAngles;
  lookDistance: number;
  /** Portrait down-tilt (rad) already included in `look`; re-applied if the screen rotates. */
  lookTilt: number;
  /** Tilt baked into the current flight's seat goal. */
  goalTilt: number;
  /** Point the camera currently looks at. */
  target: Vec3;
  dragging: boolean;
}

const toVec = (v: { x: number; y: number; z: number }): Vec3 => vec(v.x, v.y, v.z);

function lerpOrbit(a: OverviewOrbit, b: OverviewOrbit, t: number): OverviewOrbit {
  return {
    azimuth: a.azimuth + wrapAngle(b.azimuth - a.azimuth) * t,
    elevation: lerpNumber(a.elevation, b.elevation, t),
    zoom: lerpNumber(a.zoom, b.zoom, t),
  };
}

/** Where the cinematic intro starts: far out, lower, swung ~140° around the bowl. */
function introOrbit(orbit: OverviewOrbit): OverviewOrbit {
  return {
    azimuth: orbit.azimuth - deg(140),
    elevation: Math.max(OVERVIEW_LIMITS.minElevation, orbit.elevation - deg(18)),
    zoom: orbit.zoom * 1.7,
  };
}

/** Intro easing: smootherstep — gentle start, long soft settle. */
function introEase(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (6 * x - 15) + 10);
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function CameraRig({ venue }: { venue: Venue }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const env = useMemo(() => flightEnvelope(venue.config), [venue]);
  const outline = useMemo(() => framingOutline(venue), [venue]);

  /** Last row number per sector (the seat camera sits closer to its seat there: back wall). */
  const lastRowOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of venue.config.stands)
      for (const ring of st.rings) for (const sec of ring.sectors) m.set(sec.code, sec.rows[sec.rows.length - 1]!.row);
    return m;
  }, [venue]);

  const rig = useRef<RigState | null>(null);
  if (rig.current === null) {
    const aspect = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1.6;
    const orbit = defaultOverviewOrbit(aspect);
    rig.current = {
      mode: prefersReducedMotion() ? 'overview' : 'intro',
      goalKey: 'overview',
      flight: null,
      flightStart: 0,
      flightGoal: 'overview',
      flightSeconds: FLIGHT_SECONDS,
      introFrom: introOrbit(orbit),
      orbit,
      aspect,
      lookBase: { yaw: 0, pitch: 0 },
      look: { yaw: 0, pitch: 0 },
      lookDistance: 1,
      lookTilt: 0,
      goalTilt: 0,
      target: ORIGIN,
      dragging: false,
    };
  }

  useEffect(() => {
    if (rig.current?.mode === 'overview') skipIntro(); // reduced motion: no intro
  }, []);

  // ------------------------------------------------------------------------
  // Input: orbit / look / zoom on the canvas element, Escape on the window.
  // ------------------------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;
    const r = rig.current!;
    el.style.touchAction = 'none'; // the browser must not scroll/zoom the page on touch drags
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number } | null = null;
    let pinch: { dist: number; zoom: number } | null = null;

    const pointerDistance = (): number => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
    };
    /** Skip the intro: lights snap on, the camera eases into the overview. */
    const endIntro = (): void => {
      if (r.mode !== 'intro') return;
      skipIntro();
      r.mode = 'overview';
    };

    // The tap that skips the intro does only that: its click must not also
    // select whatever sector happens to be under it while the camera moves.
    let swallowClick = false;
    const onClickCapture = (e: MouseEvent): void => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
    };

    const onDown = (e: PointerEvent): void => {
      swallowClick = r.mode === 'intro';
      endIntro(); // a tap or click anywhere skips the intro
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downAt = { x: e.clientX, y: e.clientY };
        r.dragging = false;
      } else if (pointers.size === 2) {
        pinch = { dist: Math.max(1, pointerDistance()), zoom: r.orbit.zoom };
        r.dragging = true;
      }
    };

    const onMove = (e: PointerEvent): void => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);

      if (pointers.size >= 2) {
        if (pinch && (r.mode === 'overview' || r.mode === 'intro')) {
          endIntro();
          r.orbit = clampOrbit({ ...r.orbit, zoom: (pinch.zoom * pinch.dist) / Math.max(1, pointerDistance()) });
        }
        return;
      }
      if (!downAt) return;
      if (!r.dragging) {
        if (Math.hypot(cur.x - downAt.x, cur.y - downAt.y) < TAP_SLOP_PX) return;
        r.dragging = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        el.style.cursor = 'grabbing';
      }
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      endIntro();
      if (r.mode === 'overview') {
        r.orbit = clampOrbit({
          azimuth: r.orbit.azimuth + dx * ORBIT_SPEED,
          elevation: r.orbit.elevation + dy * TILT_SPEED,
          zoom: r.orbit.zoom,
        });
      } else if (r.mode === 'seat') {
        // "Drag the world": content follows the finger (≈ 1:1 at the screen centre).
        const k = deg(camera.fov) / Math.max(1, el.clientHeight);
        r.look = clampLook(r.lookBase, { yaw: r.look.yaw - dx * k, pitch: r.look.pitch + dy * k });
      }
    };

    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        downAt = null;
        r.dragging = false;
        el.style.cursor = '';
      } else {
        // One finger left after a pinch: continue as a drag from where it is.
        downAt = [...pointers.values()][0] ?? null;
      }
    };

    const onWheel = (e: WheelEvent): void => {
      endIntro();
      if (r.mode !== 'overview') return;
      e.preventDefault();
      r.orbit = clampOrbit({ ...r.orbit, zoom: r.orbit.zoom * Math.exp(e.deltaY * 0.0012) });
    };

    // Capture phase: runs before the UI's own Escape handling, and stays out of
    // the way while the checkout modal is open (the modal closes itself).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const s = appStore.get();
      if (s.checkoutOpen || s.view === 'overview') return;
      actions.back(); // seat → sector → overview
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('click', onClickCapture, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [gl, camera]);

  // ------------------------------------------------------------------------
  // Frame loop
  // ------------------------------------------------------------------------
  useFrame((state, delta) => {
    const r = rig.current!;
    const cam = state.camera as PerspectiveCamera;
    const now = state.clock.elapsedTime;
    const aspect = state.size.width / Math.max(1, state.size.height);

    // Screen shape changed (resize / rotation): re-frame for the new shape.
    if (Math.abs(aspect - r.aspect) > 1e-3) {
      if (isPortrait(aspect) !== isPortrait(r.aspect)) {
        r.orbit = { ...defaultOverviewOrbit(aspect), zoom: r.orbit.zoom };
        if (r.mode === 'intro') r.mode = 'overview';
      }
      r.aspect = aspect;
    }

    const apply = (pose: CameraPose): void => {
      cam.position.set(pose.position.x, pose.position.y, pose.position.z);
      // Near plane follows the camera height: fine detail at a seat, depth precision in the overview.
      const near = clamp(pose.position.y * 0.01, 0.1, 2);
      if (Math.abs(cam.fov - pose.fov) > 1e-4 || Math.abs(cam.near - near) > 1e-3 || cam.far !== 5000) {
        cam.fov = pose.fov;
        cam.near = near;
        cam.far = 5000;
        cam.updateProjectionMatrix();
      }
      cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
      r.target = pose.target;
    };

    // A new destination from the store → fly there from wherever we are.
    const s = appStore.get();
    const key =
      s.view === 'seat' && s.seatId
        ? `seat:${s.seatId}`
        : s.view === 'sector' && s.selectedSector
          ? `sector:${s.selectedSector}`
          : 'overview';
    if (key !== r.goalKey) {
      r.goalKey = key;
      let goal: CameraPose;
      r.flightSeconds = FLIGHT_SECONDS;
      if (key === 'overview') {
        goal = overviewPose(outline, aspect, r.orbit);
        r.flightGoal = 'overview';
      } else if (key.startsWith('sector:')) {
        if (!venue.sectorByCode.has(s.selectedSector!)) {
          actions.goToOverview(); // unknown sector: fail safe
          return;
        }
        goal = sectorFocusPose(venue, s.selectedSector!, aspect);
        r.flightGoal = 'sector';
      } else {
        const seat = venue.seatById.get(s.seatId!);
        if (!seat) {
          actions.goToOverview(); // unknown seat id: fail safe, back to the overview
          return;
        }
        goal = seatViewPose(seat, venue.config.eyeHeight, aspect, seat.row === lastRowOf.get(seat.sector), ORIGIN);
        r.goalTilt = seatTilt(aspect);
        r.flightGoal = 'seat';
        r.flightSeconds = SEAT_FLIGHT_SECONDS;
      }
      const from: CameraPose = { position: toVec(cam.position), target: r.target, fov: cam.fov };
      r.flight = planFlight(env, from, goal);
      r.flightStart = now;
      r.mode = 'flying';
    }

    switch (r.mode) {
      case 'intro': {
        // The intro clock lives in `look` (the lights read the same clock).
        const t = look.intro / INTRO_SECONDS;
        apply(overviewPose(outline, aspect, lerpOrbit(r.introFrom, r.orbit, introEase(t))));
        if (t >= 1) r.mode = 'overview';
        break;
      }
      case 'flying': {
        const t = (now - r.flightStart) / r.flightSeconds;
        const pose = r.flight!.sample(easeInOutCubic(t));
        apply(pose);
        if (t >= 1) {
          r.flight = null;
          if (r.flightGoal === 'sector') {
            r.mode = 'sector';
          } else if (r.flightGoal === 'seat') {
            r.mode = 'seat';
            // Limits centre on the pitch centre; the initial look is the flight's
            // final target (tilted down on portrait screens, see seatPose).
            r.lookBase = anglesOf(pose.position, ORIGIN);
            r.look = clampLook(r.lookBase, anglesOf(pose.position, pose.target));
            r.lookDistance = length(sub(pose.target, pose.position));
            r.lookTilt = r.goalTilt;
          } else {
            r.mode = 'overview';
          }
          actions.arrive();
        }
        break;
      }
      case 'overview': {
        // Follow the (user-controlled) orbit with a little damping.
        const goal = overviewPose(outline, aspect, r.orbit);
        const k = 1 - Math.exp(-delta * 10);
        apply({
          position: lerp(toVec(cam.position), goal.position, k),
          target: lerp(r.target, goal.target, k),
          fov: lerpNumber(cam.fov, goal.fov, k),
        });
        break;
      }
      case 'sector': {
        // Hold the 3/4 focus view (re-framed if the screen shape changes).
        const code = appStore.get().selectedSector;
        if (!code) break;
        const goal = sectorFocusPose(venue, code, aspect);
        const k = 1 - Math.exp(-delta * 8);
        apply({
          position: lerp(toVec(cam.position), goal.position, k),
          target: lerp(r.target, goal.target, k),
          fov: lerpNumber(cam.fov, goal.fov, k),
        });
        break;
      }
      case 'seat': {
        // Phone rotated (during the flight or while seated): swap the portrait
        // down-tilt for the one this screen shape wants, keeping the user's look.
        const tilt = seatTilt(aspect);
        if (Math.abs(tilt - r.lookTilt) > 1e-6) {
          r.look = clampLook(r.lookBase, { yaw: r.look.yaw, pitch: r.look.pitch - (tilt - r.lookTilt) });
          r.lookTilt = tilt;
        }
        const eye = toVec(cam.position);
        const wanted = add(eye, scale(directionOf(r.look), r.lookDistance));
        const k = 1 - Math.exp(-delta * 18);
        apply({ position: eye, target: lerp(r.target, wanted, k), fov: lerpNumber(cam.fov, seatFov(aspect), k) });
        break;
      }
    }
  });

  const seamHooks = useMemo(
    () => ({
      isCameraIdle: () => ['overview', 'sector', 'seat'].includes(rig.current!.mode),
      cameraMode: () => rig.current!.mode,
      cameraPose: (): CameraPose => ({ position: toVec(camera.position), target: rig.current!.target, fov: camera.fov }),
    }),
    [camera],
  );
  return <TestSeam venue={venue} {...seamHooks} />;
}
