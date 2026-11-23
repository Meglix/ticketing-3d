import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Venue } from '../venue/loadVenue.ts';
import { look } from './look.ts';
import { PALETTE } from './palette.ts';

/**
 * Everything at ground level inside the bowl: striped grass, FIFA line
 * markings and goals, the 8-lane athletics track, and the apron between the
 * track and the front of the stands. Surfaces are built as shapes with holes
 * so nothing overlaps (no z-fighting), and the markings are real geometry
 * lifted 2 cm so they stay crisp at any distance.
 */

// ---------------------------------------------------------------------------
// Plan shapes (built in the XY plane, rotated to lie in XZ: (x, y) → (x, 0, −y))
// ---------------------------------------------------------------------------

/** Two straights joined by semicircles (an athletics-track outline). */
function stadiumPath<T extends Path>(p: T, straightHalf: number, r: number): T {
  p.moveTo(-straightHalf, -r);
  p.lineTo(straightHalf, -r);
  p.absarc(straightHalf, 0, r, -Math.PI / 2, Math.PI / 2, false);
  p.lineTo(-straightHalf, r);
  p.absarc(-straightHalf, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return p;
}

export function roundedRectPath<T extends Path>(p: T, hl: number, hw: number, r: number): T {
  p.moveTo(-(hl - r), -hw);
  p.lineTo(hl - r, -hw);
  p.absarc(hl - r, -(hw - r), r, -Math.PI / 2, 0, false);
  p.lineTo(hl, hw - r);
  p.absarc(hl - r, hw - r, r, 0, Math.PI / 2, false);
  p.lineTo(-(hl - r), hw);
  p.absarc(-(hl - r), hw - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(-hl, -(hw - r));
  p.absarc(-(hl - r), -(hw - r), r, Math.PI, (3 * Math.PI) / 2, false);
  return p;
}

function shapeGeometry(shape: Shape, segments = 48): ShapeGeometry {
  const g = new ShapeGeometry(shape, segments);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Line markings as ribbons
// ---------------------------------------------------------------------------

type P2 = [number, number]; // plan (x, z)

/** Merge thick polylines into one triangle list at height y. */
function ribbons(polylines: P2[][], width: number, y: number): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const h = width / 2;
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i]!;
      const [bx, bz] = line[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-9) continue;
      // Perpendicular in the plan; extend each piece by h to close joints.
      const tx = (bx - ax) / len;
      const tz = (bz - az) / len;
      const px = -tz * h;
      const pz = tx * h;
      const ex = tx * h * 0.5;
      const ez = tz * h * 0.5;
      const a1 = [ax - ex + px, y, az - ez + pz];
      const a2 = [ax - ex - px, y, az - ez - pz];
      const b1 = [bx + ex + px, y, bz + ez + pz];
      const b2 = [bx + ex - px, y, bz + ez - pz];
      // Two triangles facing +y (counter-clockwise seen from above).
      pos.push(...a1, ...b1, ...b2, ...a1, ...b2, ...a2);
      for (let k = 0; k < 6; k++) nrm.push(0, 1, 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  // Fix winding per triangle so every face points up.
  const p = g.getAttribute('position');
  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), az = p.getZ(t);
    const bx = p.getX(t + 1), bz = p.getZ(t + 1);
    const cx = p.getX(t + 2), cz = p.getZ(t + 2);
    // y-component of (b−a)×(c−a) = (bz−az)(cx−ax) − (bx−ax)(cz−az)
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) {
      p.setXYZ(t + 1, cx, y, cz);
      p.setXYZ(t + 2, bx, y, bz);
    }
  }
  return g;
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, steps = 48): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}

