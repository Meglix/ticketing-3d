import { useAppState } from '../state/store.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { strings } from './strings.ts';

/**
 * Title card during the cinematic intro: the venue name over the darkness
 * while the floodlights power on. It ignores pointer events, so a tap or
 * click lands on the canvas, which skips the intro (see CameraRig).
 */
export function IntroOverlay({ venue }: { venue: Venue }) {
  const playing = useAppState((s) => s.introPlaying && s.sceneReady);
  return (
    <div className={`ui-intro${playing ? '' : ' is-done'}`} aria-hidden={!playing}>
      <div className="ui-intro__title">
        <p className="ui-intro__name">{venue.config.name}</p>
        <p className="ui-intro__sub">{strings.introSub}</p>
      </div>
      <p className="ui-intro__skip">{strings.introSkip}</p>
    </div>
  );
}
