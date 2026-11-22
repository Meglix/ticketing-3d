import { BoxGeometry, type Camera, Matrix4, Quaternion, Vector3 } from 'three';
import type { Seat, SectorInfo } from '../geometry/types.ts';

/**
 * Seat picking in the sector focus view (level 2 of the flow).
 *
 * Only the focused sector's seats are pickable: an invisible InstancedMesh of
 * simple boxes (one per seat, same transform as the rendered seat) is
 * raycast by R3F, which reports `instanceId`. Instance i is the sector's i-th
 * seat, so the manifest index is `sector.seatStart + i`. Keeping it to one
 * sector (~1,000 boxes instead of 30,335 detailed seats) keeps every pointer
 * move cheap.
 */

/** The pick box around a seat (local frame: +z = the way the spectator faces). */
export const PICK_BOX = { width: 0.48, height: 0.95, depth: 0.62, lift: 0.47 };

export function pickBoxGeometry(): BoxGeometry {
  return new BoxGeometry(PICK_BOX.width, PICK_BOX.height, PICK_BOX.depth);
}

const UP = new Vector3(0, 1, 0);
const q = new Quaternion();
const p = new Vector3();
const one = new Vector3(1, 1, 1);

/** Yaw that turns local +z towards the seat's facing direction. */
export const seatYaw = (seat: Pick<Seat, 'facing'>): number => Math.atan2(seat.facing.x, seat.facing.z);

/** World matrix of a seat (optionally lifted / scaled), written into `out`. */
export function seatMatrix(seat: Pick<Seat, 'position' | 'facing'>, out: Matrix4, lift = 0, scale = one): Matrix4 {
  q.setFromAxisAngle(UP, seatYaw(seat));
  p.set(seat.position.x, seat.position.y + lift, seat.position.z);
  return out.compose(p, q, scale);
}

/** Instance matrices (16 floats each) of the pick boxes for one sector. */
export function sectorPickMatrices(seats: Seat[], sector: SectorInfo): Float32Array {
  const n = sector.seatEnd - sector.seatStart;
  const out = new Float32Array(n * 16);
  const m = new Matrix4();
  for (let i = 0; i < n; i++) {
    seatMatrix(seats[sector.seatStart + i]!, m, PICK_BOX.lift);
    m.toArray(out, i * 16);
  }
  return out;
}

/** Manifest index of the seat behind a pick-mesh hit, or null. */
export function pickedSeatIndex(sector: SectorInfo, instanceId: number | undefined): number | null {
  if (instanceId === undefined || instanceId < 0) return null;
  const index = sector.seatStart + instanceId;
  return index < sector.seatEnd ? index : null;
}

/** Where a seat shows on screen: the upper part of its backrest (the lower part hides behind the row in front). */
export function seatScreenAnchor(seat: Pick<Seat, 'position'>, out: Vector3): Vector3 {
  return out.set(seat.position.x, seat.position.y + PICK_BOX.lift + PICK_BOX.height / 2 - 0.08, seat.position.z);
}

const anchor = new Vector3();

/**
 * Touch forgiveness. On a phone a seat in the sector focus is ~8 px wide and a
 * fingertip covers several, so a tap that lands on a sold seat (or between
 * seats) takes the available seat nearest to the tap on screen, within
 * `radiusPx`. Returns its manifest index, or null when none is that close.
 * `point` and `size` are in CSS pixels of the canvas.
 */
export function nearestAvailableSeat(
  seats: Seat[],
  sector: SectorInfo,
  isAvailable: (index: number) => boolean,
  camera: Camera,
  size: { width: number; height: number },
  point: { x: number; y: number },
  radiusPx: number,
): number | null {
  let best: number | null = null;
  let bestD2 = radiusPx * radiusPx;
  for (let i = sector.seatStart; i < sector.seatEnd; i++) {
    if (!isAvailable(i)) continue;
    seatScreenAnchor(seats[i]!, anchor).project(camera);
    if (anchor.z > 1) continue; // behind the camera
    const dx = (anchor.x * 0.5 + 0.5) * size.width - point.x;
    const dy = (-anchor.y * 0.5 + 0.5) * size.height - point.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
