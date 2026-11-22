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
  anchor: Vector3;
}

export function buildLabelModels(venue: Venue): LabelModel[] {
  const out: LabelModel[] = [];
  for (const stand of venue.config.stands) {
    const sectors = stand.rings.flatMap((r) => r.sectors);
    if (sectors.length === 0) continue;
    // Middle of the stand along the reference line, just outside its highest ring.
    const from = Math.min(...sectors.map((s) => s.span.from));
    const to = Math.max(...sectors.map((s) => s.span.to));
    let maxD = 0;
    let maxY = 0;
    for (const s of sectors) {
      const last = s.rows[s.rows.length - 1]!;
      maxD = Math.max(maxD, last.distance);
      maxY = Math.max(maxY, last.elevation);
    }
    const p = pointAt(venue.curve, (from + to) / 2, maxD + 3);
    out.push({ key: stand.id, text: stand.name.toUpperCase(), anchor: new Vector3(p.x, maxY + 4, p.z) });
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

export function LabelTracker({ models, registry }: { models: LabelModel[]; registry: LabelRegistry }) {
  const v = useMemo(() => new Vector3(), []);
  const visibleRef = useRef<boolean | null>(null);

  useFrame(({ camera, size }) => {
    const layer = registry.layer;
    if (!layer) return;
    const app = appStore.get();
    const visible = app.view === 'overview' && !app.inTransit && introDone() && look.holo > 0.5;
    if (visible !== visibleRef.current) {
      visibleRef.current = visible;
      layer.classList.toggle('is-hidden', !visible);
    }
    if (!visible) return;
    models.forEach((m, i) => {
      const el = registry.els[i];
      if (!el) return;
      v.copy(m.anchor).applyMatrix4(camera.matrixWorldInverse);
      const behind = v.z > -1;
      v.applyMatrix4(camera.projectionMatrix);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const off = behind || x < 8 || x > size.width - 8 || y < 8 || y > size.height - 8;
      el.style.opacity = off ? '0' : '';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    });
  });

  return null;
}
