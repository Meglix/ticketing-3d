import type { RingConfig, SectorConfig, VenueConfig } from '../venue/schema.ts';
import {
  frameAt,
  offsetLength,
  paramAtOffsetLength,
  pointAt,
  sampleSpan,
  type ReferenceCurve,
} from './roundedRect.ts';
import type { Beam, Floodlight, MeshData, ScreenPlacement, StructureData, Vec3 } from './types.ts';

/**
 * Builds the static structure as plain vertex buffers (no three.js):
 * stepped stands per sector, roof skin, trusses, columns, facade, floodlight
 * and screen placements. All of it comes from the config.
 *
 * Technique: a 2D cross-section in (d, y) coordinates (d = distance from the
 * reference line, y = height) is swept along the reference line between two
 * arc lengths. The rows are offset curves of that line, so the sweep is exact.
 */

/** A point of a cross-section: d = distance from the reference line, y = height. */
interface SectionPoint {
  d: number;
  y: number;
}

const PARAPET_THICKNESS = 0.2;
const BACK_WALL_THICKNESS = 0.3;
/** Tread depth assumed for a single-row sector (no neighbour to measure from). */
const SINGLE_ROW_DEPTH = 1.0;

// ---------------------------------------------------------------------------
// Mesh builder: collects triangles and orients each one so that its winding
// matches the normal we want (counter-clockwise seen from the normal side).
// ---------------------------------------------------------------------------

export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private indices: number[] = [];

  vertex(p: Vec3, n: Vec3): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    return this.positions.length / 3 - 1;
  }

  /** Adds triangle a-b-c, flipped if needed so its face normal agrees with `want`. */
  tri(a: number, b: number, c: number, want: Vec3): void {
    const P = this.positions;
    const ax = P[a * 3]!, ay = P[a * 3 + 1]!, az = P[a * 3 + 2]!;
    const e1x = P[b * 3]! - ax, e1y = P[b * 3 + 1]! - ay, e1z = P[b * 3 + 2]! - az;
    const e2x = P[c * 3]! - ax, e2y = P[c * 3 + 1]! - ay, e2z = P[c * 3 + 2]! - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const dot = nx * want.x + ny * want.y + nz * want.z;
    if (dot >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  /** Quad a-b-c-d (in order around its edge). */
  quad(a: number, b: number, c: number, d: number, want: Vec3): void {
    this.tri(a, b, c, want);
    this.tri(a, c, d, want);
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
    };
  }
}

// ---------------------------------------------------------------------------
// Sweeping
// ---------------------------------------------------------------------------

interface Station {
  px: number;
  pz: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
}

function stationsFor(curve: ReferenceCurve, s0: number, s1: number): Station[] {
  return sampleSpan(curve, s0, s1).map((s) => {
    const f = frameAt(curve, s);
    return { px: f.point.x, pz: f.point.z, nx: f.normal.x, nz: f.normal.z, tx: f.tangent.x, tz: f.tangent.z };
  });
}

function at(st: Station, p: SectionPoint): Vec3 {
  return { x: st.px + p.d * st.nx, y: p.y, z: st.pz + p.d * st.nz };
}

/**
 * Sweep a polyline of section points along the stations. Each polyline edge
 * becomes its own quad strip (hard edges between tread and riser). The
 * outward side of an edge going from a to b is (−Δy, Δd), so a section
 * polygon listed clockwise in (d → right, y → up) gets outward normals.
 */
function sweepPolyline(b: MeshBuilder, stations: Station[], points: SectionPoint[], closed: boolean): void {
  const edgeCount = closed ? points.length : points.length - 1;
  for (let k = 0; k < edgeCount; k++) {
    const pa = points[k]!;
    const pb = points[(k + 1) % points.length]!;
    const dd = pb.d - pa.d;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dd, dy);
    if (len < 1e-9) continue;
    const sd = -dy / len; // section-normal component along the plan normal
    const sy = dd / len; // section-normal component along +y
    let prevA = -1;
    let prevB = -1;
    let prevN: Vec3 | null = null;
    for (const st of stations) {
      const n = { x: sd * st.nx, y: sy, z: sd * st.nz };
      const ia = b.vertex(at(st, pa), n);
      const ib = b.vertex(at(st, pb), n);
      if (prevN) {
        const want = { x: n.x + prevN.x, y: n.y + prevN.y, z: n.z + prevN.z };
        b.quad(prevA, ia, ib, prevB, want);
      }
      prevA = ia;
      prevB = ib;
      prevN = n;
    }
  }
}

