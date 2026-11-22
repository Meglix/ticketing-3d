import { useEffect, useState } from 'react';

/**
 * On-screen frame-rate meter, shown only with `?fps` in the URL.
 * Counts requestAnimationFrame callbacks: R3F renders once per animation
 * frame, so this is the scene's real frame rate on the device in front of you
 * (use it on the demo laptop/phone; headless CI uses software WebGL).
 */
export function FpsMeter() {
  const [text, setText] = useState('… fps');
  useEffect(() => {
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    let windowStart = last;
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - windowStart >= 1000) {
        const fps = (frames * 1000) / (now - windowStart);
        setText(`${fps.toFixed(0)} fps · max ${worst.toFixed(0)} ms`);
        frames = 0;
        worst = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        top: 8,
        zIndex: 1000,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.65)',
        color: '#7CFC9A',
        font: '600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
        pointerEvents: 'none',
      }}
      data-testid="fps-meter"
    >
      {text}
    </div>
  );
}

export const showFps = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fps');