/** Football markings (Laws of the Game dimensions) for a pitch of length × width. */
function pitchMarkings(length: number, width: number): P2[][] {
  const hx = length / 2;
  const hz = width / 2;
  const lines: P2[][] = [
    [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]],
    [[0, -hz], [0, hz]],
    arc(0, 0, 9.15, 0, Math.PI * 2, 96),
    arc(0, 0, 0.15, 0, Math.PI * 2, 12),
  ];
  for (const side of [-1, 1]) {
    const gx = side * hx;
    const inward = -side;
    const box = (depth: number, half: number): P2[] => [
      [gx, -half],
      [gx + inward * depth, -half],
      [gx + inward * depth, half],
      [gx, half],
    ];
    lines.push(box(16.5, 20.16)); // penalty area
    lines.push(box(5.5, 9.16)); // goal area
    const spotX = gx + inward * 11;
    lines.push(arc(spotX, 0, 0.15, 0, Math.PI * 2, 12)); // penalty spot
    // Penalty arc: the part of the 9.15 m circle outside the penalty area.
    const open = Math.acos((16.5 - 11) / 9.15);
    const facing = side > 0 ? Math.PI : 0;
    lines.push(arc(spotX, 0, 9.15, facing - open, facing + open, 32));
    // Corner arcs (r = 1 m).
    for (const zs of [-1, 1]) {
      const start = Math.atan2(-zs, inward);
      lines.push(arc(gx, zs * hz, 1, start - Math.PI / 4, start + Math.PI / 4, 10));
    }
  }
  return lines;
}

function stripeTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PALETTE.grassLight;
  ctx.fillRect(0, 0, 32, 4);
  ctx.fillStyle = PALETTE.grassDark;
  ctx.fillRect(32, 0, 32, 4);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  // ShapeGeometry UVs are plan metres: one light + one dark stripe = 10.5 m,
  // with a stripe edge on the halfway line.
  t.repeat.set(1 / 10.5, 1);
  return t;
}

function goals(length: number): { frame: BufferGeometry; net: BufferGeometry } {
  const parts: BufferGeometry[] = [];
  const nets: BufferGeometry[] = [];
  const postR = 0.06;
  const halfW = 3.66;
  const h = 2.44;
  const depth = 1.8;
  for (const side of [-1, 1]) {
    const x = side * (length / 2 + postR);
    for (const z of [-halfW, halfW]) {
      const post = new CylinderGeometry(postR, postR, h, 10);
      post.translate(x, h / 2, z);
      parts.push(post);
    }
    const bar = new CylinderGeometry(postR, postR, 2 * halfW + 2 * postR, 10);
    bar.rotateX(Math.PI / 2);
    bar.translate(x, h, 0);
    parts.push(bar);
    // Net: a simple open box behind the goal line (back + roof + sides).
    const back = x + side * depth;
    const pos = [
      // roof (from crossbar to back top at 1.6 m)
      x, h, -halfW, back, 1.6, -halfW, back, 1.6, halfW, x, h, -halfW, back, 1.6, halfW, x, h, halfW,
      // back
      back, 0, -halfW, back, 1.6, -halfW, back, 1.6, halfW, back, 0, -halfW, back, 1.6, halfW, back, 0, halfW,
      // sides
      x, 0, -halfW, x, h, -halfW, back, 1.6, -halfW, x, 0, -halfW, back, 1.6, -halfW, back, 0, -halfW,
      x, 0, halfW, x, h, halfW, back, 1.6, halfW, x, 0, halfW, back, 1.6, halfW, back, 0, halfW,
    ];
    const net = new BufferGeometry();
    net.setAttribute('position', new Float32BufferAttribute(pos, 3));
    net.computeVertexNormals();
    nets.push(net);
  }
  const frame = mergeGeometries(parts)!;
  const net = mergeGeometries(nets)!;
  parts.forEach((g) => g.dispose());
  nets.forEach((g) => g.dispose());
  return { frame, net };
}

