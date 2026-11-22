import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  type InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Path,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Venue } from '../venue/loadVenue.ts';
import { roundedRectPath } from './Field.tsx';
import { PALETTE } from './palette.ts';

/**
 * Sky, light, ground and a quiet backdrop: a plaza around the stadium, low
 * blocks of city, trees, and two rings of hills on the horizon (Cluj-Napoca
 * sits in a valley), so the open corners of the bowl show something.
 * Everything is cheap: no shadows, no textures, instanced props.
 */

/** Late-afternoon sun, from the south-west (behind Tribuna I and Peluza I). */
export const SUN_DIRECTION = new Vector3(-0.45, 0.55, -0.7).normalize();

/** Deterministic pseudo-random numbers so the backdrop is identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color(PALETTE.skyTop) },
      horizon: { value: new Color(PALETTE.skyHorizon) },
      sunDir: { value: SUN_DIRECTION },
      sunColor: { value: new Color('#ffd9a3') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.38));
        float s = max(dot(d, sunDir), 0.0);
        c += sunColor * (pow(s, 400.0) * 1.5 + pow(s, 8.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A ring of hill silhouettes: a band of triangles whose top edge is a sum of sines. */
function hillRing(radius: number, base: number, amp: number, seed: number): BufferGeometry {
  const n = 220;
  const rand = mulberry32(seed);
  const phases = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const pos: number[] = [];
  const height = (a: number) =>
    Math.max(
      8,
      base +
        amp * (0.5 * Math.sin(2 * a + phases[0]!) + 0.3 * Math.sin(5 * a + phases[1]!) + 0.2 * Math.sin(11 * a + phases[2]!)) +
        amp * 0.12 * Math.sin(23 * a + phases[3]!),
    );
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const h0 = height(a0), h1 = height(a1);
    // Wound so the faces point at the centre (front faces seen from inside the bowl).
    pos.push(x0, -2, z0, x1, -2, z1, x1, h1, z1);
    pos.push(x0, -2, z0, x1, h1, z1, x0, h0, z0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

interface Prop {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
}

/** City blocks and trees outside the plaza, keeping clear of the camera's overview line of sight. */
function backdropProps(venue: Venue): { blocks: Prop[]; trees: Prop[] } {
  const rand = mulberry32(2011);
  const { halfLength, halfWidth } = venue.structure.bounds;
  const clear = Math.hypot(halfLength, halfWidth) + 60;
  const blocks: Prop[] = [];
  const trees: Prop[] = [];
  while (blocks.length < 110) {
    const a = rand() * Math.PI * 2;
    const r = clear + 60 + rand() * 900;
    blocks.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      sx: 16 + rand() * 34,
      sy: 9 + rand() * (r > 600 ? 40 : 24),
      sz: 14 + rand() * 30,
      ry: rand() * Math.PI,
    });
  }
  while (trees.length < 260) {
    const a = rand() * Math.PI * 2;
    const r = clear - 20 + rand() * 140;
    const s = 3 + rand() * 3.5;
    trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, sx: s, sy: s * (1.2 + rand() * 0.6), sz: s, ry: rand() * 6 });
  }
  return { blocks, trees };
}

export function Environment({ venue }: { venue: Venue }) {
  const ref = venue.config.layout.referenceLine;
  const sky = useMemo(skyMaterial, []);
  const props = useMemo(() => backdropProps(venue), [venue]);

  const geos = useMemo(() => {
    // Plaza: from the front of the stands out to ~22 m beyond the facade.
    const margin = Math.max(venue.structure.bounds.halfLength - ref.halfLength, 0) + 22;
    const plazaShape = roundedRectPath(new Shape(), ref.halfLength + margin, ref.halfWidth + margin, ref.cornerRadius + margin);
    plazaShape.holes.push(roundedRectPath(new Path(), ref.halfLength, ref.halfWidth, ref.cornerRadius));
    const plaza = new ShapeGeometry(plazaShape, 32);
    plaza.rotateX(-Math.PI / 2);
    const groundShape = new Shape();
    groundShape.absarc(0, 0, 4000, 0, Math.PI * 2, false);
    groundShape.holes.push(
      roundedRectPath(new Path(), ref.halfLength + margin, ref.halfWidth + margin, ref.cornerRadius + margin),
    );
    const ground = new ShapeGeometry(groundShape, 64);
    ground.rotateX(-Math.PI / 2);
    return {
      plaza,
      ground,
      hillsNear: hillRing(1500, 55, 70, 7),
      hillsFar: hillRing(2600, 150, 150, 13),
      block: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      tree: new IcosahedronGeometry(1, 0).translate(0, 1, 0),
    };
  }, [venue, ref]);

  const mats = useMemo(
    () => ({
      plaza: new MeshLambertMaterial({ color: PALETTE.plaza }),
      ground: new MeshLambertMaterial({ color: PALETTE.ground }),
      hillsNear: new MeshLambertMaterial({ color: PALETTE.hillsNear }),
      hillsFar: new MeshLambertMaterial({ color: PALETTE.hillsFar }),
      block: new MeshLambertMaterial({ color: PALETTE.buildings }),
      tree: new MeshLambertMaterial({ color: '#4f7a45', flatShading: true }),
    }),
    [],
  );

  const blockRef = useRef<InstancedMesh>(null);
  const treeRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    const write = (mesh: InstancedMesh | null, list: Prop[]) => {
      if (!mesh) return;
      list.forEach((p, i) => {
        o.position.set(p.x, 0, p.z);
        o.rotation.set(0, p.ry, 0);
        o.scale.set(p.sx, p.sy, p.sz);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    write(blockRef.current, props.blocks);
    write(treeRef.current, props.trees);
  }, [props]);

  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      sky.dispose();
    },
    [geos, mats, sky],
  );

  return (
    <group>
      <fog attach="fog" args={[PALETTE.skyHorizon, 900, 5200]} />
      <hemisphereLight args={['#dce9ff', '#8c7f6c', 1.15]} />
      <directionalLight color="#ffe6c4" intensity={2.4} position={SUN_DIRECTION.clone().multiplyScalar(400)} />
      <ambientLight intensity={0.15} />
      <mesh material={sky} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[7000, 32, 16]} />
      </mesh>
      <mesh geometry={geos.ground} material={mats.ground} position-y={-0.05} />
      <mesh geometry={geos.plaza} material={mats.plaza} />
      <mesh geometry={geos.hillsNear} material={mats.hillsNear} />
      <mesh geometry={geos.hillsFar} material={mats.hillsFar} />
      <instancedMesh ref={blockRef} args={[geos.block, mats.block, props.blocks.length]} />
      <instancedMesh ref={treeRef} args={[geos.tree, mats.tree, props.trees.length]} />
    </group>
  );
}
