import type { ThreeEvent } from '@react-three/fiber';
import { actions } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';

/** Pointer handlers the scene attaches to each sector's mesh. */
export interface SectorPointerHandlers {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

/** LANE C STUB — replaced by the interaction lane (tap vs. drag, hover cursor, etc.). */
export function sectorPointerHandlers(venue: Venue, code: string): SectorPointerHandlers {
  return {
    onPointerOver: () => actions.hoverSector(code),
    onPointerOut: () => actions.hoverSector(null),
    onClick: () => {
      const sector = venue.sectorByCode.get(code);
      if (!sector) return;
      actions.selectSector(code, venue.manifest.seats[sector.representativeSeat]!.id);
    },
  };
}
