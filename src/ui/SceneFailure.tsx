import { Component, type ErrorInfo, type ReactNode } from 'react';
import { actions, type SceneFailure as Reason } from '../state/store.ts';
import { StadiumMark } from './icons.tsx';
import { strings } from './strings.ts';
import './ui.css';

/** Full-screen Romanian message shown when 3D cannot run, with a reload button. */
export function SceneFailure({ reason }: { reason: Reason }) {
  return (
    <main className="ui-config-error" role="alert">
      <div className="ui-config-error__card">
        <StadiumMark size={40} className="ui-config-error__mark" />
        <h1>{strings.sceneFailureTitle[reason]}</h1>
        <p>{strings.sceneFailureBody[reason]}</p>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => window.location.reload()}>
          {strings.reload}
        </button>
      </div>
    </main>
  );
}

/**
 * Catches anything thrown while rendering the 3D stage (e.g. the WebGL
 * context cannot be created) and reports it to the store, so the app can
 * replace the blank page with SceneFailure.
 */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('3D scene failed:', error, info.componentStack);
    actions.failScene('crash');
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** True if this browser can create a WebGL context at all. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
