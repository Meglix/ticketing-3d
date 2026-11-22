/**
 * The core guarantees of the generated Cluj Arena seat map:
 *  1. every seat in the config is generated, and the total matches the venue capacity;
 *  2. no two seats are closer than a seat width;
 *  3. every seat has an unobstructed sightline to the pitch centre.
 * These run on the real venues/cluj-arena.json, so a bad edit to the data fails CI.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { loadVenue, type Venue } from '../venue/loadVenue.ts';
import { signedDistance } from './roundedRect.ts';
import { nearestTouchlinePoint, sightline, standObstacles } from './sightlines.ts';

let venue: Venue;
beforeAll(() => {
  venue = loadVenue(raw);
});

describe('seat count', () => {
  it('generates exactly the capacity declared in the config (30,335)', () => {
    const { config, manifest } = venue;
    const fromRows = config.stands
      .flatMap((s) => s.rings.flatMap((r) => r.sectors.flatMap((x) => x.rows)))
      .reduce((a, r) => a + r.seats, 0);
    expect(manifest.seats.length).toBe(fromRows);
    expect(manifest.seats.length).toBe(config.capacity.total);
    expect(config.capacity.total).toBe(30335);
  });

  it('matches the VIP / press / accessible breakdown', () => {
    const { manifest, config } = venue;
    const byCategory = { standard: 0, vip: 0, press: 0, accessible: 0 };
    for (const sector of manifest.sectors) byCategory[sector.category] += sector.seatEnd - sector.seatStart;
    expect(byCategory.vip).toBe(config.capacity.vip);
    expect(byCategory.press).toBe(config.capacity.press);
    expect(byCategory.accessible).toBe(config.capacity.accessible);
  });

  it('gives every seat a unique id and keeps each sector contiguous', () => {
    const { manifest } = venue;
    expect(new Set(manifest.seats.map((s) => s.id)).size).toBe(manifest.seats.length);
    let expectedStart = 0;
    for (const sector of manifest.sectors) {
      expect(sector.seatStart).toBe(expectedStart);
      for (let i = sector.seatStart; i < sector.seatEnd; i++) expect(manifest.seats[i]!.sector).toBe(sector.code);
      expect(sector.representativeSeat).toBeGreaterThanOrEqual(sector.seatStart);
      expect(sector.representativeSeat).toBeLessThan(sector.seatEnd);
      expectedStart = sector.seatEnd;
    }
    expect(expectedStart).toBe(manifest.seats.length);
  });
});

describe('seat spacing', () => {
  it('has no two seats closer than their seat width (1 mm tolerance for curved rows)', () => {
    const { manifest, config } = venue;
    const widthBySector = new Map<string, number>();
    for (const st of config.stands)
      for (const r of st.rings) for (const s of r.sectors) widthBySector.set(s.code, s.seatWidth ?? config.seatWidth);

    // Spatial hash with cells of the smallest seat width: any pair closer than
    // that width lies in the same or a neighbouring cell.
    const cell = Math.min(...widthBySector.values());
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    manifest.seats.forEach((seat, i) => {
      const k = key(Math.floor(seat.position.x / cell), Math.floor(seat.position.y / cell), Math.floor(seat.position.z / cell));
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    });

    let worst = Infinity;
    const violations: string[] = [];
    manifest.seats.forEach((a, i) => {
      const cx = Math.floor(a.position.x / cell);
      const cy = Math.floor(a.position.y / cell);
      const cz = Math.floor(a.position.z / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
              if (j <= i) continue;
              const b = manifest.seats[j]!;
              const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
              const need = Math.min(widthBySector.get(a.sector)!, widthBySector.get(b.sector)!);
              worst = Math.min(worst, dist - need);
              if (dist < need - 1e-3) violations.push(`${a.id} ↔ ${b.id}: ${dist.toFixed(4)} m < ${need} m`);
            }
          }
    });
    expect(violations.slice(0, 10)).toEqual([]);
    expect(worst).toBeGreaterThan(-1e-3);
  });

  it('places every seat on its row (signed distance = row distance) and facing the field', () => {
    const { manifest, config, curve } = venue;
    const distance = new Map<string, number>();
    for (const st of config.stands)
      for (const r of st.rings)
        for (const s of r.sectors) for (const row of s.rows) distance.set(`${s.code}:${row.row}`, row.distance);
    for (const seat of manifest.seats) {
      const sd = signedDistance(curve.spec, seat.position);
      expect(Math.abs(sd - distance.get(`${seat.sector}:${seat.row}`)!)).toBeLessThan(1e-6);
      // Facing points towards the inside of the bowl.
      expect(seat.facing.x * -seat.position.x + seat.facing.z * -seat.position.z).toBeGreaterThan(0);
    }
  });
});

describe('sightlines', () => {
  /** Minimum C-value and parapet clearance per sector for a given focus point. */
  function sweep(focusFor: (p: { x: number; z: number }) => { x: number; y: number; z: number }) {
    const { manifest, config, curve } = venue;
    const obstaclesByStand = new Map(config.stands.map((s) => [s.id, standObstacles(config, s)]));
    const rowDistance = new Map<string, number>();
    for (const st of config.stands)
      for (const r of st.rings)
        for (const s of r.sectors) for (const row of s.rows) rowDistance.set(`${s.code}:${row.row}`, row.distance);
    const perSector = new Map<string, { c: number; parapet: number; seats: number }>();
    for (const seat of manifest.seats) {
      const res = sightline(
        curve.spec,
        seat,
        rowDistance.get(`${seat.sector}:${seat.row}`)!,
        config.eyeHeight,
        focusFor(seat.position),
        obstaclesByStand.get(seat.stand)!,
      );
      const agg = perSector.get(seat.sector) ?? { c: Infinity, parapet: Infinity, seats: 0 };
      agg.c = Math.min(agg.c, res.cValue);
      agg.parapet = Math.min(agg.parapet, res.parapetClearance);
      agg.seats++;
      perSector.set(seat.sector, agg);
    }
    return perSector;
  }

  it('gives every seat an unobstructed view of the pitch centre (C ≥ minCValue, clear of parapets)', () => {
    const perSector = sweep(() => ({ x: 0, y: 0, z: 0 }));
    const failing = [...perSector.entries()]
      .filter(([, v]) => v.c < venue.config.minCValue || v.parapet < 0)
      .map(([code, v]) => `${code}: C=${v.c.toFixed(3)} m, parapet clearance=${v.parapet.toFixed(3)} m`);
    expect(failing).toEqual([]);
    expect(perSector.size).toBe(venue.manifest.sectors.length);
  });

  it('also clears heads towards the nearest touchline (stricter than required: C ≥ minCValue)', () => {
    const pitch = venue.config.pitch;
    const perSector = sweep((p) => nearestTouchlinePoint(pitch, p));
    const rows = [...perSector.entries()].map(([code, v]) => ({ code, minC_mm: Math.round(v.c * 1000) }));
    rows.sort((a, b) => a.minC_mm - b.minC_mm);
    // Printed for REPORT.md.
    console.log('Lowest touchline C-values (mm):', rows.slice(0, 6).map((r) => `${r.code}=${r.minC_mm}`).join(', '));
    expect(rows[0]!.minC_mm).toBeGreaterThanOrEqual(venue.config.minCValue * 1000);
  });
});
