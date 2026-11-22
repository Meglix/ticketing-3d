import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { appStore } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';

/**
 * Sector labels ("2M2 · de la 40 lei") as plain DOM chips over the canvas.
 *
 * Why not one drei <Html> per label: we need *global* decisions every frame
 * (which labels fit without overlapping), so one tracker inside the canvas
 * projects all anchors and positions the chips through refs — no React
 * re-render per frame, ~60 projections, a greedy overlap pass.
 *
 * Rules:
 *  - visible only in the overview (hidden while flying and in the seat view);
 *  - placement order = commercial value: hovered first, then VIP, the
 *    wheelchair platform (a showcase), then price from high to low, press
 *    last; ties go to the label nearest the camera, then by code (stable);
 *  - a label that would overlap one already placed is first nudged one chip
 *    height up or down; only if all three positions collide is it hidden;
 *  - narrow screens get a compact text ("de la 40 lei") and smaller chips.
 */

export interface LabelModel {
  code: string;
  /** Placement priority: higher is placed first (see the rules above). */
  rank: number;
  full: string;
  compact: string;
  color: string;
  anchor: Vector3;
}

export function buildLabelModels(venue: Venue): LabelModel[] {
  return venue.manifest.sectors.map((s) => {
    const tier = venue.tierById.get(s.tierId);
    const price = tier?.price ?? null;
    let full: string;
    let compact: string;
    if (s.category === 'press' || price === null) {
      full = `${s.code} · Presă`;
      compact = 'Presă';
    } else if (s.category === 'accessible') {
      full = `♿ ${s.code} · de la ${price} lei`;
      compact = `♿ de la ${price} lei`;
    } else {
      full = `${s.code} · de la ${price} lei`;
      compact = `de la ${price} lei`;
    }
    const rank =
      s.category === 'vip' ? 1000 : s.category === 'accessible' ? 500 : price === null ? -1 : price;
    return {
      code: s.code,
      rank,
      full,
      compact,
      color: tier?.color ?? '#ffffff',
      anchor: new Vector3(s.labelAnchor.x, s.labelAnchor.y, s.labelAnchor.z),
    };
  });
}

/** Shared between the DOM layer (outside the canvas) and the tracker (inside). */
export interface LabelRegistry {
  layer: HTMLDivElement | null;
  els: (HTMLDivElement | null)[];
}

export function createLabelRegistry(count: number): LabelRegistry {
  return { layer: null, els: new Array<HTMLDivElement | null>(count).fill(null) };
}

/** Vertical positions tried for each label, in chip heights: on the anchor, above, below. */
const NUDGES = [0, -1, 1] as const;

/** Width below which labels switch to the compact form. */
const COMPACT_BELOW = 640;

export function LabelLayer({ models, registry }: { models: LabelModel[]; registry: LabelRegistry }) {
  return (
    <div
      className="sector-labels"
      ref={(el) => {
        registry.layer = el;
      }}
      aria-hidden="true"
    >
      {models.map((m, i) => (
        <div
          key={m.code}
          className="sector-label"
          data-code={m.code}
          style={{ ['--tier' as string]: m.color }}
          ref={(el) => {
            registry.els[i] = el;
          }}
        >
          <span className="sector-label__dot" />
          <span className="sector-label__full">{m.full}</span>
          <span className="sector-label__compact">{m.compact}</span>
        </div>
      ))}
    </div>
  );
}

interface Slot {
  i: number;
  x: number;
  y: number;
  /** Vertical nudge chosen by the placement pass (px). */
  dy: number;
  dist: number;
  priority: number;
}

export function LabelTracker({ models, registry }: { models: LabelModel[]; registry: LabelRegistry }) {
  const v = useMemo(() => new Vector3(), []);
  const state = useRef({
    compact: null as boolean | null,
    sizes: [] as { w: number; h: number }[],
    shown: [] as boolean[],
    pos: [] as { x: number; y: number }[],
    layerVisible: null as boolean | null,
    emphasis: '' as string,
  });
  const slots = useMemo<Slot[]>(() => models.map((_, i) => ({ i, x: 0, y: 0, dy: 0, dist: 0, priority: 0 })), [models]);
  const placed = useMemo<{ x0: number; y0: number; x1: number; y1: number }[]>(() => [], []);

  useFrame(({ camera, size }) => {
    const layer = registry.layer;
    if (!layer) return;
    const st = state.current;
    const app = appStore.get();

    const visible = app.view === 'overview' && !app.inTransit;
    if (visible !== st.layerVisible) {
      st.layerVisible = visible;
      layer.classList.toggle('is-hidden', !visible);
    }
    if (!visible) return;

    // Compact mode on narrow screens; re-measure chip sizes when it changes.
    const compact = size.width < COMPACT_BELOW;
    if (compact !== st.compact) {
      st.compact = compact;
      layer.classList.toggle('is-compact', compact);
      st.sizes = registry.els.map((el) => ({ w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 }));
    }

    // Emphasis classes for hovered / selected sectors.
    const emphasis = `${app.hoveredSector ?? ''}|${app.selectedSector ?? ''}`;
    if (emphasis !== st.emphasis) {
      st.emphasis = emphasis;
      registry.els.forEach((el, i) => {
        const code = models[i]!.code;
        el?.classList.toggle('is-hovered', code === app.hoveredSector);
      });
    }

    // Project every anchor.
    const visibleSlots: Slot[] = [];
    for (const slot of slots) {
      const m = models[slot.i]!;
      v.copy(m.anchor).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -1) continue; // behind the camera
      const dist = -v.z;
      v.applyMatrix4(camera.projectionMatrix);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      if (x < -40 || x > size.width + 40 || y < -20 || y > size.height + 40) continue;
      slot.x = x;
      slot.y = y;
      slot.dist = dist;
      slot.priority = m.code === app.hoveredSector ? Number.POSITIVE_INFINITY : m.rank;
      visibleSlots.push(slot);
    }
    visibleSlots.sort(
      (a, b) =>
        b.priority - a.priority || a.dist - b.dist || (models[a.i]!.code < models[b.i]!.code ? -1 : 1),
    );

    // Greedy placement: try the anchor, then one chip height above / below;
    // keep the first position whose box doesn't overlap a kept one.
    placed.length = 0;
    const keep = new Set<number>();
    const pad = compact ? 1 : 2;
    for (const slot of visibleSlots) {
      const sz = st.sizes[slot.i] ?? { w: 80, h: 20 };
      const step = sz.h + 2 * pad;
      for (const dy of NUDGES) {
        const y = slot.y + dy * step;
        const box = { x0: slot.x - sz.w / 2 - pad, x1: slot.x + sz.w / 2 + pad, y0: y - sz.h - pad, y1: y + pad };
        let free = true;
        for (const p of placed) {
          if (box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0) {
            free = false;
            break;
          }
        }
        if (!free) continue;
        placed.push(box);
        keep.add(slot.i);
        slot.dy = dy * step;
        break;
      }
    }

    // Write to the DOM only what changed.
    for (let i = 0; i < models.length; i++) {
      const el = registry.els[i];
      if (!el) continue;
      const show = keep.has(i);
      if (show !== st.shown[i]) {
        st.shown[i] = show;
        el.classList.toggle('is-visible', show);
      }
      if (!show) continue;
      const slot = slots[i]!;
      const y = slot.y + slot.dy;
      const prev = st.pos[i];
      if (!prev || Math.abs(prev.x - slot.x) > 0.25 || Math.abs(prev.y - y) > 0.25) {
        st.pos[i] = { x: slot.x, y };
        el.style.transform = `translate3d(${slot.x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }
  });

  return null;
}
