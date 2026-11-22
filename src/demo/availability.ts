/**
 * ============================================================================
 *  DEMO DATA — fake ticket availability. Not connected to any ticketing
 *  system; it only makes the demo look like a real sale is in progress.
 * ============================================================================
 *
 * Deterministic (seeded PRNG per sector, so every load and every screenshot
 * is identical) and realistic:
 * - each sector is 62–73 % sold (drawn per sector);
 * - seats sell in "bookings" of 1–6 adjacent seats in the same row (real
 *   buyers come in groups, so sold seats cluster);
 * - bookings land preferentially on lower rows and central seats, the ones
 *   that sell first in reality;
 * - press seats are never for sale.
 *
 * Output: one byte per seat of the manifest (same index), SOLD or AVAILABLE.
 */
import type { SeatManifest, SectorInfo } from '../geometry/types.ts';

export const AVAILABLE = 0;
export const SOLD = 1;

export const MIN_SOLD = 0.62;
export const MAX_SOLD = 0.73;

/** Group sizes of a booking and their probabilities (couples and families dominate). */
const GROUPS: [size: number, p: number][] = [
  [1, 0.1],
  [2, 0.36],
  [3, 0.18],
  [4, 0.24],
  [5, 0.07],
  [6, 0.05],
];

/** mulberry32: tiny, fast, good-enough PRNG; same seed → same sequence everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, to derive a per-sector seed. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickGroupSize(rnd: () => number): number {
  let u = rnd();
  for (const [size, p] of GROUPS) {
    if (u < p) return size;
    u -= p;
  }
  return 2;
}

/** Fill `sold` for one sector. */
function sellSector(manifest: SeatManifest, sector: SectorInfo, sold: Uint8Array, seed: number): void {
  const { seats } = manifest;
  const start = sector.seatStart;
  const n = sector.seatEnd - start;
  if (n === 0) return;
  if (sector.category === 'press') {
    sold.fill(SOLD, start, sector.seatEnd); // never for sale
    return;
  }
  const rnd = mulberry32(seed ^ hash(sector.code));
  const target = Math.round(n * (MIN_SOLD + rnd() * (MAX_SOLD - MIN_SOLD)));

  // Row extents: seats of a row are contiguous and ordered by seat number.
  const rowStart = new Map<number, number>();
  const rowEnd = new Map<number, number>();
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (let i = start; i < sector.seatEnd; i++) {
    const r = seats[i]!.row;
    if (!rowStart.has(r)) rowStart.set(r, i);
    rowEnd.set(r, i + 1);
    minRow = Math.min(minRow, r);
    maxRow = Math.max(maxRow, r);
  }

  // Desirability: lower rows and central seats first (cubed for a clear preference).
  const weight = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const seat = seats[start + i]!;
    const r0 = rowStart.get(seat.row)!;
    const len = rowEnd.get(seat.row)! - r0;
    const lower = maxRow > minRow ? 1 - (seat.row - minRow) / (maxRow - minRow) : 1;
    const central = len > 1 ? 1 - Math.abs(start + i - r0 - (len - 1) / 2) / ((len - 1) / 2) : 1;
    const w = Math.pow(0.15 + 0.5 * lower + 0.35 * central, 3);
    weight[i] = w;
    total += w;
  }

  let count = 0;
  let guard = 0;
  while (count < target && guard++ < n * 20) {
    // Weighted pick of an unsold seat to start a booking at.
    let u = rnd() * total;
    let i = 0;
    for (; i < n - 1; i++) {
      u -= weight[i]!;
      if (u <= 0) break;
    }
    if (sold[start + i] === SOLD) continue;
    const seat = seats[start + i]!;
    const lo = rowStart.get(seat.row)!;
    const hi = rowEnd.get(seat.row)!;
    let size = Math.min(pickGroupSize(rnd), target - count);
    // Grow the booking left/right from the picked seat over free seats of the same row.
    let left = start + i;
    let right = start + i;
    sold[left] = SOLD;
    size--;
    count++;
    const goRight = rnd() < 0.5;
    while (size > 0) {
      const canRight = right + 1 < hi && sold[right + 1] !== SOLD;
      const canLeft = left - 1 >= lo && sold[left - 1] !== SOLD;
      if (!canRight && !canLeft) break;
      if ((goRight && canRight) || !canLeft) sold[++right] = SOLD;
      else sold[--left] = SOLD;
      size--;
      count++;
    }
    // Sold seats no longer attract bookings.
    for (let k = left; k <= right; k++) {
      total -= weight[k - start]!;
      weight[k - start] = 0;
    }
    if (total <= 1e-12) break;
  }
}

/** Availability of every seat in the manifest: SOLD or AVAILABLE, by manifest index. */
export function buildAvailability(manifest: SeatManifest, seed = 2026): Uint8Array {
  const sold = new Uint8Array(manifest.seats.length);
  for (const sector of manifest.sectors) sellSector(manifest, sector, sold, seed);
  return sold;
}

/** Number of free seats in a sector. */
export function availableIn(sector: SectorInfo, sold: Uint8Array): number {
  let free = 0;
  for (let i = sector.seatStart; i < sector.seatEnd; i++) if (sold[i] === AVAILABLE) free++;
  return free;
}

const cache = new WeakMap<SeatManifest, Uint8Array>();

/** Availability for a manifest, computed once and shared (renderer, picker, UI). */
export function availabilityFor(manifest: SeatManifest): Uint8Array {
  let sold = cache.get(manifest);
  if (!sold) {
    sold = buildAvailability(manifest);
    cache.set(manifest, sold);
  }
  return sold;
}
