import { frameAt, offsetLength, pointAt } from '../geometry/roundedRect.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { add, deg, normalize, scale, vec, type CameraPose } from './cameraMath.ts';

/**
 * The "sector focus" view (level 2 of the flow): a 3/4 view of one sector,
 * from over the pitch, close enough that individual seats can be tapped.
 *
 * Pure: derived from the venue config like everything else (no Cluj numbers).
 * The camera looks at the middle of the sector's seat block from in front,
 * FOCUS_SIDE to the side (the "3/4") and FOCUS_ELEVATION above, at the
 * distance where the sector's width and rake fill FOCUS_FILL of the screen.
 */

export const FOCUS_FOV = 42;
const FOCUS_SIDE = deg(22);
const FOCUS_ELEVATION = deg(24);
/** Share of the screen the sector should fill (the rest is context). */
const FOCUS_FILL = 0.78;

export function sectorFocusPose(venue: Venue, code: string, aspect: number): CameraPose {
  const sector = venue.config.stands
    .flatMap((st) => st.rings.flatMap((r) => r.sectors))
    .find((s) => s.code === code);
  if (!sector) throw new Error(`Unknown sector ${code}`);
  const rows = sector.rows;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const mid = rows[Math.floor((rows.length - 1) / 2)]!;
  const sMid = (sector.span.from + sector.span.to) / 2;

  const frame = frameAt(venue.curve, sMid);
  const c = pointAt(venue.curve, sMid, (first.distance + last.distance) / 2);
  const center = vec(c.x, (first.elevation + last.elevation) / 2 + 0.6, c.z);

  // Extent of the seat block on screen: its width along the rows, and the
  // rake (depth × height) seen from the elevated viewpoint.
  const width = offsetLength(venue.curve, sector.span.from, sector.span.to, mid.distance);
  const depth = last.distance - first.distance + 1;
  const rise = last.elevation - first.elevation + 1.5;
  const vertical = depth * Math.sin(FOCUS_ELEVATION) + rise * Math.cos(FOCUS_ELEVATION);

  const tanV = Math.tan(deg(FOCUS_FOV) / 2) * FOCUS_FILL;
  const tanH = tanV * aspect;
  const distance = Math.max(18, (width / 2) / tanH, (vertical / 2) / tanV);

  // Unit vector from the sector towards the camera: inwards (−normal), turned
  // to the side by FOCUS_SIDE, raised by FOCUS_ELEVATION.
  const inward = vec(-frame.normal.x, 0, -frame.normal.z);
  const side = vec(frame.tangent.x, 0, frame.tangent.z);
  const flat = add(scale(inward, Math.cos(FOCUS_SIDE)), scale(side, Math.sin(FOCUS_SIDE)));
  const dir = normalize(add(scale(flat, Math.cos(FOCUS_ELEVATION)), vec(0, Math.sin(FOCUS_ELEVATION), 0)));

  return { position: add(center, scale(dir, distance)), target: center, fov: FOCUS_FOV };
}
