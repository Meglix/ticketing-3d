import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  type BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geometry,
  LineBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import { sectorPointerHandlers } from '../interaction/sectorHandlers.ts';
import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { look } from './look.ts';
import { toBufferGeometry } from './meshData.ts';
import { PALETTE } from './palette.ts';

/**
 * The stands: one closed solid per sector, straight from the generator. Each
 * solid is also the tap/hover target for its sector.
 *
 * V2 look, crossfaded by look.holo:
 * - far (holo = 1): the concrete goes almost black and the solids' hard edges
 *   glow as thin lines (row nosings become lines of light, sector ends become
 *   the radial aisles) — the "luminous model";
 * - near (holo = 0): night-lit concrete, the lines fade away.
 * The hovered / focused sector's edges are drawn bright on top.
 */

/** Edges sharper than this (degrees) are drawn: treads/risers yes, curve facets no. */
const EDGE_ANGLE = 35;

const HOLO_CONCRETE = new Color(PALETTE.holoConcrete);
const SOLID_CONCRETE = new Color(PALETTE.nightConcrete);
const LINE_HDR = new Color(PALETTE.holoLine).multiplyScalar(1.5);
const HIGHLIGHT_HDR = new Color('#ffffff').multiplyScalar(2.2);

function mergeLines(geos: BufferGeometry[]): Geometry {
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count * 3;
  const out = new Float32Array(total);
  let offset = 0;
  for (const g of geos) {
    const arr = g.getAttribute('position').array as Float32Array;
    out.set(arr, offset);
    offset += arr.length;
  }
  const merged = new Geometry();
  merged.setAttribute('position', new Float32BufferAttribute(out, 3));
  return merged;
}

export function Stands({ venue }: { venue: Venue }) {
  const sectors = venue.manifest.sectors;
  const hovered = useAppState((s) => s.hoveredSector);
  const selected = useAppState((s) => s.selectedSector);
  const view = useAppState((s) => s.view);

  const geometries = useMemo(
    () => new Map(sectors.map((s) => [s.code, toBufferGeometry(venue.structure.sectorSurfaces[s.code]!)])),
    [sectors, venue],
  );
  const edges = useMemo(
    () => new Map([...geometries].map(([code, g]) => [code, new EdgesGeometry(g, EDGE_ANGLE)])),
    [geometries],
  );
  const allEdges = useMemo(() => mergeLines([...edges.values()]), [edges]);
  const handlers = useMemo(
    () => new Map(sectors.map((s) => [s.code, sectorPointerHandlers(venue, s.code)])),
    [sectors, venue],
  );

  const mats = useMemo(() => {
    const base = new MeshStandardMaterial({ color: SOLID_CONCRETE, roughness: 0.92, metalness: 0 });
    const hover = new MeshStandardMaterial({ color: SOLID_CONCRETE, roughness: 0.9, emissive: '#2b3a55', emissiveIntensity: 0.6 });
    const focus = new MeshStandardMaterial({ color: SOLID_CONCRETE, roughness: 0.9, emissive: '#1d2a40', emissiveIntensity: 0.35 });
    const lines = new LineBasicMaterial({
      color: LINE_HDR,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const highlight = new LineBasicMaterial({
      color: HIGHLIGHT_HDR,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { base, hover, focus, lines, highlight };
  }, []);

  // Crossfade every frame (a few material properties, no allocations).
  useFrame(() => {
    const h = look.holo;
    for (const m of [mats.base, mats.hover, mats.focus]) m.color.copy(SOLID_CONCRETE).lerp(HOLO_CONCRETE, h);
    mats.lines.opacity = (0.04 + 0.62 * h) * (0.25 + 0.75 * look.power);
    mats.highlight.opacity = 0.5 + 0.45 * h;
  });

  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      edges.forEach((g) => g.dispose());
      allEdges.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geometries, edges, allEdges, mats],
  );

  // Bright outline: the hovered sector, else the focused one (not in the seat view).
  const outlined = hovered ?? (view === 'sector' ? selected : null);

  return (
    <group>
      {sectors.map((s) => {
        const material = s.code === hovered ? mats.hover : s.code === selected && view !== 'overview' ? mats.focus : mats.base;
        return <mesh key={s.code} geometry={geometries.get(s.code)} material={material} {...handlers.get(s.code)} />;
      })}
      <lineSegments geometry={allEdges} material={mats.lines} renderOrder={5} />
      {outlined && edges.get(outlined) && (
        <lineSegments geometry={edges.get(outlined)} material={mats.highlight} renderOrder={6} />
      )}
    </group>
  );
}
