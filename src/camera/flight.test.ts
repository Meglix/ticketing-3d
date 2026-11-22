/**
 * The camera must never fly through the roof or the stands: for every
 * sector, from both overview framings, back out, between every pair of
 * seats, and when re-targeted mid-flight.
 */
import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { signedDistance } from '../geometry/roundedRect.ts';
import { standSection } from '../geometry/structure.ts';
import type { Vec3 } from '../geometry/types.ts';
import { loadVenue } from '../venue/loadVenue.ts';
import { boxCorners, defaultOverviewOrbit, length, overviewPose, seatPose, seatViewPose, sub, type CameraPose } from './cameraMath.ts';
import { sectorFocusPose } from './focus.ts';
import { flightEnvelope, needsPortal, planFlight, portalFor } from './flight.ts';
import { framingOutline } from './framing.ts';

const venue = loadVenue(raw);
const { config, structure, manifest } = venue;
const env = flightEnvelope(config);
const outline = framingOutline(venue);
const spec = config.layout.referenceLine;
const roof = config.roof!;

const skinY = (d: number) =>
  roof.inner.height + ((d - roof.inner.distance) / (roof.outer.distance - roof.inner.distance)) * (roof.outer.height - roof.inner.height);
const colBottom = skinY(roof.columnDistance) - 0.3 - roof.trussDepth;
/** Lowest point of the roof structure (fascia / truss bottom chord) at distance d. */
const roofUnderside = (d: number) => {
  const t = (d - roof.inner.distance) / (roof.columnDistance - roof.inner.distance);
  return roof.inner.height - 1 + t * (colBottom - (roof.inner.height - 1));
};

// One sector per ring describes the cross-section (every stand shares it in this venue;
// treating it as continuous all around is conservative at the corner gaps).
const sections = config.stands
  .flatMap((s) => s.rings.map((r) => ({ ring: r, sector: r.sectors[0]! })))
  .filter((x, i, all) => all.findIndex((y) => y.ring.ring === x.ring.ring) === i)
  .map(({ ring, sector }) => ({ ring, ...standSection(ring, sector) }));

function stepTop(top: { d: number; y: number }[], d: number): number | null {
  let best: number | null = null;
  for (let k = 0; k < top.length - 1; k++) {
    const p = top[k]!;
    const q = top[k + 1]!;
    if (q.d - p.d > 1e-9 && d >= p.d && d <= q.d) {
      const y = p.y + ((d - p.d) / (q.d - p.d)) * (q.y - p.y);
      best = best === null ? y : Math.max(best, y);
    }
  }
  return best;
}

/** Why a camera position is inside solid structure, or null if it is in free air. */
function collision(p: Vec3): string | null {
  if (p.y < 0.5) return 'below ground';
  const d = signedDistance(spec, p);
  // Roof slab (treated as continuous all around).
  if (d >= roof.inner.distance - 0.3 && d <= roof.outer.distance + 0.3) {
    const above = p.y >= skinY(Math.min(d, roof.outer.distance)) + 0.5;
    const below = d <= roof.columnDistance - 1 && p.y <= roofUnderside(d) - 0.3;
    if (!above && !below) return `roof (d=${d.toFixed(2)}, y=${p.y.toFixed(2)})`;
  }
  for (const s of sections) {
    const top = stepTop(s.top, d);
    if (top === null) continue;
    const bottom = s.ring.slabThickness === null ? -Infinity : s.bottomY(d);
    if (p.y < top + 0.3 && p.y > bottom - 0.2) return `ring ${s.ring.ring} (d=${d.toFixed(2)}, y=${p.y.toFixed(2)}, top=${top.toFixed(2)})`;
  }
  return null;
}

function check(flightName: string, from: CameraPose, to: CameraPose, samples = 240): string[] {
  const flight = planFlight(env, from, to);
  const problems: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const pose = flight.sample(u);
    // The very end is the seat itself (eye 1.2 m above the tread, which is fine).
    const why = collision(pose.position);
    if (why) {
      problems.push(`${flightName} @u=${u.toFixed(3)}: ${why}`);
      break;
    }
  }
  return problems;
}

const seatPoseOf = (index: number, aspect: number) => seatPose(manifest.seats[index]!.position, config.eyeHeight, aspect);
const reps = manifest.sectors.map((s) => ({ code: s.code, index: s.representativeSeat }));

