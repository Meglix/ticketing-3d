import { useMemo } from 'react';
import { actions, useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { categoryNote, priceText, seatSummary } from './format.ts';
import { ArrowLeft, DragIcon, InfoIcon, TicketIcon, WheelchairIcon } from './icons.tsx';
import { strings } from './strings.ts';

/**
 * Details of the seat the camera sits on, with "Cumpără" and the way back.
 * Desktop: a card in the bottom-right corner. Phone: a bottom sheet.
 */
export function SeatPanel({ venue }: { venue: Venue }) {
  const seatId = useAppState((s) => (s.view === 'seat' ? s.seatId : null));
  const summary = useMemo(() => (seatId ? seatSummary(venue, seatId) : null), [venue, seatId]);
  if (!summary) return null;

  const note = categoryNote(summary.category);
  const forSale = summary.price !== null;

  return (
    <section className="ui-seat ui-panel" aria-label={strings.panelLabel} key={summary.seatId}>
      <header className="ui-seat__head">
        <span className="ui-swatch ui-swatch--lg" style={{ background: summary.tierColor }} aria-hidden />
        <div className="ui-seat__titles">
          <h2 className="ui-seat__stand">{summary.standName}</h2>
          <p className="ui-seat__ring">
            <span className="ui-visually-hidden">{strings.fieldRing}: </span>
            {summary.ringName}
          </p>
        </div>
        {summary.estimated && (
          <span className="ui-chip" title={strings.estimatedNote}>
            <InfoIcon size={12} />
            {strings.estimatedNote}
          </span>
        )}
      </header>

      <dl className="ui-seat__grid">
        <div>
          <dt>{strings.fieldSector}</dt>
          <dd>{summary.code}</dd>
        </div>
        <div>
          <dt>{strings.fieldRow}</dt>
          <dd>{summary.row}</dd>
        </div>
        <div>
          <dt>{strings.fieldSeat}</dt>
          <dd>{summary.seat}</dd>
        </div>
      </dl>

      {note && (
        <p className={`ui-seat__note ui-seat__note--${summary.category}`}>
          {summary.category === 'accessible' ? <WheelchairIcon size={15} /> : <InfoIcon size={14} />}
          <span>{note}</span>
        </p>
      )}

      <div className="ui-seat__price">
        <span className="ui-seat__price-label">{strings.fieldPrice}</span>
        <span className={`ui-seat__price-value${forSale ? '' : ' is-muted'}`}>
          {priceText(summary.price, summary.category)}
          {forSale && <span className="ui-seat__per"> {strings.perTicket}</span>}
        </span>
      </div>

      <div className="ui-seat__actions">
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={!forSale}
          onClick={() => actions.openCheckout()}
        >
          <TicketIcon />
          {strings.buy}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => actions.goToOverview()}>
          <ArrowLeft />
          {strings.back}
        </button>
      </div>

      <p className="ui-seat__drag">
        <DragIcon size={15} />
        {strings.dragHint}
      </p>
    </section>
  );
}
