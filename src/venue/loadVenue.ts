import { generateVenue } from '../geometry/generate.ts';
import type { ReferenceCurve } from '../geometry/roundedRect.ts';
import type { Seat, SeatManifest, SectorInfo, StructureData } from '../geometry/types.ts';
import type { PriceTier, VenueConfig } from './schema.ts';
import { parseVenueConfig } from './validate.ts';

/** Everything the app needs about one venue, computed once at start-up. */
export interface Venue {
  config: VenueConfig;
  manifest: SeatManifest;
  structure: StructureData;
  curve: ReferenceCurve;
  sectorByCode: ReadonlyMap<string, SectorInfo>;
  seatById: ReadonlyMap<string, Seat>;
  tierById: ReadonlyMap<string, PriceTier>;
}

/** raw JSON → validated config → geometry → lookup tables. Throws VenueConfigError on bad data. */
export function loadVenue(raw: unknown): Venue {
  const config = parseVenueConfig(raw);
  const { manifest, structure, curve } = generateVenue(config);
  return {
    config,
    manifest,
    structure,
    curve,
    sectorByCode: new Map(manifest.sectors.map((s) => [s.code, s])),
    seatById: new Map(manifest.seats.map((s) => [s.id, s])),
    tierById: new Map(config.priceTiers.map((t) => [t.id, t])),
  };
}