describe('flight envelope', () => {
  it('derives portals above the roof and the overhang edges from the config', () => {
    expect(env.portalY).toBeGreaterThan(Math.max(roof.inner.height, roof.outer.height));
    expect(env.overhangs.length).toBeGreaterThanOrEqual(2); // roof edge + upper-ring fascia
  });

  it('puts every seat portal over the field and above the roof', () => {
    for (const { code, index } of reps) {
      const eye = seatPoseOf(index, 1.6).position;
      expect(needsPortal(env, eye), code).toBe(true);
      const portal = portalFor(env, eye);
      expect(signedDistance(spec, portal)).toBeLessThan(roof.inner.distance - 4);
      expect(portal.y).toBe(env.portalY);
    }
  });

  it('frames the real outline tighter than the bounding box (closer camera)', () => {
    for (const aspect of [1.6, 390 / 844]) {
      const orbit = defaultOverviewOrbit(aspect);
      const tight = overviewPose(outline, aspect, orbit).position;
      const loose = overviewPose(boxCorners(structure.bounds), aspect, orbit).position;
      expect(length(tight)).toBeLessThan(length(loose) * 0.97);
    }
  });

  it('starts and ends exactly at the requested poses', () => {
    const from = overviewPose(outline, 1.6, defaultOverviewOrbit(1.6));
    const to = seatPoseOf(reps[10]!.index, 1.6);
    const f = planFlight(env, from, to);
    expect(length(sub(f.sample(0).position, from.position))).toBeLessThan(1e-9);
    expect(length(sub(f.sample(1).position, to.position))).toBeLessThan(1e-9);
    expect(f.sample(1).fov).toBeCloseTo(to.fov, 12);
    expect(f.waypoints).toHaveLength(3); // overview, portal, seat
  });

  it('moves continuously (no jumps between samples)', () => {
    const from = overviewPose(outline, 0.46, defaultOverviewOrbit(0.46));
    const f = planFlight(env, from, seatPoseOf(reps[30]!.index, 0.46));
    let prev = f.sample(0).position;
    let maxStep = 0;
    for (let i = 1; i <= 1000; i++) {
      const p = f.sample(i / 1000).position;
      maxStep = Math.max(maxStep, length(sub(p, prev)));
      prev = p;
    }
    expect(maxStep).toBeLessThan(2); // < 2 m per 1/1000 of the path
  });
});

