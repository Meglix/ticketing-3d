import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three';
import { offsetLength, pointAt, sampleSpan } from '../geometry/roundedRect.ts';
import { PARAPET_THICKNESS, treadEdges } from '../geometry/structure.ts';
import type { RingConfig, SectorConfig } from '../venue/schema.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { look } from './look.ts';

/**
 * In-world LED fascia boards: warm LED ribbons on the front of each ring —
 * the upper ring's fascia between the tiers and the lower ring's front wall
 * along the track — one board per sector, reading "SECTOR 2M2 · DE LA 40 LEI".
 * No club or venue logos.
 *
 * All boards share one canvas texture atlas (one row per board) and one
 * merged geometry: one draw call. The text is drawn pre-scaled so it is not
 * stretched on boards of different lengths. The material is HDR: the bright
 * text blooms, the dark board background doesn't.
 */

const ROW_W = 1024;
const ROW_H = 64;
const SURFACE_GAP = 0.035; // in front of the wall, against z-fighting
const TEXT_HDR = new Color(1.75, 1.55, 1.25);

interface Board {
  from: number;
  to: number;
  d: number;
  y0: number;
  y1: number;
  text: string;
  /** Top of the parapet: height and the distance of its centre line (for the LED ribbon). */
  topY: number;
  topD: number;
}

function boardText(sector: SectorConfig, price: number | null): string {
  if (price === null) return `${sector.code}  ·  PRESĂ`;
  if (sector.category === 'vip') return `VIP ${sector.code}  ·  DE LA ${price} LEI`;
  return `SECTOR ${sector.code}  ·  DE LA ${price} LEI`;
}

/** One board per sector on the front face of its ring (none for pitch-level platforms). */
function boardsOf(venue: Venue): Board[] {
  const out: Board[] = [];
  const tiers = new Map(venue.config.priceTiers.map((t) => [t.id, t]));
  for (const stand of venue.config.stands) {
    for (const ring of stand.rings) {
      if (ring.parapetHeight <= 0) continue;
      for (const sector of ring.sectors) out.push(board(ring, sector, tiers.get(sector.tier)?.price ?? null));
    }
  }
  return out;
}

function board(ring: RingConfig, sector: SectorConfig, price: number | null): Board {
  const first = sector.rows[0]!;
  const front = treadEdges(sector.rows)[0]! - PARAPET_THICKNESS;
  const top = first.elevation + ring.parapetHeight;
  // Lower ring: the wall goes down to the track; upper ring: down to the slab's soffit.
  const bottom = ring.slabThickness === null ? 0 : first.elevation - ring.slabThickness;
  const margin = (top - bottom) * 0.1;
  return {
    from: sector.span.from + 0.4,
    to: sector.span.to - 0.4,
    d: front - SURFACE_GAP,
    y0: bottom + margin,
    y1: top - margin,
    text: boardText(sector, price),
    topY: top,
    topD: front + PARAPET_THICKNESS / 2,
  };
}

function drawAtlas(boards: Board[], lengths: number[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ROW_W;
  canvas.height = Math.max(ROW_H, 2 ** Math.ceil(Math.log2(boards.length * ROW_H)));
  const ctx = canvas.getContext('2d')!;
  boards.forEach((b, i) => {
    const y = i * ROW_H;
    // Board: near-black LED panel with a faint dot matrix and a thin warm rule top and bottom.
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, y, ROW_W, ROW_H);
    ctx.fillStyle = 'rgba(255, 210, 150, 0.05)';
    for (let px = 2; px < ROW_W; px += 4) for (let py = 2; py < ROW_H; py += 4) ctx.fillRect(px, y + py, 1, 1);
    ctx.fillStyle = 'rgba(255, 196, 120, 0.85)';
    ctx.fillRect(0, y + 3, ROW_W, 2);
    ctx.fillRect(0, y + ROW_H - 5, ROW_W, 2);
    // Text, pre-scaled horizontally so the letters keep their shape on a board
    // of real length L and height H (texels per metre differ along u and v).
    const L = lengths[i]!;
    const H = b.y1 - b.y0;
    const sx = ROW_W / L / (ROW_H / H);
    // As large as the board allows: up to ~65 % of its height (readable from
    // the far side of the bowl), smaller only when the text would not fit.
    let size = 42;
    ctx.font = `700 ${size}px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
    const width = () => ctx.measureText(b.text).width * sx;
    while (width() > ROW_W - 60 && size > 12) {
      size -= 2;
      ctx.font = `700 ${size}px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
    }
    ctx.save();
    ctx.setTransform(sx, 0, 0, 1, ROW_W / 2, y + ROW_H / 2 + 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 190, 110, 0.9)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fff0d6';
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  });
  return canvas;
}

