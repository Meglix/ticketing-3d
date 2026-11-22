import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { frameAt, pointAt } from '../geometry/roundedRect.ts';
import { loadVenue } from '../venue/loadVenue.ts';
import { nearestParam, sectorAtPoint } from './hitSector.ts';

const venue = loadVenue(raw);
const { curve, manifest } = venue;

describe('nearestParam', () => {
  it('inverts pointAt for points on and off the reference line', () => {
    for (let s = 0; s < curve.perimeter; s += 4.3) {
      for (const d of [0, 3, 15, 30]) {
        const got = nearestParam(curve, pointAt(curve, s, d));
        const a = frameAt(curve, got).point;
        const b = frameAt(curve, s).point;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
      }
    }
  });
});

describe('sectorAtPoint', () => {
  it('maps every seat (and the tread under it) to its own sector', () => {
    const wrong: string[] = [];
    for (let i = 0; i < manifest.seats.length; i += 7) {
      const seat = manifest.seats[i]!;
      for (const lift of [0.001, 0.5]) {
        const got = sectorAtPoint(venue, { ...seat.position, y: seat.position.y + lift });
        if (got !== seat.sector) wrong.push(`${seat.id}+${lift}: ${got}`);
      }
    }
    expect(wrong.slice(0, 10)).toEqual([]);
  });

  it('returns null for the pitch and the sky', () => {
    expect(sectorAtPoint(venue, { x: 0, y: 0, z: 0 })).toBeNull();
    expect(sectorAtPoint(venue, { x: 0, y: 80, z: -60 })).toBeNull();
  });
});