describe('flights never pass through the roof or the stands', () => {
  it('(control) the collision check does catch a naive straight-line flight', () => {
    // Laptop overview sits behind Tribuna II; a straight line down to a lower-ring
    // seat in Tribuna II (under its own roof and upper ring) must be caught.
    const overview = overviewPose(outline, 1.6, defaultOverviewOrbit(1.6));
    const t1Lower = manifest.sectors.find((s) => s.code === '1L')!;
    const seat = seatPoseOf(t1Lower.representativeSeat, 1.6);
    let hit: string | null = null;
    for (let i = 0; i <= 400 && !hit; i++) {
      const u = i / 400;
      hit = collision({
        x: overview.position.x + (seat.position.x - overview.position.x) * u,
        y: overview.position.y + (seat.position.y - overview.position.y) * u,
        z: overview.position.z + (seat.position.z - overview.position.z) * u,
      });
    }
    expect(hit).not.toBeNull();
  });

  it('from the overview (laptop and phone framing) to every sector, and back', () => {
    const problems: string[] = [];
    for (const aspect of [1440 / 900, 390 / 844]) {
      const overview = overviewPose(outline, aspect, defaultOverviewOrbit(aspect));
      for (const { code, index } of reps) {
        const seat = seatPoseOf(index, aspect);
        problems.push(...check(`overview→${code}`, overview, seat));
        problems.push(...check(`${code}→overview`, seat, overview));
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('from orbited overviews (other sides, low and high) to every sector', () => {
    const problems: string[] = [];
    for (const azimuth of [0, Math.PI / 2, Math.PI / 4, -3 * Math.PI / 4]) {
      for (const elevation of [0.45, 1.3]) {
        const overview = overviewPose(outline, 1.6, { azimuth, elevation, zoom: 0.5 });
        for (const { code, index } of reps) problems.push(...check(`orbit(${azimuth.toFixed(2)},${elevation})→${code}`, overview, seatPoseOf(index, 1.6), 160));
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('between every pair of sectors (seat → seat)', () => {
    const problems: string[] = [];
    for (const a of reps) {
      for (const b of reps) {
        if (a === b) continue;
        problems.push(...check(`${a.code}→${b.code}`, seatPoseOf(a.index, 1.6), seatPoseOf(b.index, 1.6), 120));
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('when re-targeted mid-flight (rapid taps)', () => {
    const problems: string[] = [];
    const overview = overviewPose(outline, 1.6, defaultOverviewOrbit(1.6));
    for (let i = 0; i < reps.length; i += 3) {
      const first = planFlight(env, overview, seatPoseOf(reps[i]!.index, 1.6));
      for (const u of [0.2, 0.5, 0.8, 0.95]) {
        const midway = first.sample(u);
        const next = reps[(i + 17) % reps.length]!;
        problems.push(...check(`retarget ${reps[i]!.code}@${u}→${next.code}`, midway, seatPoseOf(next.index, 1.6), 160));
        problems.push(...check(`retarget ${reps[i]!.code}@${u}→overview`, midway, overview, 160));
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});

describe('V2 flights: overview → sector focus → seat view (and back)', () => {
  const lastRow = new Map<string, number>();
  for (const st of config.stands)
    for (const ring of st.rings) for (const sec of ring.sectors) lastRow.set(sec.code, sec.rows[sec.rows.length - 1]!.row);

  function firstCollision(from: CameraPose, to: CameraPose): string | null {
    const flight = planFlight(env, from, to);
    for (let i = 0; i <= 600; i++) {
      const hit = collision(flight.sample(i / 600).position);
      if (hit) return hit;
    }
    return null;
  }

  it('never passes through the roof or the stands, for every sector and its representative seat (laptop and phone)', () => {
    const problems: string[] = [];
    for (const aspect of [1440 / 900, 390 / 844]) {
      const overview = overviewPose(outline, aspect, defaultOverviewOrbit(aspect));
      for (const sector of manifest.sectors) {
        const focus = sectorFocusPose(venue, sector.code, aspect);
        const seat = manifest.seats[sector.representativeSeat]!;
        const view = seatViewPose(seat, config.eyeHeight, aspect, seat.row === lastRow.get(sector.code));
        const legs: [string, CameraPose, CameraPose][] = [
          ['overview→focus', overview, focus],
          ['focus→seat', focus, view],
          ['seat→focus', view, focus],
          ['focus→overview', focus, overview],
        ];
        for (const [name, a, b] of legs) {
          const hit = firstCollision(a, b);
          if (hit) problems.push(`${sector.code} ${name} (aspect ${aspect.toFixed(2)}): ${hit}`);
        }
        // The seat camera itself must not sit inside the structure.
        const at = collision(view.position);
        if (at) problems.push(`${sector.code} seat view position: ${at}`);
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('frames the sector focus from over the field, outside the roof line', () => {
    for (const sector of manifest.sectors) {
      const focus = sectorFocusPose(venue, sector.code, 1.6);
      expect(signedDistance(config.layout.referenceLine, focus.position), sector.code).toBeLessThan(config.roof!.inner.distance);
      expect(focus.position.y, sector.code).toBeGreaterThan(focus.target.y);
    }
  });
});

describe('flight orientation (no spin)', () => {
  const lastRow = new Map<string, number>();
  for (const st of config.stands)
    for (const ring of st.rings) for (const sec of ring.sectors) lastRow.set(sec.code, sec.rows[sec.rows.length - 1]!.row);
  const pitchOf = (p: CameraPose) => Math.atan2(p.target.y - p.position.y, Math.hypot(p.target.x - p.position.x, p.target.z - p.position.z));
  const yawOf = (p: CameraPose) => Math.atan2(p.target.z - p.position.z, p.target.x - p.position.x);

  it('never looks further down than its two end poses, and turns evenly (sector focus → seat view, every sector, laptop and phone)', () => {
    const N = 220;
    for (const aspect of [1440 / 900, 390 / 844]) {
      for (const sector of manifest.sectors) {
        const seat = manifest.seats[sector.representativeSeat]!;
        const from = sectorFocusPose(venue, sector.code, aspect);
        const to = seatViewPose(seat, config.eyeHeight, aspect, seat.row === lastRow.get(sector.code));
        const flight = planFlight(env, from, to);
        const lowest = Math.min(pitchOf(from), pitchOf(to));
        let prevYaw = yawOf(flight.sample(0));
        for (let i = 1; i <= N; i++) {
          const pose = flight.sample(i / N);
          expect(pitchOf(pose), `${sector.code} pitch @${i}`).toBeGreaterThanOrEqual(lowest - 1e-6);
          const yaw = yawOf(pose);
          const step = Math.abs(Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw)));
          expect(step, `${sector.code} yaw step @${i}`).toBeLessThanOrEqual(Math.PI / N + 1e-6);
          prevYaw = yaw;
        }
      }
    }
  });
});