/**
 * Fill the end of a swept section. The section is "d-monotone": a top chain
 * whose d never decreases, over a straight bottom line. So it splits into
 * vertical trapezoids, one per top-chain edge that moves forward in d.
 */
function capSection(
  b: MeshBuilder,
  st: Station,
  top: SectionPoint[],
  bottomY: (d: number) => number,
  outward: Vec3,
): void {
  for (let k = 0; k < top.length - 1; k++) {
    const p = top[k]!;
    const q = top[k + 1]!;
    if (q.d - p.d < 1e-9) continue;
    const i0 = b.vertex(at(st, { d: p.d, y: bottomY(p.d) }), outward);
    const i1 = b.vertex(at(st, { d: q.d, y: bottomY(q.d) }), outward);
    const i2 = b.vertex(at(st, q), outward);
    const i3 = b.vertex(at(st, p), outward);
    b.quad(i0, i1, i2, i3, outward);
  }
}

// ---------------------------------------------------------------------------
// Stand cross-section
// ---------------------------------------------------------------------------

export interface StandSection {
  /** Top chain from the front edge to the back edge (d non-decreasing). */
  top: SectionPoint[];
  /** Height of the underside at distance d (0 for a solid ring, the soffit line otherwise). */
  bottomY: (d: number) => number;
}

/** Row boundaries: tread i spans [edges[i], edges[i+1]] (rows are centred on their distance). */
export function treadEdges(rows: { distance: number }[]): number[] {
  const n = rows.length;
  const depth = (i: number): number => {
    if (n === 1) return SINGLE_ROW_DEPTH;
    if (i < n - 1) return rows[i + 1]!.distance - rows[i]!.distance;
    return rows[n - 1]!.distance - rows[n - 2]!.distance;
  };
  const edges = [rows[0]!.distance - depth(0) / 2];
  for (let i = 0; i < n - 1; i++) edges.push((rows[i]!.distance + rows[i + 1]!.distance) / 2);
  edges.push(rows[n - 1]!.distance + depth(n - 1) / 2);
  return edges;
}

/** Cross-section of one sector: parapet, stepped treads, back wall, and the underside. */
export function standSection(ring: RingConfig, sector: SectorConfig): StandSection {
  const rows = sector.rows;
  const edges = treadEdges(rows);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const front = edges[0]!;
  const back = edges[edges.length - 1]!;

  const top: SectionPoint[] = [];
  if (ring.parapetHeight > 0) {
    top.push({ d: front - PARAPET_THICKNESS, y: first.elevation + ring.parapetHeight });
    top.push({ d: front, y: first.elevation + ring.parapetHeight });
  }
  top.push({ d: front, y: first.elevation });
  rows.forEach((row, i) => {
    top.push({ d: edges[i + 1]!, y: row.elevation });
    const next = rows[i + 1];
    if (next) top.push({ d: edges[i + 1]!, y: next.elevation });
  });
  if (ring.backWallHeight > 0) {
    top.push({ d: back, y: last.elevation + ring.backWallHeight });
    top.push({ d: back + BACK_WALL_THICKNESS, y: last.elevation + ring.backWallHeight });
  }

  const dMin = top[0]!.d;
  const dMax = top[top.length - 1]!.d;
  const slab = ring.slabThickness;
  const bottomY =
    slab === null
      ? () => 0
      : (d: number) => {
          const t = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0;
          return first.elevation - slab + t * (last.elevation - first.elevation);
        };
  return { top, bottomY };
}

function sectorMesh(curve: ReferenceCurve, ring: RingConfig, sector: SectorConfig): MeshData {
  const b = new MeshBuilder();
  const stations = stationsFor(curve, sector.span.from, sector.span.to);
  const { top, bottomY } = standSection(ring, sector);
  const dMin = top[0]!.d;
  const dMax = top[top.length - 1]!.d;
  // Closed polygon, clockwise in (d right, y up): front-bottom, top chain, back-bottom.
  const polygon: SectionPoint[] = [{ d: dMin, y: bottomY(dMin) }, ...top, { d: dMax, y: bottomY(dMax) }];
  sweepPolyline(b, stations, polygon, true);
  const s0 = stations[0]!;
  const s1 = stations[stations.length - 1]!;
  capSection(b, s0, top, bottomY, { x: -s0.tx, y: 0, z: -s0.tz });
  capSection(b, s1, top, bottomY, { x: s1.tx, y: 0, z: s1.tz });
  return b.build();
}

