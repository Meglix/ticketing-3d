import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { availabilityFor, SOLD } from '../demo/availability.ts';
import { actions, appStore, useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { nearestAvailableSeat, pickBoxGeometry, pickedSeatIndex, sectorPickMatrices } from './seatPicking.ts';

/** Same tap/drag threshold as the sector handlers and the camera rig. */
const TAP_MAX_PX = 6;
/** Touch: how far from the tap (CSS px) an available seat may be to be taken instead of a sold one. */
const TOUCH_RADIUS_PX = 28;

const isTouch = (e: ThreeEvent<MouseEvent>): boolean => {
  const type = (e.nativeEvent as PointerEvent).pointerType;
  return type ? type !== 'mouse' : matchMedia('(pointer: coarse)').matches;
};

/**
 * Invisible pick boxes for the seats of the focused sector (sector focus and
 * seat view). R3F raycasts them and reports `instanceId` → manifest seat.
 * - mouse hover → hoverSeat (highlight + tooltip);
 * - tap on an available seat → selectSeat (it turns gold, the camera flies in);
 * - sold seats can't be chosen; on touch, a tap on a sold seat takes the
 *   nearest available one within a fingertip (nearestAvailableSeat).
 * The material is invisible (not drawn) but still raycast.
 */
export function SeatPicker({ venue }: { venue: Venue }) {
  const ref = useRef<InstancedMesh>(null);
  const size = useThree((s) => s.size);
  const focus = useAppState((s) => (s.view === 'overview' ? null : s.selectedSector));
  const sector = focus ? venue.sectorByCode.get(focus) ?? null : null;
  const sold = useMemo(() => availabilityFor(venue.manifest), [venue]);
  const geometry = useMemo(pickBoxGeometry, []);
  const material = useMemo(() => new MeshBasicMaterial({ visible: false }), []);
  const maxSeats = useMemo(
    () => Math.max(...venue.manifest.sectors.map((s) => s.seatEnd - s.seatStart)),
    [venue],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!sector) {
      mesh.count = 0;
      return;
    }
    const mats = sectorPickMatrices(venue.manifest.seats, sector);
    const m = new Matrix4();
    const n = sector.seatEnd - sector.seatStart;
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, m.fromArray(mats, i * 16));
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }, [sector, venue]);

  useLayoutEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const seatAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!sector) return null;
    const index = pickedSeatIndex(sector, e.instanceId);
    return index === null ? null : { index, seat: venue.manifest.seats[index]! };
  };

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, maxSeats]}
      frustumCulled={false}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        e.stopPropagation();
        const hit = seatAt(e);
        const id = hit && sold[hit.index] !== SOLD ? hit.seat.id : null;
        if (appStore.get().hoveredSeat !== id) actions.hoverSeat(id);
        document.body.style.cursor = id ? 'pointer' : 'not-allowed';
      }}
      onPointerOut={(e) => {
        if (e.pointerType !== 'mouse') return;
        actions.hoverSeat(null);
        document.body.style.cursor = '';
      }}
      onClick={(e) => {
        if (e.delta > TAP_MAX_PX) return; // end of a drag
        e.stopPropagation();
        if (!sector) return;
        const hit = seatAt(e);
        let index = hit && sold[hit.index] !== SOLD ? hit.index : null;
        if (index === null && isTouch(e)) {
          const point = { x: (e.pointer.x * 0.5 + 0.5) * size.width, y: (-e.pointer.y * 0.5 + 0.5) * size.height };
          const free = (i: number) => sold[i] !== SOLD;
          index = nearestAvailableSeat(venue.manifest.seats, sector, free, e.camera, size, point, TOUCH_RADIUS_PX);
        }
        if (index === null) return;
        const id = venue.manifest.seats[index]!.id;
        const s = appStore.get();
        if (s.view === 'seat' && s.seatId === id) return;
        actions.selectSeat(sector.code, id);
      }}
    />
  );
}
