import { useEffect, useState } from 'react';
import { useAppState } from '../state/store.ts';
import { StadiumMark } from './icons.tsx';
import { strings } from './strings.ts';

const FADE_MS = 600;
const SLOW_MS = 12000;

/** Full-screen loader until the 3D scene has drawn its first frame; fades out, then unmounts. */
export function Loader() {
  const ready = useAppState((s) => s.sceneReady);
  const [gone, setGone] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (ready) {
      const t = window.setTimeout(() => setGone(true), FADE_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  return (
    <div className={`ui-loader${ready ? ' is-done' : ''}`} role="status" aria-live="polite" aria-busy={!ready}>
      <div className="ui-loader__inner">
        <StadiumMark className="ui-loader__mark" size={64} />
        <p className="ui-loader__text">{strings.loading}</p>
        <div className="ui-loader__bar" aria-hidden>
          <span />
        </div>
        {slow && !ready && <p className="ui-loader__slow">{strings.loadingSlow}</p>}
      </div>
    </div>
  );
}
