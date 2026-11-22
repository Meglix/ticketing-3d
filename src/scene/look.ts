import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { smoothstep } from './meshData.ts';

/**
 * The V2 "look": a handful of numbers that every scene component reads in its
 * own useFrame, written once per frame by <LookDirector/> (which runs first).
 * Keeping them here means the whole cinematic behaviour is tuned in one place:
 *
 *  holo   1 → the venue reads as a luminous model (glowing lines, seats as
 *         fine light, roof as a wireframe); 0 → solid, realistic materials.
 *         Driven by the camera's distance from the centre spot, so it
 *         crossfades by itself as the camera flies in.
 *  intro  seconds since the intro started (≥ INTRO_SECONDS when done/skipped).
 *  power  floodlight master level 0…1 (the intro ramps it up).
 *  speed  camera speed (m/s), for the speed blur.
 */
export const look = {
  holo: 1,
  intro: 0,
  power: 0,
  speed: 0,
};

/** Length of the opening sequence (s): darkness → floodlights on in sequence → settle. */
export const INTRO_SECONDS = 7;
/** When the first floodlight frame powers on, and the gap between frames (s). */
const POWER_START = 0.9;
const POWER_STEP = 0.55;
const POWER_RAMP = 0.7;

let introStartMs: number | null = null;

/** Jump to the end of the intro (tap / click / reduced motion). */
export function skipIntro(): void {
  look.intro = INTRO_SECONDS;
}

export const introDone = (): boolean => look.intro >= INTRO_SECONDS;

/** Camera distance (m from the centre spot) → holo factor. Overview ≈ 300–500 m, sector focus ≈ 60–100 m. */
export function holoForDistance(distance: number): number {
  return smoothstep(115, 240, distance);
}

/** Power of floodlight group i (of n) at intro time t: they switch on one after another with a short ramp. */
export function groupPower(i: number, n: number, t: number): number {
  void n;
  return smoothstep(0, 1, (t - POWER_START - i * POWER_STEP) / POWER_RAMP);
}

/** Overall light level at intro time t (pitch, bloom): follows the last group to power on. */
export function masterPower(t: number, groups: number): number {
  return groupPower(groups - 1, groups, t) * 0.55 + groupPower(0, groups, t) * 0.45;
}

/** Updates `look` once per frame, before everything else (priority −1 keeps auto-rendering on). */
export function LookDirector({ groups }: { groups: number }) {
  const prevRef = useRef({ x: 0, y: 0, z: 0, init: false });
  useFrame(({ camera }, delta) => {
    const prev = prevRef.current;
    const p = camera.position;
    // The intro clock (wall-clock seconds since the first frame): the camera
    // rig and the lights both read it, so a slow device still gets a 7 s intro
    // rather than one stretched over many slow frames. Skipping jumps it to
    // INTRO_SECONDS (see skipIntro()).
    if (look.intro < INTRO_SECONDS) {
      const now = performance.now();
      if (introStartMs === null) introStartMs = now - look.intro * 1000;
      look.intro = Math.min(INTRO_SECONDS, (now - introStartMs) / 1000);
    }
    look.holo = holoForDistance(p.length());
    look.power = masterPower(look.intro, groups);
    if (prev.init && delta > 0) {
      const v = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / delta;
      look.speed += (v - look.speed) * Math.min(1, delta * 10); // smoothed
    }
    prev.x = p.x;
    prev.y = p.y;
    prev.z = p.z;
    prev.init = true;
  }, -1);
  return null;
}