// ---------------------------------------------------------------------------
// Roof, facade, trusses, floodlights
// ---------------------------------------------------------------------------

const FASCIA_HEIGHT = 1.0;

function emptyMesh(): MeshData {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
}

/** Height of the roof skin at distance d (linear from the leading edge to the cornice). */
function roofSkinY(roof: NonNullable<VenueConfig['roof']>, d: number): number {
  const t = (d - roof.inner.distance) / (roof.outer.distance - roof.inner.distance);
  return roof.inner.height + t * (roof.outer.height - roof.inner.height);
}

function buildRoof(curve: ReferenceCurve, config: VenueConfig): StructureData['roof'] {
  const roof = config.roof;
  if (!roof) return { opaque: emptyMesh(), translucent: emptyMesh(), trusses: [], columns: [] };

  const opaque = new MeshBuilder();
  const translucent = new MeshBuilder();
  const trusses: Beam[] = [];
  const columns: Beam[] = [];

  const dIn = roof.inner.distance;
  const dOut = roof.outer.distance;
  const dT = Math.min(dOut, dIn + roof.translucentDepth);
  const inner = { d: dIn, y: roof.inner.height };
  const split = { d: dT, y: roofSkinY(roof, dT) };
  const outer = { d: dOut, y: roof.outer.height };
  const dCol = roof.columnDistance;
  const yColTop = roofSkinY(roof, dCol) - 0.3;
  const yColBottomChord = yColTop - roof.trussDepth;

  for (const seg of roof.segments) {
    const stations = stationsFor(curve, seg.from, seg.to);
    sweepPolyline(translucent, stations, [inner, split], false);
    sweepPolyline(opaque, stations, [split, outer], false);
    // Fascia along the leading edge (edge going up: normal faces the field).
    sweepPolyline(opaque, stations, [{ d: dIn, y: roof.inner.height - FASCIA_HEIGHT }, inner], false);

    // Frames: evenly spaced along the column line.
    const colLen = offsetLength(curve, seg.from, seg.to, dCol);
    const frames = Math.max(2, Math.round(colLen / roof.frameSpacing) + 1);
    for (let i = 0; i < frames; i++) {
      const s = paramAtOffsetLength(curve, seg.from, dCol, (colLen * i) / (frames - 1));
      const P = (d: number, y: number): Vec3 => {
        const p = pointAt(curve, s, d);
        return { x: p.x, y, z: p.z };
      };
      const tipTop = P(dIn + 0.2, roof.inner.height - 0.3);
      const tipBottom = P(dIn + 0.2, roof.inner.height - 0.9);
      const colTop = P(dCol, yColTop);
      const colChord = P(dCol, yColBottomChord);
      const backTop = P(dOut - 0.2, roof.outer.height - 0.3);
      // Column from the ground to the bottom chord.
      columns.push({ from: P(dCol, 0), to: colChord, width: 1.2, height: 0.8 });
      // Top and bottom chords of the cantilever, plus the back span.
      trusses.push({ from: tipTop, to: colTop, width: 0.35, height: 0.35 });
      trusses.push({ from: tipBottom, to: colChord, width: 0.45, height: 0.45 });
      trusses.push({ from: colTop, to: backTop, width: 0.35, height: 0.35 });
      trusses.push({ from: colChord, to: colTop, width: 0.35, height: 0.35 });
      trusses.push({ from: colChord, to: backTop, width: 0.3, height: 0.3 });
      // Web: verticals and diagonals at quarter points of the cantilever.
      let prevBottom = tipBottom;
      for (let k = 1; k <= 3; k++) {
        const d = dIn + 0.2 + ((dCol - dIn - 0.2) * k) / 4;
        const t = k / 4;
        const yTop = roofSkinY(roof, d) - 0.3;
        const yBottom = roof.inner.height - 0.9 + t * (yColBottomChord - (roof.inner.height - 0.9));
        const top = P(d, yTop);
        const bottom = P(d, yBottom);
        trusses.push({ from: bottom, to: top, width: 0.25, height: 0.25 });
        trusses.push({ from: prevBottom, to: top, width: 0.22, height: 0.22 });
        prevBottom = bottom;
      }
    }
  }
  return { opaque: opaque.build(), translucent: translucent.build(), trusses, columns };
}

