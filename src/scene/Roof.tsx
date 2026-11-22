import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  DoubleSide,
  EdgesGeometry,
  type InstancedMesh,
  LineBasicMaterial,
  type Material,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { frameAt, offsetLength, paramAtOffsetLength, pointAt } from '../geometry/roundedRect.ts';
import type { Beam } from '../geometry/types.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { overviewFactor, toBufferGeometry } from './meshData.ts';
import { PALETTE } from './palette.ts';

/**
 * Roof skin (aluminium + translucent polycarbonate band), cantilever
 * trusses, columns and the facade with its vertical metal fins.
 *
 * The roof covers ~93 % of the seats, so in the overview it would hide the
 * sectors the user has to tap. Every frame, the camera height drives a single
 * "overview factor": high camera → roof and facade fade to a ghost (with a thin
 * outline so the architecture still reads), low camera → fully solid. None of
 * these meshes has pointer handlers, so they never block taps.
 */

const tmpObj = new Object3D();

/** Instance matrices for boxes spanning each beam (local z along the beam). */
function writeBeams(mesh: InstancedMesh, beams: Beam[]): void {
  const from = new Vector3();
  const to = new Vector3();
  beams.forEach((b, i) => {
    from.set(b.from.x, b.from.y, b.from.z);
    to.set(b.to.x, b.to.y, b.to.z);
    tmpObj.position.copy(from).add(to).multiplyScalar(0.5);
    tmpObj.up.set(0, 1, 0);
    tmpObj.lookAt(to);
    tmpObj.scale.set(b.width, b.height, Math.max(0.01, from.distanceTo(to)));
    tmpObj.updateMatrix();
    mesh.setMatrixAt(i, tmpObj.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

interface Fin {
  matrix: Matrix4;
}

/** Vertical fins in front of the facade, every ~1.6 m along each roof frame. */
function facadeFins(venue: Venue): Fin[] {
  const { roof, facade } = venue.config;
  if (!roof || !facade) return [];
  const curve = venue.curve;
  const d = facade.distance + 0.35;
  const height = facade.height - 0.6;
  const out: Fin[] = [];
  for (const seg of roof.segments) {
    const len = offsetLength(curve, seg.from, seg.to, d);
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const s = paramAtOffsetLength(curve, seg.from, d, (len * i) / n);
      const p = pointAt(curve, s, d);
      const nrm = frameAt(curve, s).normal;
      tmpObj.position.set(p.x, height / 2, p.z);
      tmpObj.rotation.set(0, Math.atan2(nrm.x, nrm.z), 0);
      // Slight alternation in depth gives the "woven" rhythm of the cladding.
      tmpObj.scale.set(0.16, height, i % 2 === 0 ? 0.75 : 0.45);
      tmpObj.updateMatrix();
      out.push({ matrix: tmpObj.matrix.clone() });
    }
  }
  return out;
}

export function Roof({ venue }: { venue: Venue }) {
  const { structure } = venue;
  const roofGeo = useMemo(() => toBufferGeometry(structure.roof.opaque), [structure]);
  const polyGeo = useMemo(() => toBufferGeometry(structure.roof.translucent), [structure]);
  const facadeGeo = useMemo(() => toBufferGeometry(structure.facade), [structure]);
  const edgeGeo = useMemo(() => {
    const e1 = new EdgesGeometry(roofGeo, 25);
    return e1;
  }, [roofGeo]);
  const boxGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const fins = useMemo(() => facadeFins(venue), [venue]);

  const mats = useMemo(() => {
    const roof = new MeshStandardMaterial({
      color: PALETTE.roofSkin,
      roughness: 0.42,
      metalness: 0.3,
      side: DoubleSide,
      transparent: true,
    });
    const poly = new MeshStandardMaterial({
      color: PALETTE.polycarbonate,
      roughness: 0.15,
      metalness: 0.0,
      side: DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const facade = new MeshStandardMaterial({
      color: PALETTE.facade,
      roughness: 0.38,
      metalness: 0.45,
      side: DoubleSide,
      transparent: true,
    });
    const fin = new MeshStandardMaterial({ color: PALETTE.facadeFin, roughness: 0.35, metalness: 0.5, transparent: true });
    const truss = new MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.5, metalness: 0.35, transparent: true });
    const column = new MeshStandardMaterial({ color: PALETTE.column, roughness: 0.9, transparent: true });
    const edge = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    return { roof, poly, facade, fin, truss, column, edge };
  }, []);

  const trussRef = useRef<InstancedMesh>(null);
  const columnRef = useRef<InstancedMesh>(null);
  const finRef = useRef<InstancedMesh>(null);
  const roofRef = useRef<Mesh>(null);
  const polyRef = useRef<Mesh>(null);
  const facadeRef = useRef<Mesh>(null);

  useLayoutEffect(() => {
    if (trussRef.current) writeBeams(trussRef.current, structure.roof.trusses);
    if (columnRef.current) writeBeams(columnRef.current, structure.roof.columns);
    const finMesh = finRef.current;
    if (finMesh) {
      fins.forEach((f, i) => finMesh.setMatrixAt(i, f.matrix));
      finMesh.instanceMatrix.needsUpdate = true;
      finMesh.computeBoundingSphere();
    }
  }, [structure, fins]);

  // Fade with camera height. Only touch materials when the factor moves.
  // Many overlapping translucent parts (fins, trusses) would add up to a grey
  // veil, so those fade out completely and stop drawing.
  const last = useRef(-1);
  useFrame(({ camera }) => {
    const f = overviewFactor(camera.position.y);
    if (Math.abs(f - last.current) < 0.002) return;
    last.current = f;
    const ghost = f > 0.02;
    // Busy parts (fins ×3, trusses and columns ×2) fade faster so a camera in
    // mid-flight doesn't look through a curtain of half-transparent bars.
    const fast = Math.min(1, f * 2);
    const fastest = Math.min(1, f * 3);
    const set = (obj: Object3D | null, m: Material, solidOpacity: number, ghostOpacity: number, k = f) => {
      m.opacity = solidOpacity + (ghostOpacity - solidOpacity) * k;
      m.depthWrite = !ghost && m !== mats.poly;
      if (obj) obj.visible = m.opacity > 0.012;
    };
    set(roofRef.current, mats.roof, 1, 0.06);
    set(polyRef.current, mats.poly, 0.5, 0.03);
    set(facadeRef.current, mats.facade, 1, 0.06);
    set(finRef.current, mats.fin, 1, 0, fastest);
    set(trussRef.current, mats.truss, 1, 0, fast);
    set(columnRef.current, mats.column, 1, 0, fast);
    mats.edge.opacity = 0.6 * f;
  });

  useEffect(
    () => () => {
      [roofGeo, polyGeo, facadeGeo, edgeGeo, boxGeo].forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [roofGeo, polyGeo, facadeGeo, edgeGeo, boxGeo, mats],
  );

  return (
    <group>
      <mesh ref={roofRef} geometry={roofGeo} material={mats.roof} renderOrder={2} />
      <mesh ref={polyRef} geometry={polyGeo} material={mats.poly} renderOrder={3} />
      <lineSegments geometry={edgeGeo} material={mats.edge} renderOrder={4} />
      <mesh ref={facadeRef} geometry={facadeGeo} material={mats.facade} renderOrder={1} />
      <instancedMesh
        ref={finRef}
        args={[boxGeo, mats.fin, Math.max(1, fins.length)]}
        count={fins.length}
        renderOrder={1}
      />
      <instancedMesh
        ref={trussRef}
        args={[boxGeo, mats.truss, Math.max(1, structure.roof.trusses.length)]}
        count={structure.roof.trusses.length}
        renderOrder={1}
      />
      <instancedMesh
        ref={columnRef}
        args={[boxGeo, mats.column, Math.max(1, structure.roof.columns.length)]}
        count={structure.roof.columns.length}
        renderOrder={1}
      />
    </group>
  );
}
