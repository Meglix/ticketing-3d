import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { PALETTE } from './palette.ts';

/**
 * All seats of the venue in ONE InstancedMesh (one draw call for 30k seats).
 *
 * Geometry: a seat pan and a backrest (two open-bottom boxes, 20 triangles). Local +z is
 * the direction the spectator faces, so the backrest sits at −z, towards the
 * back of the stand.
 *
 * Colour: the sector's price-tier colour. Hover brightens a sector. Selection
 * keeps the chosen sector in full colour and turns every other sector a
 * neutral grey (the real seats are grey, so the seat view reads naturally).
 * Colours are only
 * rewritten when hover/selection changes, and only for the sectors whose
 * colour actually changed (uploaded as partial buffer ranges).
 *
 * Level of detail: in the overview a seat is a few pixels wide, so a second
 * InstancedMesh draws each seat as two double-sided quads (4 triangles
 * instead of 20). It shares the SAME instance matrix and colour buffers, so
 * there is no extra memory or upload; only the visible mesh switches, by
 * camera distance from the centre (no visible pop: at the switch distance a
 * seat is ~2 px). This cuts the overview from ~650k to ~165k triangles.
 */

/** A box without its bottom face (never visible): 10 triangles instead of 12. */
function openBottomBox(w: number, h: number, d: number): BoxGeometry {
  const box = new BoxGeometry(w, h, d);
  const index = box.getIndex()!;
  const kept = Array.from(index.array as ArrayLike<number>).filter((_, i) => i < 18 || i >= 24); // face 3 = −y
  box.setIndex(kept);
  box.clearGroups();
  return box;
}

function makeSeatGeometry() {
  const pan = openBottomBox(0.44, 0.07, 0.4);
  pan.translate(0, 0.44, 0.03);
  const back = openBottomBox(0.44, 0.42, 0.06);
  back.rotateX(-0.14); // leaning back slightly
  back.translate(0, 0.68, -0.18);
  const merged = mergeGeometries([pan, back]);
  pan.dispose();
  back.dispose();
  if (!merged) throw new Error('Seat geometry merge failed');
  return merged;
}

/** Far LOD: the pan's top and the backrest's front as two quads (4 triangles), drawn double-sided. */
function makeFarSeatGeometry(): BufferGeometry {
  const w = 0.22; // half width
  // pan top (y 0.475, z −0.17…0.23) and backrest (tilted, from the pan's back up to 0.88 m)
  const v = [
    -w, 0.475, 0.23,  w, 0.475, 0.23,  w, 0.475, -0.17,  -w, 0.475, -0.17,
    -w, 0.475, -0.17,  w, 0.475, -0.17,  w, 0.89, -0.23,  -w, 0.89, -0.23,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}

/** Camera distance from the centre spot above which the far LOD is drawn. */
const FAR_LOD_DISTANCE = 140;

const WHITE = new Color('#ffffff');
const DIM = new Color(PALETTE.dimTarget);

export function Seats({ venue }: { venue: Venue }) {
  const meshRef = useRef<InstancedMesh>(null);
  const farRef = useRef<InstancedMesh>(null);
  const { seats, sectors } = venue.manifest;
  const count = seats.length;

  const geometry = useMemo(makeSeatGeometry, []);
  const farGeometry = useMemo(makeFarSeatGeometry, []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.55, metalness: 0.0 }), []);
  const farMaterial = useMemo(
    () => new MeshStandardMaterial({ roughness: 0.55, metalness: 0.0, side: DoubleSide }),
    [],
  );
  const colors = useMemo(() => new InstancedBufferAttribute(new Float32Array(count * 3), 3), [count]);
  const tierColor = useMemo(() => {
    const map = new Map<string, Color>();
    for (const tier of venue.config.priceTiers) map.set(tier.id, new Color(tier.color));
    return map;
  }, [venue]);
  /** Last colour written per sector (hex), to upload only what changed. */
  const applied = useRef(new Map<string, number>());

  // Instance matrices: computed once per venue.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3(1, 1, 1);
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const seat = seats[i]!;
      q.setFromAxisAngle(up, Math.atan2(seat.facing.x, seat.facing.z));
      p.set(seat.position.x, seat.position.y, seat.position.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = colors;
    mesh.computeBoundingSphere();
    const far = farRef.current;
    if (far) {
      far.instanceMatrix = mesh.instanceMatrix; // shared buffers: one upload, two meshes
      far.instanceColor = colors;
      far.computeBoundingSphere();
    }
    applied.current.clear();
  }, [count, seats, colors]);

  // Switch LOD by camera distance (cheap: one comparison per frame).
  useFrame(({ camera }) => {
    const far = camera.position.length() > FAR_LOD_DISTANCE;
    if (meshRef.current) meshRef.current.visible = !far;
    if (farRef.current) farRef.current.visible = far;
  });

  const hovered = useAppState((st) => st.hoveredSector);
  const selected = useAppState((st) => st.selectedSector);

  useLayoutEffect(() => {
    const arr = colors.array as Float32Array;
    const c = new Color();
    colors.clearUpdateRanges();
    let changed = 0;
    for (const sector of sectors) {
      c.copy(tierColor.get(sector.tierId) ?? WHITE);
      if (selected !== null) {
        if (sector.code === selected) c.lerp(WHITE, 0.08);
        else c.lerp(DIM, sector.code === hovered ? 0.45 : 0.8);
      }
      if (sector.code === hovered && sector.code !== selected) c.lerp(WHITE, 0.5);
      const hex = c.getHex();
      if (applied.current.get(sector.code) === hex) continue;
      applied.current.set(sector.code, hex);
      for (let i = sector.seatStart; i < sector.seatEnd; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      colors.addUpdateRange(sector.seatStart * 3, (sector.seatEnd - sector.seatStart) * 3);
      changed++;
    }
    if (changed > 0) colors.needsUpdate = true;
  }, [hovered, selected, sectors, colors, tierColor]);

  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      farGeometry.dispose();
      farMaterial.dispose();
    },
    [geometry, material, farGeometry, farMaterial],
  );

  return (
    <>
      <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />
      <instancedMesh ref={farRef} args={[farGeometry, farMaterial, count]} frustumCulled={false} visible={false} />
    </>
  );
}
