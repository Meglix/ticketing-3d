import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { loadVenue } from '../venue/loadVenue.ts';
import { availableIn, buildAvailability, MAX_SOLD, MIN_SOLD, SOLD } from './availability.ts';

const venue = loadVenue(raw);
const { manifest } = venue;
const sold = buildAvailability(manifest);
const forSale = manifest.sectors.filter((s) => s.category !== 'press');

describe('demo availability (fake, deterministic)', () => {
  it('is deterministic for a seed and changes with the seed', () => {
    expect(buildAvailability(manifest)).toEqual(sold);
    const other = buildAvailability(manifest, 7);
    expect(other).not.toEqual(sold);
    expect(other.length).toBe(manifest.seats.length);
  });

  it('sells 60–75 % of every sector that is for sale (62–73 % by construction)', () => {
    for (const s of forSale) {
      const n = s.seatEnd - s.seatStart;
      const ratio = (n - availableIn(s, sold)) / n;
      expect(ratio, s.code).toBeGreaterThanOrEqual(0.6);
      expect(ratio, s.code).toBeLessThanOrEqual(0.75);
      expect(ratio, s.code).toBeGreaterThanOrEqual(MIN_SOLD - 1 / n);
      expect(ratio, s.code).toBeLessThanOrEqual(MAX_SOLD + 1 / n);
    }
  });

  it('never offers press seats', () => {
    const press = manifest.sectors.find((s) => s.category === 'press')!;
    expect(availableIn(press, sold)).toBe(0);
  });

  it('clusters: a sold seat is more likely to have a sold neighbour than chance', () => {
    let soldPairs = 0;
    let soldSeats = 0;
    let total = 0;
    let soldAll = 0;
    for (const s of forSale) {
      for (let i = s.seatStart; i < s.seatEnd; i++) {
        total++;
        if (sold[i] !== SOLD) continue;
        soldAll++;
        const next = manifest.seats[i + 1];
        if (i + 1 < s.seatEnd && next && next.row === manifest.seats[i]!.row) {
          soldSeats++;
          if (sold[i + 1] === SOLD) soldPairs++;
        }
      }
    }
    const pNeighbour = soldPairs / soldSeats;
    const base = soldAll / total;
    expect(pNeighbour).toBeGreaterThan(base + 0.05);
  });

  it('sells lower rows and central seats first', () => {
    let lowSold = 0, lowN = 0, highSold = 0, highN = 0, midSold = 0, midN = 0, edgeSold = 0, edgeN = 0;
    for (const s of forSale) {
      const seats = manifest.seats.slice(s.seatStart, s.seatEnd);
      const rows = seats.map((x) => x.row);
      const minR = Math.min(...rows);
      const maxR = Math.max(...rows);
      if (maxR === minR) continue;
      seats.forEach((seat, k) => {
        const i = s.seatStart + k;
        const rel = (seat.row - minR) / (maxR - minR);
        if (rel <= 1 / 3) (lowN++, (lowSold += sold[i]!));
        if (rel >= 2 / 3) (highN++, (highSold += sold[i]!));
        const rowSeats = seats.filter((x) => x.row === seat.row).length;
        const c = Math.abs(seat.seat - (rowSeats + 1) / 2) / (rowSeats / 2);
        if (c <= 0.33) (midN++, (midSold += sold[i]!));
        if (c >= 0.75) (edgeN++, (edgeSold += sold[i]!));
      });
    }
    expect(lowSold / lowN).toBeGreaterThan(highSold / highN + 0.1);
    expect(midSold / midN).toBeGreaterThan(edgeSold / edgeN + 0.1);
  });
});
