import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { pointAt } from '../geometry/roundedRect.ts';
import { appStore } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { introDone, look } from './look.ts';

/**
 * V2: discreet stand names ("TRIBUNA I", "PELUZA II (NORD)") floating just
 * above each stand's outer rim in the overview — like the small rim labels of
 * the reference. No per-sector price pills: a sector's name and price appear
 * on hover (desktop hover card) or in the sector focus panel.
 *
 * DOM chips over the canvas, positioned from inside the render loop through
 * refs (no React re-render per frame).
 */

export interface LabelModel {
  key: string;
  text: string;
  /** Middle of the stand on the outer rim of the bowl (roof cornice, or just above the top row). */
  anchor: Vector3;
}

export function buildLabelModels(venue: Venue): LabelModel[] {
  const out: LabelModel[] = [];
  const roof = venue.config.roof;
  for (const stand of venue.config.stands) {
    const sectors = stand.rings.flatMap((r) => r.sectors);
    if (sectors.length === 0) continue;
    const from = Math.min(...sectors.map((s) => s.span.from));
    const to = Math.max(...sectors.map((s) => s.span.to));
    let maxD = 0;
    let maxY = 0;
    for (const s of sectors) {
      const last = s.rows[s.rows.length - 1]!;
      maxD = Math.max(maxD, last.distance);
      maxY = Math.max(maxY, last.elevation);
    }
    const d = roof ? Math.max(roof.outer.distance, maxD + 3) : maxD + 3;
    const y = roof ? roof.outer.height : maxY + 4;
    const p = pointAt(venue.curve, (from + to) / 2, d);
    out.push({ key: stand.id, text: stand.name.toUpperCase(), anchor: new Vector3(p.x, y, p.z) });
  }
  return out;
}

/** Shared between the DOM layer (outside the canvas) and the tracker (inside). */
export interface LabelRegistry {
  layer: HTMLDivElement | null;
  els: (HTMLDivElement | null)[];
}

export function createLabelRegistry(count: number): LabelRegistry {
  return { layer: null, els: new Array<HTMLDivElement | null>(count).fill(null) };
}

export function LabelLayer({ models, registry }: { models: LabelModel[]; registry: LabelRegistry }) {
  return (
    <div
      className="stand-labels is-hidden"
      ref={(el) => {
        registry.layer = el;
      }}
      aria-hidden="true"
    >
      {models.map((m, i) => (
        <div
          key={m.key}
          className="stand-label"
          ref={(el) => {
            registry.els[i] = el;
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}

/** Gap between the bowl's outer rim and a stand name (px). */
const LABEL_GAP = 10;
const EDGE_MARGIN = 8;

export function LabelTracker({ models, registry }: { models: LabelModel[]; registry: LabelRegistry }) {
  const v = useMemo(() => new Vector3(), []);
  const c = useMemo(() => new Vector3(), []);
  const visibleRef = useRef<boolean | null>(null);
  const sizes = useRef<{ w: number; h: number }[]>([]);

  useFrame(({ camera, size }) => {
    const layer = registry.layer;
    if (!layer) return;
    const app = appStore.get();
    const visible = app.view === 'overview' && !app.inTransit && introDone() && look.holo > 0.5;
    if (visible !== visibleRef.current) {
      visibleRef.current = visible;
      layer.classList.toggle('is-hidden', !visible);
      // Measure once per show (text and font size only change with the viewport class).
      sizes.current = registry.els.map((el) => ({ w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 }));
    }
    if (!visible) return;
    // Each name sits just outside the bowl: from the rim anchor, pushed away
    // from the bowl's centre on screen by half its own size plus a gap, so it
    // never covers seats — above the far stand, below the near one, beside
    // the ends — then kept inside the viewport.
    c.set(0, 0, 0).project(camera);
    const cx = (c.x * 0.5 + 0.5) * size.width;
    const cy = (-c.y * 0.5 + 0.5) * size.height;
    models.forEach((m, i) => {
      const el = registry.els[i];
      if (!el) return;
      v.copy(m.anchor).applyMatrix4(camera.matrixWorldInverse);
      const behind = v.z > -1;
      v.applyMatrix4(camera.projectionMatrix);
      const px = (v.x * 0.5 + 0.5) * size.width;
      const py = (-v.y * 0.5 + 0.5) * size.height;
      const len = Math.hypot(px - cx, py - cy) || 1;
      const ux = (px - cx) / len;
      const uy = (py - cy) / len;
      const box = sizes.current[i] ?? { w: 0, h: 0 };
      // Beside the bowl with no room for the text (narrow phone screens):
      // turn it to run along the rim instead.
      const room = ux < 0 ? px - EDGE_MARGIN : size.width - EDGE_MARGIN - px;
      const turn = Math.abs(ux) > Math.abs(uy) && room < box.w + LABEL_GAP;
      const w = turn ? box.h : box.w;
      const h = turn ? box.w : box.h;
      const push = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2) + LABEL_GAP;
      const x = Math.min(Math.max(px + ux * push, w / 2 + EDGE_MARGIN), size.width - w / 2 - EDGE_MARGIN);
      const y = Math.min(Math.max(py + uy * push, h / 2 + EDGE_MARGIN), size.height - h / 2 - EDGE_MARGIN);
      el.style.opacity = behind ? '0' : '';
      const rotate = turn ? (ux < 0 ? ' rotate(-90deg)' : ' rotate(90deg)') : '';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)${rotate}`;
    });
  });

  return null;
}
