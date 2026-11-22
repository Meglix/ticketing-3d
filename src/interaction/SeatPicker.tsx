import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { availabilityFor, SOLD } from '../demo/availability.ts';
import { actions, appStore, useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { pickBoxGeometry, pickedSeatIndex, sectorPickMatrices } from './seatPicking.ts';

/** Same tap/drag threshold as the sector handlers and the camera rig. */
const TAP_MAX_PX = 6;

/**
 * Invisible pick boxes for the seats of the focused sector (sector focus and
 * seat view). R3F raycasts them and reports `instanceId` → manifest seat.
 * - mouse hover → hoverSeat (highlight + tooltip);
 * - tap on an available seat → selectSeat (it turns gold, the camera flies in);
 * - sold seats can't be chosen.
 * The material is invisible (not drawn) but still raycast.
 */
export function SeatPicker({ venue }: { venue: Venue }) {
  const ref = useRef<InstancedMesh>(null);
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
        const hit = seatAt(e);
        if (!hit || !sector || sold[hit.index] === SOLD) return;
        const s = appStore.get();
        if (s.view === 'seat' && s.seatId === hit.seat.id) return;
        actions.selectSeat(sector.code, hit.seat.id);
      }}
    />
  );
}
