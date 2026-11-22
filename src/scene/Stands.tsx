import { useEffect, useMemo } from 'react';
import { Color, MeshStandardMaterial } from 'three';
import { sectorPointerHandlers } from '../interaction/sectorHandlers.ts';
import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { toBufferGeometry } from './meshData.ts';
import { PALETTE } from './palette.ts';

/**
 * The concrete stands: one closed solid per sector, straight from the
 * generator. Each solid is also the tap/hover target for its sector (the
 * seats themselves are not raycast — 30k instances would be slow, and the
 * solid sits right under them).
 */
export function Stands({ venue }: { venue: Venue }) {
  const sectors = venue.manifest.sectors;
  const hovered = useAppState((s) => s.hoveredSector);
  const selected = useAppState((s) => s.selectedSector);

  const geometries = useMemo(
    () => new Map(sectors.map((s) => [s.code, toBufferGeometry(venue.structure.sectorSurfaces[s.code]!)])),
    [sectors, venue],
  );
  const handlers = useMemo(
    () => new Map(sectors.map((s) => [s.code, sectorPointerHandlers(venue, s.code)])),
    [sectors, venue],
  );
  const base = useMemo(() => new MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.93, metalness: 0 }), []);
  const hover = useMemo(
    () => new MeshStandardMaterial({ color: PALETTE.concreteHover, roughness: 0.9, emissive: '#3a3a3a', emissiveIntensity: 0.25 }),
    [],
  );
  // The selected sector's concrete takes a light wash of its price colour.
  const selectedMaterial = useMemo(() => {
    if (!selected) return null;
    const info = venue.sectorByCode.get(selected);
    const tier = info ? venue.tierById.get(info.tierId) : undefined;
    const color = new Color(PALETTE.concrete).lerp(new Color(tier?.color ?? '#ffffff'), 0.28);
    return new MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.08 });
  }, [selected, venue]);

  useEffect(() => () => selectedMaterial?.dispose(), [selectedMaterial]);
  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      base.dispose();
      hover.dispose();
    },
    [geometries, base, hover],
  );

  return (
    <group>
      {sectors.map((s) => {
        const material =
          s.code === selected && selectedMaterial ? selectedMaterial : s.code === hovered ? hover : base;
        return (
          <mesh key={s.code} geometry={geometries.get(s.code)} material={material} {...handlers.get(s.code)} />
        );
      })}
    </group>
  );
}
