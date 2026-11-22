import type { Venue } from '../venue/loadVenue.ts';
import { CheckoutModal } from './CheckoutModal.tsx';
import { Header } from './Header.tsx';
import { HoverCard } from './HoverCard.tsx';
import { Legend } from './Legend.tsx';
import { Loader } from './Loader.tsx';
import { SeatPanel } from './SeatPanel.tsx';
import { OverviewHint, TransitStatus } from './StatusHints.tsx';
import './ui.css';

/**
 * The Romanian DOM overlay above the 3D canvas. The root ignores pointer
 * events (taps and drags reach the canvas); only panels and buttons take them.
 * Each part subscribes to just the store slice it needs.
 */
export function Overlay({ venue }: { venue: Venue }) {
  return (
    <div className="ui-overlay">
      <Header venue={venue} />
      {/* Phone: hint stacked above the legend bar. Desktop: `display: contents`, each placed on its own. */}
      <div className="ui-bottom">
        <OverviewHint />
        <Legend venue={venue} />
      </div>
      <TransitStatus />
      <HoverCard venue={venue} />
      <SeatPanel venue={venue} />
      <CheckoutModal venue={venue} />
      <Loader />
    </div>
  );
}