export function Field({ venue }: { venue: Venue }) {
  const { config } = venue;
  const { pitch, track } = config;
  const ref = config.layout.referenceLine;

  const built = useMemo(() => {
    const bowlShape = () => roundedRectPath(new Shape(), ref.halfLength, ref.halfWidth, ref.cornerRadius);

    // Without a track (football-only bowl) the striped grass fills the whole
    // bowl up to the front of the stands: no track ring, no apron.
    let infield: BufferGeometry;
    let trackGeo: BufferGeometry | null = null;
    let apron: BufferGeometry | null = null;
    const straightHalf = track ? track.straightLength / 2 : 0;
    const r0 = track ? track.innerRadius : 0;
    if (track) {
      const r1 = r0 + track.lanes * track.laneWidth + 0.4;
      // Infield (inside the track kerb): striped grass.
      infield = shapeGeometry(stadiumPath(new Shape(), straightHalf, r0), 64);
      // Track ring.
      const trackShape = stadiumPath(new Shape(), straightHalf, r1);
      trackShape.holes.push(stadiumPath(new Path(), straightHalf, r0));
      trackGeo = shapeGeometry(trackShape, 64);
      // Apron: from the track's outer edge to the front of the stands.
      const apronShape = bowlShape();
      apronShape.holes.push(stadiumPath(new Path(), straightHalf, r1));
      apron = shapeGeometry(apronShape, 64);
    } else {
      infield = shapeGeometry(bowlShape(), 64);
    }

    const lines = ribbons(pitchMarkings(pitch.length, pitch.width), 0.12, 0.02);

    // Lane lines (and the kerb line) + a finish line across the home straight.
    const lanePolys: P2[][] = [];
    if (track) {
      for (let k = 0; k <= track.lanes; k++) {
        const r = r0 + k * track.laneWidth;
        lanePolys.push([[-straightHalf, -r], [straightHalf, -r]]);
        lanePolys.push(arc(straightHalf, 0, r, -Math.PI / 2, Math.PI / 2, 64));
        lanePolys.push([[straightHalf, r], [-straightHalf, r]]);
        lanePolys.push(arc(-straightHalf, 0, r, Math.PI / 2, (3 * Math.PI) / 2, 64));
      }
      lanePolys.push([[straightHalf, -r0], [straightHalf, -(r0 + track.lanes * track.laneWidth)]]);
    }
    const laneLines = track ? ribbons(lanePolys, 0.06, 0.012) : null;
    return { infield, trackGeo, apron, lines, laneLines, goals: goals(pitch.length) };
  }, [pitch, track, ref]);

  const mats = useMemo(() => {
    const stripes = stripeTexture();
    return {
      stripes,
      grass: new MeshStandardMaterial({ map: stripes, roughness: 0.95 }),
      track: new MeshStandardMaterial({ color: PALETTE.track, roughness: 0.9 }),
      apron: new MeshStandardMaterial({ color: PALETTE.apron, roughness: 0.92 }),
      line: new MeshStandardMaterial({
        color: PALETTE.line,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
      laneLine: new MeshStandardMaterial({
        color: PALETTE.trackLine,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
      goalFrame: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
      // Faint: up close a denser net read as a frosted white slab.
      net: new MeshStandardMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.12, side: 2, depthWrite: false }),
    };
  }, []);

  // Luminous overview: the pitch and track step back (about 55 %) so the glowing
  // bowl, not a bright lawn, carries the picture; full brightness up close.
  const base = useMemo(() => ({ track: mats.track.color.clone(), apron: mats.apron.color.clone() }), [mats]);
  useFrame(() => {
    const k = 1 - 0.45 * look.holo;
    mats.grass.color.setScalar(k);
    mats.track.color.copy(base.track).multiplyScalar(k);
    mats.apron.color.copy(base.apron).multiplyScalar(k);
  });

  useEffect(
    () => () => {
      const geos = [built.infield, built.trackGeo, built.apron, built.lines, built.laneLines, built.goals.frame, built.goals.net];
      geos.forEach((g) => g?.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [built, mats],
  );

  return (
    <group>
      <mesh geometry={built.infield} material={mats.grass} />
      {built.trackGeo && <mesh geometry={built.trackGeo} material={mats.track} />}
      {built.apron && <mesh geometry={built.apron} material={mats.apron} />}
      <mesh geometry={built.lines} material={mats.line} />
      {built.laneLines && <mesh geometry={built.laneLines} material={mats.laneLine} />}
      <mesh geometry={built.goals.frame} material={mats.goalFrame} />
      <mesh geometry={built.goals.net} material={mats.net} />
    </group>
  );
}
