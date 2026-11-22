import { pointAt } from '../geometry/roundedRect.ts';
import type { Vec3 } from '../geometry/types.ts';
import type { Venue } from '../venue/loadVenue.ts';

/**
 * Points the overview must keep on screen: the venue's real outline (the
 * outermost offset of the reference line, i.e. the facade) at ground level and
 * at roof height. Framing to this instead of the bounding box gains ~15 % of
 * screen on phones, because a rounded bowl leaves the box corners empty.
 */
export function framingOutline(venue: Venue, samples = 96): Vec3[] {
  const { curve, structure } = venue;
  const outer = structure.bounds.halfLength - curve.spec.halfLength;
  const out: Vec3[] = [];
  for (let i = 0; i < samples; i++) {
    const p = pointAt(curve, (curve.perimeter * i) / samples, outer);
    out.push({ x: p.x, y: 0, z: p.z }, { x: p.x, y: structure.bounds.height, z: p.z });
  }
  return out;
}
