import { StadiumMark } from './icons.tsx';
import { strings } from './strings.ts';
import './ui.css';

/** Shown instead of the scene when the venue config fails validation (fail fast, visibly). */
export function ConfigError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main className="ui-config-error" role="alert">
      <div className="ui-config-error__card">
        <StadiumMark size={40} className="ui-config-error__mark" />
        <h1>{strings.configErrorTitle}</h1>
        <p>{strings.configErrorBody}</p>
        <pre>{message}</pre>
      </div>
    </main>
  );
}
