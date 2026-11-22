import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  type InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { Venue } from '../venue/loadVenue.ts';
import { overviewFactor } from './meshData.ts';
import { PALETTE } from './palette.ts';

/**
 * Small fixed fittings: the 386 floodlights along the roof's leading edge
 * (one instanced mesh, aimed at their targets) and the two big screens.
 * Screens show neutral text only — no club or sponsor marks.
 */

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

  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const lampMat = useMemo(() => new MeshBasicMaterial({ color: PALETTE.floodlight, toneMapped: false }), []);
  const frameMat = useMemo(() => new MeshStandardMaterial({ color: PALETTE.screenFrame, roughness: 0.6 }), []);
  const texture = useMemo(() => screenTexture(venue.config.name), [venue.config.name]);
  const screenMat = useMemo(() => new MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);

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
    mesh.computeBoundingSphere();
  }, [floodlights]);

  // The lamps hang under the roof's leading edge. When the roof fades to a
  // ghost for the overview, they would float as a stray dotted line over the
  // track, so they go with the roof.
  useFrame(({ camera }) => {
    const mesh = lampRef.current;
    if (mesh) mesh.visible = overviewFactor(camera.position.y) < 0.5;
  });

  useEffect(
    () => () => {
      box.dispose();
      lampMat.dispose();
      frameMat.dispose();
      screenMat.dispose();
      texture.dispose();
    },
    [box, lampMat, frameMat, screenMat, texture],
  );

  return (
    <group>
      {floodlights.length > 0 && (
        <instancedMesh ref={lampRef} args={[box, lampMat, floodlights.length]} />
      )}
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
