import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { formatLei, sectorSummary } from './format.ts';
import { WheelchairIcon } from './icons.tsx';
import { strings } from './strings.ts';
import { useMediaQuery } from './useMediaQuery.ts';

const OFFSET = 18;
const MARGIN = 8;

/**
 * Desktop-only tooltip for the sector under the mouse. It follows the pointer
 * by writing a transform directly (no React re-render per mouse move).
 */
export function HoverCard({ venue }: { venue: Venue }) {
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const code = useAppState((s) => (s.view === 'overview' && !s.inTransit ? s.hoveredSector : null));
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: -9999, y: -9999 });

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = pointer.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + w > window.innerWidth - MARGIN) left = x - OFFSET - w;
    if (top + h > window.innerHeight - MARGIN) top = y - OFFSET - h;
    el.style.transform = `translate(${Math.max(MARGIN, left)}px, ${Math.max(MARGIN, top)}px)`;
  };

  useEffect(() => {
    if (!canHover) return;
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      place();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [canHover]);

  useLayoutEffect(place, [code]);

  const summary = useMemo(() => (code ? sectorSummary(venue, code) : null), [venue, code]);
  if (!canHover || !summary) return null;

  return (
    <div ref={ref} className="ui-hovercard ui-panel" role="tooltip">
      <div className="ui-hovercard__head">
        <span className="ui-swatch" style={{ background: summary.tierColor }} aria-hidden />
        <strong>Sector {summary.code}</strong>
      </div>
      <p className="ui-hovercard__where">
        {summary.standName} · {summary.ringName}
      </p>
      <p className="ui-hovercard__price">
        {summary.price === null ? strings.pressNotForSale : strings.fromPrice(formatLei(summary.price))}
      </p>
      {summary.category === 'accessible' && (
        <p className="ui-hovercard__note">
          <WheelchairIcon size={14} /> {strings.accessibleNote}
        </p>
      )}
    </div>
  );
}
