import { useAppState } from '../state/store.ts';
import { TapIcon } from './icons.tsx';
import { strings } from './strings.ts';
import { useMediaQuery } from './useMediaQuery.ts';

/** "Tap a sector…" in the overview; the wording follows the input device. */
export function OverviewHint() {
  const show = useAppState((s) => s.view === 'overview' && !s.inTransit && s.sceneReady && !s.introPlaying);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  if (!show) return null;
  return (
    <p className="ui-hint ui-pill" role="status">
      <TapIcon size={16} />
      <span>{canHover ? strings.hintMouse : strings.hintTouch}</span>
    </p>
  );
}

/** Small status while the camera flies to a sector or into a seat. */
export function TransitStatus() {
  const target = useAppState((s) => (s.inTransit && s.view !== 'overview' ? s.view : null));
  if (!target) return null;
  return (
    <p className="ui-transit ui-pill" role="status" aria-live="polite">
      <span className="ui-spinner" aria-hidden />
      <span>{target === 'seat' ? strings.inTransit : strings.inTransitSector}</span>
    </p>
  );
}
