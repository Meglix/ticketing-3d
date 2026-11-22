/** LANE D STUB — replaced by the UI lane. Shown instead of the scene when the venue config is invalid. */
export function ConfigError({ error }: { error: unknown }) {
  return <pre style={{ whiteSpace: 'pre-wrap', padding: 16 }}>{String(error instanceof Error ? error.message : error)}</pre>;
}
