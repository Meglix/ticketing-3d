import { actions, appStore } from './store.ts';

/**
 * Browser history for the seat view, so the phone's back gesture (or the
 * browser's back button) returns to the overview instead of leaving the demo.
 *
 * - Entering the seat view from the overview pushes one history entry.
 *   Moving between seats replaces nothing, so it is still one "back" to the overview.
 * - Back (popstate) while in the seat view → goToOverview().
 * - Leaving the seat view through the UI consumes that entry with
 *   history.back(), so the next system back leaves the page as expected.
 */
const MARK = 'cluj-demo-seat';

export function installHistorySync(): () => void {
  let prevView = appStore.get().view;
  let fromPop = false;

  const unsubscribe = appStore.subscribe(() => {
    const { view } = appStore.get();
    if (view === prevView) return;
    if (view === 'seat') {
      history.pushState({ [MARK]: true }, '');
    } else if (!fromPop && (history.state as Record<string, unknown> | null)?.[MARK]) {
      history.back();
    }
    prevView = view;
  });

  const onPop = () => {
    if (appStore.get().view !== 'seat') return;
    fromPop = true;
    actions.goToOverview();
    fromPop = false;
  };
  window.addEventListener('popstate', onPop);

  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPop);
  };
}
