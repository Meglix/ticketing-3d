import { UnknownVenueError } from '../venue/currentVenue.ts';
import { StadiumMark } from './icons.tsx';
import { strings } from './strings.ts';
import './ui.css';

/** Shown instead of the scene when the venue config fails validation (fail fast, visibly). */
export function ConfigError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const unknown = error instanceof UnknownVenueError;
  return (
    <main className="ui-config-error" role="alert">
      <div className="ui-config-error__card">
        <StadiumMark size={40} className="ui-config-error__mark" />
        <h1>{unknown ? strings.unknownVenueTitle : strings.configErrorTitle}</h1>
        <p>{unknown ? strings.unknownVenueBody : strings.configErrorBody}</p>
        <pre>{message}</pre>
      </div>
    </main>
  );
}
