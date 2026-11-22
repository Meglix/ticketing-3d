import { useSyncExternalStore } from 'react';

/**
 * The single source of UI/camera state. A deliberately tiny store:
 * - React components subscribe with `useAppState(selector)`.
 * - The camera loop (useFrame) reads `appStore.get()` without re-rendering.
 * All state changes go through the actions below, so the rules for
 * "what happens on a tap" live in one place.
 */

/**
 * The three levels of the V2 flow:
 *   overview ──tap sector──► sector (3/4 "focus" view, seats tappable) ──tap seat──► seat (first person)
 * and back one level at a time.
 */
export type View = 'overview' | 'sector' | 'seat';

/** Depth of a view in the flow (used by browser history). */
export const viewDepth = (v: View): number => (v === 'overview' ? 0 : v === 'sector' ? 1 : 2);

export interface AppState {
  /** Where the camera is, or is flying to. */
  view: View;
  /** True while the camera tween runs. */
  inTransit: boolean;
  /** Sector code under the pointer (desktop hover). */
  hoveredSector: string | null;
  /** Sector being focused (null in the overview). */
  selectedSector: string | null;
  /** The chosen seat (gold): the camera sits on it in the seat view; kept when going back to the sector. */
  seatId: string | null;
  /** Seat id under the pointer in the sector focus (desktop hover). */
  hoveredSeat: string | null;
  checkoutOpen: boolean;
  /** True once the 3D scene has rendered its first frame (the UI shows a loader until then). */
  sceneReady: boolean;
  /** Set when 3D cannot run: no WebGL, the GPU context was lost, or the scene crashed. */
  sceneFailure: SceneFailure | null;
}

export type SceneFailure = 'no-webgl' | 'context-lost' | 'crash';

const initialState: AppState = {
  view: 'overview',
  inTransit: false,
  hoveredSector: null,
  selectedSector: null,
  seatId: null,
  hoveredSeat: null,
  checkoutOpen: false,
  sceneReady: false,
  sceneFailure: null,
};

type Listener = () => void;

let state: AppState = initialState;
const listeners = new Set<Listener>();

function set(patch: Partial<AppState>): void {
  const next = { ...state, ...patch };
  // Skip no-op updates so subscribers don't re-render for nothing.
  const changed = (Object.keys(patch) as (keyof AppState)[]).some((k) => next[k] !== state[k]);
  if (!changed) return;
  state = next;
  listeners.forEach((l) => l());
}

export const appStore = {
  get: (): AppState => state,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Test helper: back to the initial state. */
  reset(): void {
    state = initialState;
    listeners.forEach((l) => l());
  },
};

export const actions = {
  hoverSector(code: string | null): void {
    set({ hoveredSector: code });
  },

  hoverSeat(seatId: string | null): void {
    set({ hoveredSeat: seatId });
  },

  /**
   * Fly to the 3/4 focus view of sector `code`. Safe at any time, including
   * mid-flight: the camera rig re-targets from wherever the camera currently
   * is. Coming back up from that sector's seat keeps the chosen (gold) seat.
   */
  focusSector(code: string): void {
    const keepSeat = state.selectedSector === code ? state.seatId : null;
    set({
      view: 'sector',
      selectedSector: code,
      seatId: keepSeat,
      hoveredSeat: null,
      inTransit: true,
      checkoutOpen: false,
    });
  },

  /** Choose a seat (it turns gold) and fly into it: first-person seat view. */
  selectSeat(code: string, seatId: string): void {
    set({
      view: 'seat',
      selectedSector: code,
      seatId,
      hoveredSeat: null,
      hoveredSector: null,
      inTransit: true,
      checkoutOpen: false,
    });
  },

  /** One level up: seat → sector focus → overview. */
  back(): void {
    if (state.view === 'seat' && state.selectedSector) actions.focusSector(state.selectedSector);
    else if (state.view !== 'overview') actions.goToOverview();
  },

  goToOverview(): void {
    set({
      view: 'overview',
      selectedSector: null,
      seatId: null,
      hoveredSeat: null,
      inTransit: true,
      checkoutOpen: false,
    });
  },

  /** Called by the camera rig when a tween finishes. */
  arrive(): void {
    set({ inTransit: false });
  },

  openCheckout(): void {
    // Only meaningful once the camera sits on a seat.
    if (state.view !== 'seat' || state.seatId === null) return;
    set({ checkoutOpen: true });
  },

  closeCheckout(): void {
    set({ checkoutOpen: false });
  },

  markSceneReady(): void {
    set({ sceneReady: true });
  },

  /** The 3D scene cannot continue; the app swaps in a Romanian fallback screen. */
  failScene(reason: SceneFailure): void {
    if (state.sceneFailure === null) set({ sceneFailure: reason });
  },
};

/** Subscribe a component to a slice of the state. Keep selectors cheap and return primitives. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => selector(state), () => selector(initialState));
}
