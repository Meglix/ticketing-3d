import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PointLight,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { availabilityFor, SOLD } from '../demo/availability.ts';
import { seatMatrix } from '../interaction/seatPicking.ts';
import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { look } from './look.ts';
import { smoothstep } from './meshData.ts';
import { PALETTE } from './palette.ts';

/**
 * All 30,335 seats, instanced, in three levels of detail:
 *
 *   far    4-triangle seat (pan + back as two quads)    camera > 140 m away
 *   near   20-triangle seat (pan + backrest boxes)       otherwise
 *   detail ~110-triangle seat (pan, bucket back, armrest, leg)   the focused sector only
 *
 * far/near share ONE matrix buffer and ONE colour buffer; the focused
 * sector's seats are hidden there (zero matrices) and drawn by the detail
 * mesh instead. The chosen seat and the hovered seat get their own meshes so
 * they can glow (gold) without affecting the others.
 *
 * Colour = state: overview → price tier; focused sector → available (tier),
 * sold (dark grey), hovered (bright), chosen (gold); other sectors → dimmed.
 * In the luminous overview the seats also EMIT their colour (shader patch
 * below), so they read as fine points of light; up close they are lit.
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

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Seat geometry merge failed');
  return merged;
}

/** Per-vertex "this part glows in the luminous overview" (1) or not (0). */
function withGlowMask<T extends BufferGeometry>(g: T, value: 0 | 1): T {
  const n = g.getAttribute('position').count;
  g.setAttribute('glowMask', new Float32BufferAttribute(new Float32Array(n).fill(value), 1));
  return g;
}

function makeNearSeat(): BufferGeometry {
  const pan = openBottomBox(0.44, 0.07, 0.4);
  pan.translate(0, 0.44, 0.03);
  const back = openBottomBox(0.44, 0.42, 0.06);
  back.rotateX(-0.14);
  back.translate(0, 0.68, -0.18);
  // Only the backrests glow: each row reads as a thin line of light over
  // dark pans and treads (the "fine light" of the reference), not a fill.
  return merge([withGlowMask(pan, 0), withGlowMask(back, 1)]);
}

/** Far LOD: the pan's top and the backrest's front as two quads, drawn double-sided. */
function makeFarSeat(): BufferGeometry {
  const w = 0.22;
  const v = [
    -w, 0.475, 0.23, w, 0.475, 0.23, w, 0.475, -0.17, -w, 0.475, -0.17,
    -w, 0.475, -0.17, w, 0.475, -0.17, w, 0.89, -0.23, -w, 0.89, -0.23,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.setAttribute('glowMask', new Float32BufferAttribute([0, 0, 0, 0, 1, 1, 1, 1], 1)); // backrest quad only
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}

/** Detail LOD: shaped pan, bucket backrest (centre + two forward-angled wings), headrest, one armrest (shared with the neighbour), pedestal. */
function makeDetailSeat(): BufferGeometry {
  const pan = new BoxGeometry(0.44, 0.075, 0.41);
  pan.translate(0, 0.445, 0.035);
  const lip = new BoxGeometry(0.44, 0.05, 0.06);
  lip.rotateX(0.5);
  lip.translate(0, 0.43, 0.245);
  const back = new BoxGeometry(0.3, 0.36, 0.055);
  back.rotateX(-0.16);
  back.translate(0, 0.66, -0.175);
  // Side wings turned ~26° towards the spectator: reads as a moulded shell, not a plank.
  const wing = (side: 1 | -1) => {
    const g = new BoxGeometry(0.085, 0.34, 0.05);
    g.rotateY(-side * 0.45);
    g.rotateX(-0.16);
    g.translate(side * 0.185, 0.655, -0.155);
    return g;
  };
  const head = new BoxGeometry(0.3, 0.13, 0.05);
  head.rotateX(-0.22);
  head.translate(0, 0.89, -0.215);
  const arm = new BoxGeometry(0.045, 0.035, 0.36);
  arm.translate(0.245, 0.64, 0.0);
  const armPost = new BoxGeometry(0.035, 0.22, 0.035);
  armPost.translate(0.245, 0.52, -0.13);
  const leg = new BoxGeometry(0.06, 0.4, 0.06);
  leg.translate(0, 0.2, -0.06);
  return merge([pan, lip, back, wing(1), wing(-1), head, arm, armPost, leg]);
}

/**
 * Make instance colours also emissive, scaled by a shared uniform (the
 * luminous look). With `masked`, only geometry whose `glowMask` attribute is 1
 * emits, and the lit (diffuse) colour is scaled by `diffuse` (dark in the
 * luminous overview, so the glowing backrests carry the picture).
 */
function glowMaterial(
  glow: { value: number },
  opts: ConstructorParameters<typeof MeshStandardMaterial>[0],
  masked?: { diffuse: { value: number } },
) {
  const m = new MeshStandardMaterial(opts);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = glow;
    if (masked) {
      shader.uniforms.uDiffuse = masked.diffuse;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glowMask;\nvarying float vGlowMask;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowMask = glowMask;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uGlow;${masked ? '\nuniform float uDiffuse;\nvarying float vGlowMask;' : ''}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>${masked ? '\ndiffuseColor.rgb *= uDiffuse;' : ''}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n totalEmissiveRadiance += vColor.rgb * uGlow${masked ? ' * vGlowMask' : ''};\n#endif`,
      );
  };
  return m;
}

