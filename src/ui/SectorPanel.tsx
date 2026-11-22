import { useMemo } from 'react';
import { availabilityFor, availableIn } from '../demo/availability.ts';
import { actions, useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { formatLei, sectorSummary } from './format.ts';
import { ArrowLeft } from './icons.tsx';
import { strings } from './strings.ts';
import { useMediaQuery } from './useMediaQuery.ts';

/**
 * Sector focus (level 2): which sector this is, how many seats are free and
 * from what price, the seat-state legend, and the way back to all sectors.
 * Availability is the demo data (src/demo/availability.ts).
 */
export function SectorPanel({ venue }: { venue: Venue }) {
  const code = useAppState((s) => (s.view === 'sector' && !s.inTransit ? s.selectedSector : null));
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const data = useMemo(() => {
    if (!code) return null;
    const summary = sectorSummary(venue, code);
    const info = venue.sectorByCode.get(code);
    if (!summary || !info) return null;
    const free = availableIn(info, availabilityFor(venue.manifest));
    return { summary, free, total: info.seatEnd - info.seatStart };
  }, [venue, code]);
  if (!data) return null;
  const { summary, free, total } = data;
  const press = summary.price === null;

  return (
    <section className="ui-sectorbar" aria-label={strings.sectorPanelLabel} key={summary.code}>
      <div className="ui-sectorbar__info">
        <p className="ui-seatbar__line">
          <span className="ui-seatbar__dot" style={{ background: summary.tierColor }} aria-hidden />
          <span>{summary.standName}</span>
          <span className="ui-sep" aria-hidden>·</span>
          <span>
            {strings.fieldSector} <strong>{summary.code}</strong>
          </span>
          {!press && (
            <>
              <span className="ui-sep" aria-hidden>·</span>
              <strong className="ui-seatbar__price">{strings.fromPrice(formatLei(summary.price!))}</strong>
            </>
          )}
        </p>
        <p className="ui-seatbar__sub">
          {summary.ringName}
          <span className="ui-sep" aria-hidden>·</span>
          {press ? strings.pressSector : free > 0 ? strings.freeOf(free, total) : strings.noneFree}
          {!press && free > 0 && (
            <>
              <span className="ui-sep" aria-hidden>·</span>
              <span className="ui-sectorbar__cta">{canHover ? strings.pickSeatMouse : strings.pickSeatTouch}</span>
            </>
          )}
        </p>
        <ul className="ui-states" aria-hidden>
          <li>
            <span className="ui-state" style={{ background: summary.tierColor }} /> {strings.stateFree}
          </li>
          <li>
            <span className="ui-state ui-state--sold" /> {strings.stateSold}
          </li>
          <li>
            <span className="ui-state ui-state--gold" /> {strings.stateYours}
          </li>
        </ul>
      </div>
      <div className="ui-seatbar__actions">
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => actions.goToOverview()}>
          <ArrowLeft />
          {strings.allSectors}
        </button>
      </div>
    </section>
  );
}
