import { actions, appStore, viewDepth } from './store.ts';

/**
 * Browser history for the three levels (overview → sector → seat), so the
 * phone's back gesture (or the browser's back button) goes up one level
 * instead of leaving the demo.
 *
 * - Going one level deeper pushes one history entry (moving between sectors
 *   or seats at the same level pushes nothing).
 * - Back (popstate) → actions.back(): seat → sector → overview.
 * - Going up through the UI consumes the matching entries with history.go(-n),
 *   so the next system back behaves as expected.
 */
const MARK = 'cluj-demo-depth';

export function installHistorySync(): () => void {
  let prevDepth = viewDepth(appStore.get().view);
  let fromPop = false;
  /** Popstate events caused by our own history.go() (one per call) are not user "back"s. */
  let ownPops = 0;

  const unsubscribe = appStore.subscribe(() => {
    const depth = viewDepth(appStore.get().view);
    if (depth === prevDepth) return;
    if (depth > prevDepth) {
      for (let d = prevDepth + 1; d <= depth; d++) history.pushState({ [MARK]: d }, '');
    } else if (!fromPop) {
      const current = Number((history.state as Record<string, unknown> | null)?.[MARK] ?? 0);
      const steps = Math.min(current, prevDepth - depth);
      if (steps > 0) {
        ownPops++;
        history.go(-steps);
      }
    }
    prevDepth = depth;
  });

  const onPop = () => {
    if (ownPops > 0) {
      ownPops--;
      return;
    }
    if (appStore.get().view === 'overview') return;
    fromPop = true;
    actions.back();
    fromPop = false;
  };
  window.addEventListener('popstate', onPop);

  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPop);
  };
}