/** Camera distance from the centre spot above which the far LOD is drawn. */
const FAR_LOD_DISTANCE = 140;
const ZERO = new Matrix4().makeScale(0, 0, 0);

const WHITE = new Color('#ffffff');
const SOLD_COLOR = new Color(PALETTE.sold);
const GOLD = new Color(PALETTE.gold);
const DIM = new Color('#11141b');
/** Height of the pin's head above the seat's tread (m). */
const PIN_TOP = 3.6;

export function Seats({ venue }: { venue: Venue }) {
  const nearRef = useRef<InstancedMesh>(null);
  const farRef = useRef<InstancedMesh>(null);
  const detailRef = useRef<InstancedMesh>(null);
  const goldRef = useRef<Mesh>(null);
  const goldLightRef = useRef<PointLight>(null);
  const hoverRef = useRef<Mesh>(null);
  const pinRef = useRef<Group>(null);
  const fillRef = useRef<PointLight>(null);
  const { seats, sectors } = venue.manifest;
  const count = seats.length;
  const sold = useMemo(() => availabilityFor(venue.manifest), [venue]);
  const maxSector = useMemo(() => Math.max(...sectors.map((s) => s.seatEnd - s.seatStart)), [sectors]);

  const geo = useMemo(() => ({ near: makeNearSeat(), far: makeFarSeat(), detail: makeDetailSeat() }), []);
  const glow = useMemo(() => ({ value: 0.6 }), []);
  const detailGlow = useMemo(() => ({ value: 0.12 }), []);
  const diffuse = useMemo(() => ({ value: 1 }), []);
  const mats = useMemo(
    () => ({
      near: glowMaterial(glow, { roughness: 0.55, metalness: 0 }, { diffuse }),
      far: glowMaterial(glow, { roughness: 0.55, metalness: 0, side: DoubleSide }, { diffuse }),
      detail: glowMaterial(detailGlow, { roughness: 0.48, metalness: 0.05 }),
      gold: new MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0 }),
      // Saturated cyan and raised: distinct from every tier colour, including the
      // silver VIP seats (a bright, near-white cyan read as "available").
      hover: new MeshStandardMaterial({ color: '#00b4f0', emissive: '#00a6ff', emissiveIntensity: 0.9, roughness: 0.4 }),
      /** The pin above your seat in the sector focus (HDR gold, unlit: it blooms). */
      pin: new MeshBasicMaterial({ color: new Color(PALETTE.gold).multiplyScalar(2.2), transparent: true, depthWrite: false }),
    }),
    [glow, detailGlow, diffuse],
  );
  const colors = useMemo(() => new InstancedBufferAttribute(new Float32Array(count * 3), 3), [count]);
  const detailColors = useMemo(() => new InstancedBufferAttribute(new Float32Array(maxSector * 3), 3), [maxSector]);
  /** Every seat's world matrix (16 floats each), kept to restore hidden ranges. */
  const baseMatrices = useMemo(() => {
    const out = new Float32Array(count * 16);
    const m = new Matrix4();
    seats.forEach((seat, i) => seatMatrix(seat, m).toArray(out, i * 16));
    return out;
  }, [seats, count]);
  const tierColor = useMemo(() => new Map(venue.config.priceTiers.map((t) => [t.id, new Color(t.color)])), [venue]);

  const view = useAppState((s) => s.view);
  const focus = useAppState((s) => (s.view === 'overview' ? null : s.selectedSector));
  const seatId = useAppState((s) => s.seatId);
  const hoveredSeat = useAppState((s) => s.hoveredSeat);
  const hoveredSector = useAppState((s) => s.hoveredSector);

  // Matrices: written once; the far mesh shares the near mesh's buffers.
  useLayoutEffect(() => {
    const near = nearRef.current;
    const far = farRef.current;
    if (!near || !far) return;
    (near.instanceMatrix.array as Float32Array).set(baseMatrices);
    near.instanceMatrix.needsUpdate = true;
    near.instanceColor = colors;
    far.instanceMatrix = near.instanceMatrix;
    far.instanceColor = colors;
    near.computeBoundingSphere();
    far.computeBoundingSphere();
  }, [baseMatrices, colors]);

  // The focused sector moves from the shared meshes to the detail mesh.
  const focusInfo = focus ? venue.sectorByCode.get(focus) ?? null : null;
  useLayoutEffect(() => {
    const near = nearRef.current;
    const detail = detailRef.current;
    if (!near || !detail || !focusInfo) {
      if (detail) detail.count = 0;
      return;
    }
    const arr = near.instanceMatrix.array as Float32Array;
    const { seatStart: a, seatEnd: b } = focusInfo;
    for (let i = a; i < b; i++) ZERO.toArray(arr, i * 16);
    near.instanceMatrix.clearUpdateRanges();
    near.instanceMatrix.addUpdateRange(a * 16, (b - a) * 16);
    near.instanceMatrix.needsUpdate = true;
    (detail.instanceMatrix.array as Float32Array).set(baseMatrices.subarray(a * 16, b * 16));
    detail.count = b - a;
    detail.instanceMatrix.needsUpdate = true;
    detail.instanceColor = detailColors;
    detail.computeBoundingSphere();
    return () => {
      arr.set(baseMatrices.subarray(a * 16, b * 16), a * 16);
      near.instanceMatrix.clearUpdateRanges();
      near.instanceMatrix.addUpdateRange(a * 16, (b - a) * 16);
      near.instanceMatrix.needsUpdate = true;
    };
  }, [focusInfo, baseMatrices, detailColors]);

  // Colours from state (cheap: one pass over 30k seats, only when the state changes).
  useLayoutEffect(() => {
    const arr = colors.array as Float32Array;
    const c = new Color();
    for (const sector of sectors) {
      const base = tierColor.get(sector.tierId) ?? WHITE;
      const focused = sector.code === focus;
      for (let i = sector.seatStart; i < sector.seatEnd; i++) {
        if (view === 'overview') {
          c.copy(base);
          if (sector.code === hoveredSector) c.lerp(WHITE, 0.45);
        } else if (focused) {
          const id = seats[i]!.id;
          if (id === seatId) c.copy(GOLD);
          else if (sold[i] === SOLD) c.copy(SOLD_COLOR);
          else if (id === hoveredSeat) c.copy(base).lerp(WHITE, 0.6);
          else c.copy(base).lerp(WHITE, 0.06);
        } else {
          c.copy(base).lerp(DIM, sector.code === hoveredSector ? 0.35 : 0.62);
        }
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
    }
    colors.clearUpdateRanges();
    colors.needsUpdate = true;
    if (focusInfo) {
      const d = detailColors.array as Float32Array;
      d.set(arr.subarray(focusInfo.seatStart * 3, focusInfo.seatEnd * 3));
      detailColors.clearUpdateRanges();
      detailColors.needsUpdate = true;
    }
  }, [view, focus, focusInfo, seatId, hoveredSeat, hoveredSector, sectors, seats, sold, tierColor, colors, detailColors]);

  // The chosen (gold) seat and the hovered seat: own meshes on top of the detail one.
  const chosen = seatId ? venue.seatById.get(seatId) : undefined;
  const hovered = hoveredSeat && hoveredSeat !== seatId ? venue.seatById.get(hoveredSeat) : undefined;
  useLayoutEffect(() => {
    const place = (mesh: Mesh | null, seat: typeof chosen, scale: number) => {
      if (!mesh) return;
      mesh.visible = !!seat && view !== 'overview';
      if (!seat) return;
      seatMatrix(seat, mesh.matrix);
      if (scale !== 1) mesh.matrix.multiply(new Matrix4().makeScale(scale, scale, scale));
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldNeedsUpdate = true;
    };
    place(goldRef.current, chosen, 1.015);
    place(hoverRef.current, hovered, 1.12);
    if (hoverRef.current?.visible) hoverRef.current.matrix.elements[13]! += 0.05; // lifted a little
    // The lights stay in the scene (intensity 0 when unused): toggling a
    // light's visibility changes the light count and recompiles every lit shader.
    if (chosen) goldLightRef.current?.position.set(chosen.position.x, chosen.position.y + 1.3, chosen.position.z);
    if (chosen) pinRef.current?.position.set(chosen.position.x, chosen.position.y, chosen.position.z);
  }, [chosen, hovered, view]);

  useFrame(({ camera }) => {
    const far = camera.position.length() > FAR_LOD_DISTANCE;
    if (nearRef.current) nearRef.current.visible = !far;
    if (farRef.current) farRef.current.visible = far;
    // Luminous overview: seats emit their colour; up close they are lit instead.
    glow.value = (0.1 + 1.1 * look.holo) * (0.35 + 0.65 * look.power);
    diffuse.value = 1 - 0.75 * look.holo; // dark seat bodies in the luminous overview
    // The chosen seat pulses softly. Up close (seat view: the camera is ~1 m
    // behind it) full strength would blow it out to a flat white-gold slab, so
    // glow and light fade with the camera's distance to the seat.
    const dist = chosen ? camera.position.distanceTo(chosen.position) : Infinity;
    const near = chosen ? smoothstep(2.5, 18, dist) : 1;
    const active = !!chosen && view !== 'overview';
    const pulse = Math.sin(performance.now() / 380);
    mats.gold.emissiveIntensity = (0.34 + 0.41 * near) * (1 + 0.3 * pulse);
    if (goldLightRef.current) goldLightRef.current.intensity = active ? 1.1 + 1.4 * near : 0;
    // Seat view: a soft fill from behind the camera, so the backs of the rows
    // in front (which face away from the floodlights) aren't black silhouettes.
    const seated = active && view === 'seat' ? 1 - smoothstep(3, 8, dist) : 0;
    if (fillRef.current) {
      fillRef.current.position.copy(camera.position);
      fillRef.current.position.y += 0.4;
      fillRef.current.intensity = 3.2 * seated;
    }
    // Sector focus: a gold pin over your seat (a seat is only ~12 px wide there).
    const pin = pinRef.current;
    if (pin) {
      const show = active ? smoothstep(10, 22, dist) : 0;
      pin.visible = show > 0.01;
      mats.pin.opacity = show;
      pin.children[1]!.position.y = PIN_TOP + 0.12 * pulse;
    }
  });

  useLayoutEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );

  return (
    <>
      <instancedMesh ref={nearRef} args={[geo.near, mats.near, count]} frustumCulled={false} />
      <instancedMesh ref={farRef} args={[geo.far, mats.far, count]} frustumCulled={false} visible={false} />
      <instancedMesh ref={detailRef} args={[geo.detail, mats.detail, maxSector]} frustumCulled={false} />
      <mesh ref={goldRef} geometry={geo.detail} material={mats.gold} visible={false} />
      <mesh ref={hoverRef} geometry={geo.detail} material={mats.hover} visible={false} />
      <pointLight ref={goldLightRef} color={PALETTE.gold} intensity={0} distance={4} decay={2} />
      <pointLight ref={fillRef} color="#d4e0ff" intensity={0} distance={10} decay={2} />
      <group ref={pinRef} visible={false}>
        <mesh material={mats.pin} position={[0, (PIN_TOP + 1.1) / 2, 0]}>
          <cylinderGeometry args={[0.035, 0.035, PIN_TOP - 1.1, 6]} />
        </mesh>
        <mesh material={mats.pin} position={[0, PIN_TOP, 0]}>
          <sphereGeometry args={[0.5, 16, 12]} />
        </mesh>
      </group>
    </>
  );
}
