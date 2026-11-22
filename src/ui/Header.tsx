import type { Venue } from '../venue/loadVenue.ts';
import { InfoIcon, StadiumMark } from './icons.tsx';
import { strings } from './strings.ts';

/** Venue name, city, tagline and the always-visible "approximate geometry" badge. */
export function Header({ venue }: { venue: Venue }) {
  return (
    <header className="ui-header">
      <div className="ui-brand">
        <StadiumMark className="ui-brand__mark" size={34} />
        <div className="ui-brand__text">
          <h1 className="ui-brand__name">{venue.config.name}</h1>
          <p className="ui-brand__sub">
            <span>{venue.config.city}</span>
            <span className="ui-brand__dot" aria-hidden>
              ·
            </span>
            <span className="ui-brand__tagline">{strings.tagline}</span>
          </p>
        </div>
      </div>
      <p className="ui-demo-badge" role="note">
        <InfoIcon size={13} />
        <span>{strings.demoBadge}</span>
      </p>
    </header>
  );
}
