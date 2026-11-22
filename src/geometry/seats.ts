import type { VenueConfig } from '../venue/schema.ts';
import { frameAt, offsetLength, paramAtOffsetLength, pointAt, type ReferenceCurve } from './roundedRect.ts';
import type { Seat, SeatManifest, SectorInfo } from './types.ts';

/**
 * Seat placement for templates whose rows are offset curves of a reference
 * line (today: the bowl). Nothing venue-specific lives here.
 *
 * In each row, seats sit at a fixed pitch (the seat width). The block is
 * centred in the row's usable length, which is the row length minus half an
 * aisle at each sector boundary. Leftover length reads as wider aisles or
 * vomitories, as in a real stand.
 */

export interface Span {
  from: number;
  to: number;
}

/** Length of the row at offset `distance` inside a sector span, before aisles. */
export function rowLength(curve: ReferenceCurve, span: Span, distance: number): number {
  return offsetLength(curve, span.from, span.to, distance);
}

/** How many seats of width `seatWidth` fit in the row, leaving `aisleWidth` in total for the two half-aisles. */
export function maxSeatsInRow(
  curve: ReferenceCurve,
  span: Span,
  distance: number,
  aisleWidth: number,
  seatWidth: number,
): number {
  const usable = rowLength(curve, span, distance) - aisleWidth;
  return Math.max(0, Math.floor(usable / seatWidth + 1e-9));
}

/**
 * Reference arc lengths of the seat centres for `count` seats in a row.
 * Throws if they don't fit (the validator reports this earlier with context).
 */
export function seatParams(
  curve: ReferenceCurve,
  span: Span,
  distance: number,
  aisleWidth: number,
  seatWidth: number,
  count: number,
): number[] {
  const usable = rowLength(curve, span, distance) - aisleWidth;
  const block = count * seatWidth;
  if (block > usable + 1e-6) {
    throw new Error(`${count} seats need ${block.toFixed(2)} m but the row offers ${usable.toFixed(2)} m`);
  }
  const first = aisleWidth / 2 + (usable - block) / 2 + seatWidth / 2;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(paramAtOffsetLength(curve, span.from, distance, first + i * seatWidth));
  }
  return out;
}

/** Height above the representative tread at which the sector label floats. */
const LABEL_LIFT = 2.0;

/** Build the seat manifest for a venue whose rows are offsets of `curve`. */
export function generateSeatsAlongCurve(config: VenueConfig, curve: ReferenceCurve): SeatManifest {
  const seats: Seat[] = [];
  const sectors: SectorInfo[] = [];

  for (const stand of config.stands) {
    for (const ring of stand.rings) {
      for (const sector of ring.sectors) {
        const seatWidth = sector.seatWidth ?? config.seatWidth;
        const seatStart = seats.length;
        const midRowIndex = Math.floor((sector.rows.length - 1) / 2);
        let representativeSeat = seatStart;

        sector.rows.forEach((row, rowIndex) => {
          const params = seatParams(curve, sector.span, row.distance, config.aisleWidth, seatWidth, row.seats);
          if (rowIndex === midRowIndex) {
            representativeSeat = seats.length + Math.floor((params.length - 1) / 2);
          }
          params.forEach((s, i) => {
            const frame = frameAt(curve, s);
            const p = pointAt(curve, s, row.distance);
            seats.push({
              id: `${sector.code}-R${row.row}-S${i + 1}`,
              stand: stand.id,
              ring: ring.ring,
              sector: sector.code,
              row: row.row,
              seat: i + 1,
              position: { x: p.x, y: row.elevation, z: p.z },
              // Spectators face the field: the inward normal of their row.
              facing: { x: -frame.normal.x, z: -frame.normal.z },
            });
          });
        });

        const midRow = sector.rows[midRowIndex]!;
        const sMid = (sector.span.from + sector.span.to) / 2;
        const anchor = pointAt(curve, sMid, midRow.distance);
        sectors.push({
          code: sector.code,
          name: sector.name,
          standId: stand.id,
          standName: stand.name,
          ring: ring.ring,
          ringName: ring.name,
          tierId: sector.tier,
          category: sector.category,
          estimated: sector.estimated,
          seatStart,
          seatEnd: seats.length,
          rowCount: sector.rows.length,
          representativeSeat,
          labelAnchor: { x: anchor.x, y: midRow.elevation + LABEL_LIFT, z: anchor.z },
        });
      }
    }
  }

  return { venueId: config.id, seats, sectors };
}
