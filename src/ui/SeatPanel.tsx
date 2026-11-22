import { useMemo } from 'react';
import { actions, useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { DotList } from './DotList.tsx';
import { categoryNote, priceText, seatSummary } from './format.ts';
import { ArrowLeft, DragIcon, TicketIcon, WheelchairIcon } from './icons.tsx';
import { strings } from './strings.ts';

/**
 * Seat view (level 3): a slim glass bar at the bottom —
 * "Tribuna I · Sector 1C · Rând 8 · Loc 6 · 50 lei", a gold "Cumpără" and the
 * way back to the sector. Kept small so the view stays the hero.
 */
export function SeatPanel({ venue }: { venue: Venue }) {
  const seatId = useAppState((s) => (s.view === 'seat' && !s.inTransit ? s.seatId : null));
  const summary = useMemo(() => (seatId ? seatSummary(venue, seatId) : null), [venue, seatId]);
  if (!summary) return null;

  const forSale = summary.price !== null;
  const note = categoryNote(summary.category);

  return (
    <section className="ui-seatbar" aria-label={strings.panelLabel} key={summary.seatId}>
      <div className="ui-seatbar__info">
        <DotList
          className="ui-seatbar__line"
          items={[
            <>
              <span className="ui-seatbar__dot" style={{ background: summary.tierColor }} aria-hidden />
              {summary.standName}
            </>,
            <>
              {strings.fieldSector} <strong>{summary.code}</strong>
            </>,
            <>
              {strings.fieldRow} <strong>{summary.row}</strong>
            </>,
            <>
              {strings.fieldSeat} <strong>{summary.seat}</strong>
            </>,
            <strong className="ui-seatbar__price">{priceText(summary.price, summary.category)}</strong>,
          ]}
        />
        <DotList
          className="ui-seatbar__sub"
          items={[
            summary.ringName,
            note && (
              <>
                {summary.category === 'accessible' && <WheelchairIcon size={13} />} {note}
              </>
            ),
            summary.estimated && strings.estimatedNote,
          ]}
          trailing={
            <span className="ui-seatbar__drag">
              <DragIcon size={13} /> {strings.dragHint}
            </span>
          }
        />
      </div>
      <div className="ui-seatbar__actions">
        <button type="button" className="ui-btn ui-btn--gold" disabled={!forSale} onClick={() => actions.openCheckout()}>
          <TicketIcon />
          {strings.buy}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => actions.back()}>
          <ArrowLeft />
          {strings.otherSeat}
        </button>
      </div>
    </section>
  );
}
