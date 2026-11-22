import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Raycaster, Vector2, Vector3 } from 'three';
import type { CameraPose } from '../camera/cameraMath.ts';
import { appStore, type AppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { sectorAtPoint } from './hitSector.ts';

/**
 * Test seam for the Playwright e2e (and handy in the dev console):
 *
 *   window.__clujDemo.sectorScreenPoint('2M2')  → { x, y } in CSS px, or null
 *   window.__clujDemo.state()                    → the app store snapshot
 *   window.__clujDemo.cameraIdle()               → false while the camera is animating
 *   window.__clujDemo.cameraPose()               → { position, target, fov }
 *
 * sectorScreenPoint returns a point where a REAL tap selects that sector. It
 * aims at the tread under the representative seat, then under other seats of
 * each row (front to back), and keeps the first one that is on screen, not covered by
 * DOM UI, and whose first hit among the tappable meshes (the same list R3F
 * raycasts for events) lies inside that sector's solid (sectorAtPoint, exact
 * from the venue geometry). So an e2e never "taps" through a wall or onto a
 * neighbour, and the test exercises the real event path.
 */

export interface ClujDemoSeam {
  sectorScreenPoint(code: string): { x: number; y: number } | null;
  state(): AppState;
  cameraIdle(): boolean;
  cameraMode(): string;
  /** Current camera position, look target and vertical fov. */
  cameraPose(): CameraPose;
}

declare global {
  interface Window {
    __clujDemo?: ClujDemoSeam;
  }
}

/**
 * Seat indices to try for a sector: the representative seat, then for each
 * row (front to back) its middle, quarter and three-quarter seats.
 */
function candidateSeats(venue: Venue, code: string): number[] {
  const sector = venue.sectorByCode.get(code);
  if (!sector) return [];
  const out = [sector.representativeSeat];
  const seats = venue.manifest.seats;
  let rowStart = sector.seatStart;
  for (let i = sector.seatStart; i < sector.seatEnd; i++) {
    const last = i === sector.seatEnd - 1 || seats[i + 1]!.row !== seats[i]!.row;
    if (last) {
      const n = i - rowStart;
      for (const f of [0.5, 0.25, 0.75]) out.push(rowStart + Math.round(n * f));
      rowStart = i + 1;
    }
  }
  return out;
}

export function TestSeam({
  venue,
  isCameraIdle,
  cameraMode,
  cameraPose,
}: {
  venue: Venue;
  isCameraIdle: () => boolean;
  cameraMode: () => string;
  cameraPose: () => CameraPose;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const internal = useThree((s) => s.internal);

  useEffect(() => {
    const raycaster = new Raycaster();
    const seam: ClujDemoSeam = {
      sectorScreenPoint(code) {
        const rect = gl.domElement.getBoundingClientRect();
        for (const index of candidateSeats(venue, code)) {
          const seat = venue.manifest.seats[index]!;
          // Aim at the tread under the seat (a point that is surely inside the sector's footprint).
          const ndc = new Vector3(seat.position.x, seat.position.y + 0.02, seat.position.z).project(camera);
          if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 0.96 || Math.abs(ndc.y) > 0.96) continue;
          const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
          const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
          if (document.elementFromPoint(x, y) !== gl.domElement) continue; // covered by the UI overlay
          raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
          const hit = raycaster.intersectObjects(internal.interaction, false)[0];
          if (!hit || sectorAtPoint(venue, hit.point) !== code) continue; // something else is in front
          return { x, y };
        }
        return null;
      },
      state: () => appStore.get(),
      cameraIdle: isCameraIdle,
      cameraMode,
      cameraPose,
    };
    window.__clujDemo = seam;
    return () => {
      if (window.__clujDemo === seam) delete window.__clujDemo;
    };
  }, [venue, camera, gl, internal, isCameraIdle, cameraMode, cameraPose]);

  return null;
}