function buildFacade(curve: ReferenceCurve, config: VenueConfig): MeshData {
  const facade = config.facade;
  const segments = config.roof?.segments;
  if (!facade || !segments) return emptyMesh();
  const b = new MeshBuilder();
  for (const seg of segments) {
    const stations = stationsFor(curve, seg.from, seg.to);
    // Edge going down => outward normal (+d), i.e. the face seen from outside.
    sweepPolyline(
      b,
      stations,
      [
        { d: facade.distance, y: facade.height },
        { d: facade.distance, y: 0 },
      ],
      false,
    );
  }
  return b.build();
}

function buildFloodlights(curve: ReferenceCurve, config: VenueConfig): Floodlight[] {
  const roof = config.roof;
  const count = config.floodlights.count;
  if (!roof || count === 0) return [];
  const d = roof.inner.distance + 0.5;
  const y = roof.inner.height - FASCIA_HEIGHT - 0.4;
  const lengths = roof.segments.map((seg) => offsetLength(curve, seg.from, seg.to, d));
  const total = lengths.reduce((a, b) => a + b, 0);
  const spacing = total / count;
  const out: Floodlight[] = [];
  // Fittings are evenly spaced along the leading edges laid end to end.
  let segIndex = 0;
  let segStart = 0;
  for (let k = 0; k < count; k++) {
    const along = (k + 0.5) * spacing;
    while (along > segStart + lengths[segIndex]! && segIndex < lengths.length - 1) {
      segStart += lengths[segIndex]!;
      segIndex++;
    }
    const seg = roof.segments[segIndex]!;
    const s = paramAtOffsetLength(curve, seg.from, d, Math.min(along - segStart, lengths[segIndex]!));
    const p = pointAt(curve, s, d);
    // Aim a little short of the centre spot so the beams fan over the pitch.
    out.push({ position: { x: p.x, y, z: p.z }, target: { x: p.x * 0.25, y: 0, z: p.z * 0.25 } });
  }
  return out;
}

function buildScreens(config: VenueConfig): ScreenPlacement[] {
  return config.screens.map((s) => {
    const len = Math.hypot(s.x, s.z) || 1;
    return {
      center: { x: s.x, y: s.elevation, z: s.z },
      facing: { x: -s.x / len, z: -s.z / len },
      width: s.width,
      height: s.height,
    };
  });
}

/** Build all structure buffers for a venue whose rows are offsets of `curve`. */
export function generateStructureAlongCurve(config: VenueConfig, curve: ReferenceCurve): StructureData {
  const sectorSurfaces: Record<string, MeshData> = {};
  let maxDistance = 0;
  let maxHeight = 0;
  for (const stand of config.stands) {
    for (const ring of stand.rings) {
      for (const sector of ring.sectors) {
        sectorSurfaces[sector.code] = sectorMesh(curve, ring, sector);
        const last = sector.rows[sector.rows.length - 1]!;
        maxDistance = Math.max(maxDistance, last.distance + 1);
        maxHeight = Math.max(maxHeight, last.elevation + ring.backWallHeight);
      }
    }
  }
  if (config.roof) {
    maxDistance = Math.max(maxDistance, config.roof.outer.distance);
    maxHeight = Math.max(maxHeight, config.roof.outer.height, config.roof.inner.height);
  }
  if (config.facade) maxDistance = Math.max(maxDistance, config.facade.distance);

  const spec = curve.spec;
  return {
    sectorSurfaces,
    roof: buildRoof(curve, config),
    facade: buildFacade(curve, config),
    floodlights: buildFloodlights(curve, config),
    screens: buildScreens(config),
    bounds: {
      halfLength: spec.halfLength + maxDistance,
      halfWidth: spec.halfWidth + maxDistance,
      height: maxHeight,
    },
  };
}
