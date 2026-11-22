/**
 * Helpers shared by the venue authoring scripts. They turn a few estimated
 * parameters (row profile, capacity target) into the explicit per-row data
 * the venue JSON stores.
 */
import type { RowConfig } from '../src/venue/schema.ts';

export const round = (v: number, digits = 3): number => Number(v.toFixed(digits));

export type RowDraft = Omit<RowConfig, 'seats'>;

/**
 * Rows of a ring with a convex profile: risers grow linearly from
 * `riserFront` to `riserBack`; rakeDeg is the slope to the next row.
 */
export function profile(
  count: number,
  firstDistance: number,
  firstElevation: number,
  riserFront: number,
  riserBack: number,
  depth = 0.8,
): RowDraft[] {
  const risers = Array.from(
    { length: count - 1 },
    (_, j) => riserFront + ((riserBack - riserFront) * j) / Math.max(1, count - 2),
  );
  const rows: RowDraft[] = [];
  let elevation = firstElevation;
  for (let i = 0; i < count; i++) {
    const riser = risers[Math.min(i, risers.length - 1)] ?? 0;
    rows.push({
      row: i + 1,
      distance: round(firstDistance + i * depth),
      elevation: round(elevation),
      rakeDeg: count > 1 ? round((Math.atan2(riser, depth) * 180) / Math.PI, 1) : 0,
    });
    elevation += risers[i] ?? 0;
  }
  return rows;
}

/** Integer counts n_i ≤ max_i with Σ n_i = target, proportional to max_i (largest remainders first). */
export function fitCounts(maxes: number[], target: number): number[] {
  const sum = maxes.reduce((a, b) => a + b, 0);
  if (sum < target) throw new Error(`only ${sum} seats fit, need ${target}`);
  const f = target / sum;
  const counts = maxes.map((m) => Math.floor(m * f));
  let deficit = target - counts.reduce((a, b) => a + b, 0);
  const order = maxes
    .map((m, i) => ({ i, rem: m * f - Math.floor(m * f) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (deficit === 0) break;
    if (counts[i]! < maxes[i]!) {
      counts[i]!++;
      deficit--;
    }
  }
  if (deficit !== 0) throw new Error('could not distribute seats');
  return counts;
}

/** JSON with one line per row / span / tier, so venue files stay reviewable in diffs. */
export function formatVenueJson(config: unknown): string {
  return (
    JSON.stringify(config, null, 2).replace(
      /\{\n\s+("(?:row|from|x|distance|id)"[^{}[\]]*?)\n\s+\}/g,
      (_m, body: string) => `{ ${body.replace(/\n\s+/g, ' ')} }`,
    ) + '\n'
  );
}
