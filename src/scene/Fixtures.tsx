import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  type InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { pointAt, sampleSpan } from '../geometry/roundedRect.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { groupPower, look } from './look.ts';
import { PALETTE } from './palette.ts';

/**
 * Small fixed fittings: the 386 floodlights along the roof's leading edge
 * (one instanced mesh, aimed at their targets), a continuous light strip under
 * each roof frame, and the two big screens (neutral text only — no club or
 * sponsor marks).
 *
 * Night look: lamps and strips are HDR-emissive (values > 1), so the bloom
 * pass turns them into glowing bands. During the intro each stand's group
 * powers on in sequence (look.groupPower).
 */

/** HDR colour of a fully powered lamp / strip (bloom threshold is ~0.92). */
const LAMP_HDR = new Color('#fff3dc').multiplyScalar(5.5);
const STRIP_HDR = new Color('#f2f6ff').multiplyScalar(3.2);

/** Stand group of a plan point, in power-on order: Tribuna I, Peluza II, Tribuna II, Peluza I. */
function groupOf(x: number, z: number, halfLength: number, halfWidth: number): number {
  const sides = Math.abs(z) / halfWidth >= Math.abs(x) / halfLength;
  if (sides) return z < 0 ? 0 : 2;
  return x > 0 ? 1 : 3;
}

/** Thin emissive strips just under the leading edge of each roof frame. */
function stripGeometries(venue: Venue): BufferGeometry[] {
  const roof = venue.config.roof;
  if (!roof) return [];
  const curve = venue.curve;
  const d0 = roof.inner.distance + 0.15;
  const d1 = roof.inner.distance + 0.75;
  const y = roof.inner.height - 1.06;
  return roof.segments.map((seg) => {
    const pos: number[] = [];
    const idx: number[] = [];
    sampleSpan(curve, seg.from, seg.to, Math.PI / 96).forEach((s, i) => {
      const a = pointAt(curve, s, d0);
      const b = pointAt(curve, s, d1);
      pos.push(a.x, y, a.z, b.x, y, b.z);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  });
}

function screenTexture(venueName: string): Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#13233a');
  g.addColorStop(1, '#0a1424');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 124px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(venueName.toUpperCase(), c.width / 2, c.height / 2 - 30);
  ctx.fillStyle = '#9fc1e8';
  ctx.font = '500 50px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Bine ați venit!', c.width / 2, c.height / 2 + 86);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Fixtures({ venue }: { venue: Venue }) {
  const { floodlights, screens } = venue.structure;
  const lampRef = useRef<InstancedMesh>(null);
  const ref = venue.config.layout.referenceLine;

  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const lampMat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), []);
  const frameMat = useMemo(() => new MeshStandardMaterial({ color: PALETTE.screenFrame, roughness: 0.6 }), []);
  const texture = useMemo(() => screenTexture(venue.config.name), [venue.config.name]);
  const screenMat = useMemo(() => new MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  const strips = useMemo(() => stripGeometries(venue), [venue]);
  const stripMats = useMemo(() => strips.map(() => new MeshBasicMaterial({ color: '#000000', toneMapped: false, side: DoubleSide })), [strips]);
  const stripGroups = useMemo(
    () =>
      (venue.config.roof?.segments ?? []).map((seg) => {
        const mid = pointAt(venue.curve, (seg.from + seg.to) / 2, 0);
        return groupOf(mid.x, mid.z, ref.halfLength, ref.halfWidth);
      }),
    [venue, ref],
  );
  const lampGroups = useMemo(
    () => floodlights.map((f) => groupOf(f.position.x, f.position.z, ref.halfLength, ref.halfWidth)),
    [floodlights, ref],
  );
  const lampColors = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(Math.max(1, floodlights.length) * 3), 3),
    [floodlights],
  );

  useLayoutEffect(() => {
    const mesh = lampRef.current;
    if (!mesh) return;
    const o = new Object3D();
    floodlights.forEach((f, i) => {
      o.position.set(f.position.x, f.position.y, f.position.z);
      o.lookAt(f.target.x, f.target.y, f.target.z);
      o.scale.set(0.7, 0.45, 0.25);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = lampColors;
    mesh.computeBoundingSphere();
  }, [floodlights, lampColors]);

  // Power: each stand's group switches on in sequence during the intro.
  const lastIntro = useRef(-1);
  useFrame(() => {
    const t = look.intro;
    if (t === lastIntro.current) return;
    lastIntro.current = t;
    const groups = 4;
    const power = [0, 1, 2, 3].map((g) => groupPower(g, groups, t));
    const arr = lampColors.array as Float32Array;
    lampGroups.forEach((g, i) => {
      const p = power[g]!;
      arr[i * 3] = LAMP_HDR.r * p;
      arr[i * 3 + 1] = LAMP_HDR.g * p;
      arr[i * 3 + 2] = LAMP_HDR.b * p;
    });
    lampColors.needsUpdate = true;
    stripMats.forEach((m, i) => m.color.copy(STRIP_HDR).multiplyScalar(power[stripGroups[i]!] ?? 1));
  });

  useEffect(
    () => () => {
      strips.forEach((g) => g.dispose());
      stripMats.forEach((m) => m.dispose());
      box.dispose();
      lampMat.dispose();
      frameMat.dispose();
      screenMat.dispose();
      texture.dispose();
    },
    [box, lampMat, frameMat, screenMat, texture, strips, stripMats],
  );

  return (
    <group>
      {floodlights.length > 0 && (
        <instancedMesh ref={lampRef} args={[box, lampMat, floodlights.length]} />
      )}
      {strips.map((g, i) => (
        <mesh key={i} geometry={g} material={stripMats[i]} />
      ))}
      {screens.map((s, i) => {
        const yaw = Math.atan2(s.facing.x, s.facing.z);
        return (
          <group key={i} position={[s.center.x, s.center.y, s.center.z]} rotation={[0, yaw, 0]}>
            <mesh geometry={box} material={frameMat} scale={[s.width + 0.6, s.height + 0.6, 0.5]} position={[0, 0, -0.3]} />
            <mesh material={screenMat} position={[0, 0, 0.0]}>
              <planeGeometry args={[s.width, s.height]} />
            </mesh>
            {/* Two legs down to the stand behind */}
            <mesh geometry={box} material={frameMat} scale={[0.35, 4, 0.35]} position={[-s.width / 3, -s.height / 2 - 2, -0.4]} />
            <mesh geometry={box} material={frameMat} scale={[0.35, 4, 0.35]} position={[s.width / 3, -s.height / 2 - 2, -0.4]} />
          </group>
        );
      })}
    </group>
  );
}
