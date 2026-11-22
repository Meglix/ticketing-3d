import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { actions, useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import {
  adjacentSeats,
  checkoutTotal,
  clampQuantity,
  demoEventDate,
  demoReference,
  formatEventDate,
  formatLei,
  MAX_TICKETS,
  seatSummary,
  type SeatSummary,
} from './format.ts';
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from './icons.tsx';
import { strings } from './strings.ts';

/**
 * The clearly fake checkout. It never asks for payment or personal data;
 * "confirming" only flips to a success screen with a DEMO reference.
 */
export function CheckoutModal({ venue }: { venue: Venue }) {
  const open = useAppState((s) => s.checkoutOpen);
  const seatId = useAppState((s) => s.seatId);
  const summary = useMemo(() => (open && seatId ? seatSummary(venue, seatId) : null), [open, seatId, venue]);
  if (!summary || summary.price === null) return null;
  // Keyed by seat so quantity/success state starts fresh for every opening.
  return <CheckoutDialog key={summary.seatId} venue={venue} summary={summary} price={summary.price} />;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function CheckoutDialog({ venue, summary, price }: { venue: Venue; summary: SeatSummary; price: number }) {
  const [quantity, setQuantity] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const eventDate = useMemo(() => formatEventDate(demoEventDate(new Date())), []);
  const seats = adjacentSeats(summary.seat, quantity, summary.seatsInRow);
  const maxQuantity = Math.min(MAX_TICKETS, summary.seatsInRow);
  const total = checkoutTotal(price, quantity);

  // Focus the dialog on open, give focus back to whatever opened it on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actions.closeCheckout();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // After confirming, move focus to the success screen's button.
  useEffect(() => {
    if (confirmed) dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [confirmed]);

  // Keep Tab inside the dialog.
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="ui-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) actions.closeCheckout();
      }}
    >
      <div
        ref={dialogRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <div className="ui-modal__banner" id={descId}>
          <strong>{strings.checkoutDemoBanner}</strong>
          <span>{strings.checkoutDemoExplain}</span>
        </div>

        <button type="button" className="ui-modal__close" aria-label={strings.closeDialog} onClick={() => actions.closeCheckout()}>
          <CloseIcon />
        </button>

        {!confirmed ? (
          <>
            <h2 className="ui-modal__title" id={titleId}>
              {strings.checkoutTitle}
            </h2>

            <section className="ui-modal__block">
              <p className="ui-modal__eyebrow">{strings.eventLabel}</p>
              <p className="ui-modal__strong">{strings.eventName}</p>
              <p className="ui-modal__muted">{eventDate}</p>
              <p className="ui-modal__muted">
                {venue.config.name}, {venue.config.city}
              </p>
            </section>

            <section className="ui-modal__block ui-modal__seat">
              <span className="ui-swatch ui-swatch--lg" style={{ background: summary.tierColor }} aria-hidden />
              <div>
                <p className="ui-modal__strong">
                  {summary.standName} · Sector {summary.code}
                </p>
                <p className="ui-modal__muted">{summary.ringName}</p>
                <p className="ui-modal__muted">{strings.seatsFrom(summary.row, seats.first, seats.last)}</p>
              </div>
            </section>

            <section className="ui-modal__block ui-modal__qty">
              <div>
                <p className="ui-modal__strong">{strings.quantity}</p>
                <p className="ui-modal__muted">{strings.quantityHint}</p>
              </div>
              <div className="ui-stepper">
                <button
                  type="button"
                  className="ui-stepper__btn"
                  aria-label={strings.decrease}
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => clampQuantity(q - 1))}
                >
                  <MinusIcon />
                </button>
                <output className="ui-stepper__value" aria-live="polite">
                  {quantity}
                </output>
                <button
                  type="button"
                  className="ui-stepper__btn"
                  aria-label={strings.increase}
                  disabled={quantity >= maxQuantity}
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, clampQuantity(q + 1)))}
                >
                  <PlusIcon />
                </button>
              </div>
            </section>

            <div className="ui-modal__total">
              <span>
                {strings.total}
                <span className="ui-modal__muted">
                  {' '}
                  ({quantity} × {formatLei(price)})
                </span>
              </span>
              <strong>{formatLei(total)}</strong>
            </div>

            <div className="ui-modal__actions">
              <button type="button" className="ui-btn ui-btn--primary" onClick={() => setConfirmed(true)}>
                {strings.confirm}
              </button>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => actions.closeCheckout()}>
                {strings.cancel}
              </button>
            </div>
          </>
        ) : (
          <div className="ui-modal__success">
            <span className="ui-modal__check" aria-hidden>
              <CheckIcon />
            </span>
            <h2 className="ui-modal__title" id={titleId}>
              {strings.successTitle}
            </h2>
            <p className="ui-modal__muted" role="status">
              {strings.successBody}
            </p>
            <dl className="ui-modal__receipt">
              <div>
                <dt>{strings.reference}</dt>
                <dd>{demoReference(summary.seatId, quantity)}</dd>
              </div>
              <div>
                <dt>{strings.fieldSector}</dt>
                <dd>
                  {summary.standName} · {summary.code}
                </dd>
              </div>
              <div>
                <dt>{strings.fieldSeat}</dt>
                <dd>{strings.seatsFrom(summary.row, seats.first, seats.last)}</dd>
              </div>
              <div>
                <dt>{strings.total}</dt>
                <dd>{formatLei(total)}</dd>
              </div>
            </dl>
            <button type="button" className="ui-btn ui-btn--primary" data-autofocus onClick={() => actions.closeCheckout()}>
              {strings.close}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