function buildGeometry(venue: Venue, boards: Board[], atlasH: number): { geometry: BufferGeometry; lengths: number[] } {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lengths: number[] = [];
  boards.forEach((b, i) => {
    const L = offsetLength(venue.curve, b.from, b.to, b.d);
    lengths.push(L);
    const v1 = 1 - (i * ROW_H) / atlasH;
    const v0 = 1 - ((i + 1) * ROW_H) / atlasH;
    const base = pos.length / 3;
    const stations = sampleSpan(venue.curve, b.from, b.to, Math.PI / 96);
    stations.forEach((s, k) => {
      const p = pointAt(venue.curve, s, b.d);
      const u = offsetLength(venue.curve, b.from, s, b.d) / L;
      pos.push(p.x, b.y0, p.z, p.x, b.y1, p.z);
      uv.push(u, v0 + 0.002, u, v1 - 0.002);
      if (k > 0) {
        const a = base + (k - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  return { geometry, lengths };
}

/**
 * A thin warm LED ribbon along the top of each parapet. Seen from a seat it
 * edges the front of the stand, where the unlit back of the wall otherwise
 * read as a dark seam before the track; in the overview it adds the warm
 * tier rings of the reference. One merged strip, one draw call.
 */
function buildRibbon(venue: Venue, boards: Board[]): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const HALF = 0.05;
  for (const b of boards) {
    const base = pos.length / 3;
    const stations = sampleSpan(venue.curve, b.from, b.to, Math.PI / 96);
    stations.forEach((s, k) => {
      const inner = pointAt(venue.curve, s, b.topD - HALF);
      const outer = pointAt(venue.curve, s, b.topD + HALF);
      pos.push(inner.x, b.topY + 0.012, inner.z, outer.x, b.topY + 0.012, outer.z);
      if (k > 0) {
        const a = base + (k - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const RIBBON_HDR = new Color(1.7, 1.1, 0.5);

export function LedBoards({ venue }: { venue: Venue }) {
  const built = useMemo(() => {
    const boards = boardsOf(venue);
    const atlasH = Math.max(ROW_H, 2 ** Math.ceil(Math.log2(boards.length * ROW_H)));
    const { geometry, lengths } = buildGeometry(venue, boards, atlasH);
    const texture = new CanvasTexture(drawAtlas(boards, lengths));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = LinearMipmapLinearFilter;
    const material = new MeshBasicMaterial({ map: texture, color: TEXT_HDR, toneMapped: false, side: DoubleSide });
    const ribbon = buildRibbon(venue, boards);
    const ribbonMaterial = new MeshBasicMaterial({ color: RIBBON_HDR, toneMapped: false, side: DoubleSide });
    return { geometry, material, texture, ribbon, ribbonMaterial };
  }, [venue]);
  const { geometry, material, texture, ribbon, ribbonMaterial } = built;

  useFrame(() => {
    // The boards and ribbons light up with the stadium during the intro.
    material.color.copy(TEXT_HDR).multiplyScalar(0.15 + 0.85 * look.power);
    ribbonMaterial.color.copy(RIBBON_HDR).multiplyScalar(0.1 + 0.9 * look.power);
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      ribbon.dispose();
      ribbonMaterial.dispose();
    },
    [geometry, material, texture, ribbon, ribbonMaterial],
  );

  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={4} />
      <mesh geometry={ribbon} material={ribbonMaterial} renderOrder={4} />
    </>
  );
}
