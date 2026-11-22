import { useState } from 'react';
import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { ChevronDown } from './icons.tsx';
import { strings } from './strings.ts';
import { useMediaQuery } from './useMediaQuery.ts';

/**
 * "Prețuri demo": one swatch per price tier. Open by default on wide screens,
 * collapsed to a pill on phones so it doesn't cover the stadium. Only shown in
 * the overview (in the seat view the seat panel carries the price).
 */
export function Legend({ venue }: { venue: Venue }) {
  const inOverview = useAppState((s) => s.view === 'overview');
  const wide = useMediaQuery('(min-width: 768px)');
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const expanded = userChoice ?? wide;
  if (!inOverview) return null;

  const tiers = venue.config.priceTiers;
  return (
    <aside className={`ui-legend ui-panel${expanded ? ' is-open' : ''}`} aria-label={strings.legendTitle}>
      <button
        type="button"
        className="ui-legend__toggle"
        aria-expanded={expanded}
        aria-controls="ui-legend-list"
        title={expanded ? strings.legendToggleHide : strings.legendToggleShow}
        onClick={() => setUserChoice(!expanded)}
      >
        <span className="ui-legend__title">{strings.legendTitle}</span>
        {!expanded && (
          <span className="ui-legend__mini" aria-hidden>
            {tiers.map((t) => (
              <span key={t.id} className="ui-swatch ui-swatch--mini" style={{ background: t.color }} />
            ))}
          </span>
        )}
        <ChevronDown className="ui-legend__chevron" />
      </button>
      {expanded && (
        <div id="ui-legend-list" className="ui-legend__body">
          <ul className="ui-legend__list">
            {tiers.map((t) => (
              <li key={t.id} className="ui-legend__item">
                <span className="ui-swatch" style={{ background: t.color }} aria-hidden />
                <span>{t.price === null ? strings.pressNotForSale : t.label}</span>
              </li>
            ))}
          </ul>
          <p className="ui-legend__note">{strings.legendNote}</p>
        </div>
      )}
    </aside>
  );
}
