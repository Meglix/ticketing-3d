import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import raw from '../../venues/cluj-arena.json';
import { sectorFocusPose } from '../camera/focus.ts';
import { loadVenue } from '../venue/loadVenue.ts';
import { pickBoxGeometry, pickedSeatIndex, PICK_BOX, sectorPickMatrices } from './seatPicking.ts';

const venue = loadVenue(raw);
const seats = venue.manifest.seats;

/** The pick mesh exactly as the app builds it, for one sector. */
function pickMesh(code: string) {
  const sector = venue.sectorByCode.get(code)!;
  const n = sector.seatEnd - sector.seatStart;
  const mesh = new InstancedMesh(pickBoxGeometry(), new MeshBasicMaterial(), n);
  const mats = sectorPickMatrices(seats, sector);
  const m = new Matrix4();
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, m.fromArray(mats, i * 16));
  mesh.computeBoundingSphere();
  mesh.updateMatrixWorld(true);
  return { sector, mesh };
}

function focusCamera(code: string, aspect: number): PerspectiveCamera {
  const pose = sectorFocusPose(venue, code, aspect);
  const cam = new PerspectiveCamera(pose.fov, aspect, 0.1, 5000);
  cam.position.set(pose.position.x, pose.position.y, pose.position.z);
  cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

describe('seat picking (instanceId raycast, focused sector only)', () => {
  for (const [code, aspect] of [
    ['2M2', 1440 / 900],
    ['1C', 1440 / 900],
    ['1H', 390 / 844],
    ['2A1', 390 / 844],
  ] as const) {
    it(`a tap on a seat of ${code} picks exactly that seat (aspect ${aspect.toFixed(2)})`, () => {
      const { sector, mesh } = pickMesh(code);
      const cam = focusCamera(code, aspect);
      const ray = new Raycaster();
      const n = sector.seatEnd - sector.seatStart;
      let checked = 0;
      for (let i = 0; i < n; i += 9) {
        const seat = seats[sector.seatStart + i]!;
        // Aim where the seat is visible from the elevated 3/4 view: the upper part
        // (backrest top). Its lower half is partly hidden behind the neighbours'
        // backrests in perspective, exactly as on screen.
        const visibleY = seat.position.y + PICK_BOX.lift + PICK_BOX.height / 2 - 0.08;
        const centre = new Vector3(seat.position.x, visibleY, seat.position.z).project(cam);
        expect(Math.abs(centre.x), `${seat.id} on screen`).toBeLessThan(1);
        expect(Math.abs(centre.y), `${seat.id} on screen`).toBeLessThan(1);
        ray.setFromCamera(new Vector2(centre.x, centre.y), cam);
        const hit = ray.intersectObject(mesh)[0];
        expect(pickedSeatIndex(sector, hit?.instanceId), seat.id).toBe(sector.seatStart + i);
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    });
  }

  it('maps instance ids to manifest indices and rejects out-of-range ids', () => {
    const sector = venue.sectorByCode.get('2M2')!;
    expect(pickedSeatIndex(sector, 0)).toBe(sector.seatStart);
    expect(pickedSeatIndex(sector, undefined)).toBeNull();
    expect(pickedSeatIndex(sector, sector.seatEnd - sector.seatStart)).toBeNull();
  });
});
