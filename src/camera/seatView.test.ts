import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import raw from '../../venues/cluj-arena.json';
import { loadVenue } from '../venue/loadVenue.ts';
import { SEAT_BACK_TOP, seatTopOnScreen, seatViewPose } from './cameraMath.ts';

const venue = loadVenue(raw);
const { seats, sectors } = venue.manifest;

/** The top of a seat's own backrest, in world space. */
const backTop = (s: (typeof seats)[number]) =>
  new Vector3(
    s.position.x - s.facing.x * SEAT_BACK_TOP.behind,
    s.position.y + SEAT_BACK_TOP.up,
    s.position.z - s.facing.z * SEAT_BACK_TOP.behind,
  );

describe('seat view framing', () => {
  for (const [name, aspect] of [
    ['laptop', 1440 / 900],
    ['phone', 390 / 844],
  ] as const) {
    it(`puts the top of your own seat back just above the UI on a ${name}, for lower- and upper-ring seats alike`, () => {
      let checked = 0;
      for (const sector of sectors) {
        const seat = seats[sector.representativeSeat]!;
        const pose = seatViewPose(seat, venue.config.eyeHeight, aspect);
        const cam = new PerspectiveCamera(pose.fov, aspect, 0.05, 5000);
        cam.position.set(pose.position.x, pose.position.y, pose.position.z);
        cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
        cam.updateMatrixWorld(true);
        const ndc = backTop(seat).project(cam);
        expect(Math.abs(ndc.x), `${seat.id} centred`).toBeLessThan(0.02);
        expect(ndc.y, `${seat.id} height on screen`).toBeCloseTo(seatTopOnScreen(aspect), 2);
        checked++;
      }
      expect(checked).toBe(sectors.length);
    });
  }
});
