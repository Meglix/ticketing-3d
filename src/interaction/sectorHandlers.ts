import type { ThreeEvent } from '@react-three/fiber';
import { actions, appStore } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';

/** Pointer handlers the scene attaches to each sector's mesh. */
export interface SectorPointerHandlers {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * A pointer that travelled more than this between down and up (CSS px) was a
 * drag (orbit / look-around), not a tap. Matches TAP_SLOP_PX in CameraRig.
 */
const TAP_MAX_PX = 6;

/**
 * Sector hover and tap → store actions.
 * - Hover is for mouse pointers only (a touch "hover" would stick after the tap).
 * - Only the nearest sector reacts (stopPropagation).
 * - A tap always works: in the overview, from a seat, or mid-flight (the camera
 *   re-targets from wherever it is). Tapping the seat you already sit on does nothing.
 */
export function sectorPointerHandlers(venue: Venue, code: string): SectorPointerHandlers {
  return {
    onPointerOver(e) {
      e.stopPropagation();
      if (e.pointerType !== 'mouse') return;
      actions.hoverSector(code);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut(e) {
      if (e.pointerType !== 'mouse') return;
      if (appStore.get().hoveredSector === code) actions.hoverSector(null);
      document.body.style.cursor = '';
    },
    onClick(e) {
      if (e.delta > TAP_MAX_PX) return; // end of a drag, not a tap
      e.stopPropagation();
      const sector = venue.sectorByCode.get(code);
      const seat = sector ? venue.manifest.seats[sector.representativeSeat] : undefined;
      if (!seat) return;
      const s = appStore.get();
      if (s.view === 'seat' && s.seatId === seat.id) return;
      actions.selectSector(code, seat.id);
    },
  };
}
