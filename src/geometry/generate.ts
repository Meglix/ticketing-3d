import type { VenueConfig } from '../venue/schema.ts';
import { makeReferenceCurve, type ReferenceCurve } from './roundedRect.ts';
import { generateSeatsAlongCurve } from './seats.ts';
import { generateStructureAlongCurve } from './structure.ts';
import type { SeatManifest, StructureData } from './types.ts';

export interface GeneratedVenue {
  manifest: SeatManifest;
  structure: StructureData;
  curve: ReferenceCurve;
}

/** The reference curve for a layout template. Extension point for new templates. */
export function referenceCurveFor(config: VenueConfig): ReferenceCurve {
  const layout = config.layout;
  switch (layout.template) {
    case 'bowl':
      return makeReferenceCurve(layout.referenceLine);
    // case 'horseshoe': a theatre template would return its own (open) curve
    // here, plus its balcony/box rules; seat placement along offset rows is
    // shared (src/geometry/seats.ts).
  }
}

/** Config → seat manifest + structure buffers. Pure: no three.js, no DOM. */
export function generateVenue(config: VenueConfig): GeneratedVenue {
  const curve = referenceCurveFor(config);
  return {
    manifest: generateSeatsAlongCurve(config, curve),
    structure: generateStructureAlongCurve(config, curve),
    curve,
  };
}
