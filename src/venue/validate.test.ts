/**
 * Invalid configs must fail fast with a message that says what and where.
 * Each case starts from the real Cluj Arena config and breaks one thing.
 */
import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { loadVenue } from './loadVenue.ts';
import type { VenueConfig } from './schema.ts';
import { parseVenueConfig, VenueConfigError } from './validate.ts';

const clone = (): VenueConfig => structuredClone(raw) as VenueConfig;
const firstSector = (c: VenueConfig) => c.stands[0]!.rings[0]!.sectors[0]!;

function expectInvalid(config: unknown, pattern: RegExp): void {
  let error: unknown;
  try {
    parseVenueConfig(config);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(VenueConfigError);
  expect((error as Error).message).toMatch(pattern);
}

describe('venue config validation', () => {
  it('accepts the shipped Cluj Arena config', () => {
    expect(() => loadVenue(raw)).not.toThrow();
  });

  it('rejects wrong types with the JSON path', () => {
    const c = clone() as unknown as { stands: { rings: { sectors: { rows: { seats: unknown }[] }[] }[] }[] };
    c.stands[0]!.rings[0]!.sectors[0]!.rows[2]!.seats = '27';
    expectInvalid(c, /stands\[0\]\.rings\[0\]\.sectors\[0\] \(1A1\)\.rows\[2\]\.seats/);
  });

  it('rejects unknown keys (typos are not silently ignored)', () => {
    const c = clone() as unknown as Record<string, unknown>;
    c.seatWidht = 0.5;
    expectInvalid(c, /seatWidht|Unrecognized key/);
  });

  it('rejects a missing required field', () => {
    const c = clone() as unknown as Record<string, unknown>;
    delete c.pitch;
    expectInvalid(c, /pitch/);
  });

  it('rejects an unknown template (extension point is explicit)', () => {
    const c = clone() as unknown as { layout: { template: string } };
    c.layout.template = 'horseshoe';
    expectInvalid(c, /layout/);
  });

  it('rejects an unknown price tier', () => {
    const c = clone();
    firstSector(c).tier = 'p999';
    expectInvalid(c, /sector 1A1 .*unknown price tier "p999"/);
  });

  it('rejects duplicate sector codes', () => {
    const c = clone();
    c.stands[0]!.rings[0]!.sectors[1]!.code = '1A1';
    expectInvalid(c, /duplicate sector code/);
  });

  it('rejects rows whose seats do not fit and says how many would', () => {
    const c = clone();
    firstSector(c).rows[0]!.seats += 40;
    expectInvalid(c, /sector 1A1 .* row 1: \d+ seats × 0\.5 m do not fit.*holds at most \d+/);
  });

  it('rejects a rake that contradicts the row elevations', () => {
    const c = clone();
    firstSector(c).rows[3]!.rakeDeg = 5;
    expectInvalid(c, /row 4: rakeDeg 5° disagrees with the slope/);
  });

  it('rejects rows that do not move back / up', () => {
    const c = clone();
    const rows = firstSector(c).rows;
    rows[5]!.distance = rows[4]!.distance;
    expectInvalid(c, /distance must increase/);
  });

  it('rejects a span with to ≤ from', () => {
    const c = clone();
    const s = firstSector(c);
    s.span = { from: s.span.to, to: s.span.from };
    expectInvalid(c, /span\.to .* must be greater than span\.from/);
  });

  it('rejects overlapping sectors', () => {
    const c = clone();
    const sectors = c.stands[0]!.rings[0]!.sectors;
    sectors[1]!.span.from -= 10; // 1A2 now starts inside 1A1
    expectInvalid(c, /sector 1A1 .* overlaps sector 1A2/);
  });

  it('rejects a capacity that the rows do not add up to', () => {
    const c = clone();
    c.capacity.total = 30000;
    expectInvalid(c, /capacity\.total is 30000 but the rows add up to 30335/);
  });

  it('rejects a corner radius larger than the bowl', () => {
    const c = clone();
    c.layout.referenceLine.cornerRadius = 60;
    expectInvalid(c, /cornerRadius/);
  });

  it('rejects a track that does not fit inside the bowl', () => {
    const c = clone();
    c.track!.straightLength = 120;
    expectInvalid(c, /track: its outer edge reaches outside/);
  });

  it('reports several problems at once', () => {
    const c = clone();
    firstSector(c).tier = 'nope';
    c.capacity.press = 1;
    try {
      parseVenueConfig(c);
      expect.unreachable();
    } catch (e) {
      expect((e as VenueConfigError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('names the sector in shape-error paths', () => {
    const c = clone() as unknown as { stands: { rings: { sectors: { rows: { seats: unknown }[] }[] }[] }[] };
    c.stands[0]!.rings[1]!.sectors[2]!.rows[0]!.seats = 'many';
    expectInvalid(c, /sectors\[2\] \(2B\)\.rows\[0\]\.seats/);
  });

  it('rejects rows placed on the field of play', () => {
    const c = clone();
    const pd = c.stands.flatMap((s) => s.rings).flatMap((r) => r.sectors).find((s) => s.code === 'PD')!;
    pd.rows[0]!.distance = -15;
    expectInvalid(c, /sector PD .* row 1: distance -15 m puts it on the field of play/);
  });

  it('rejects roof segments that overlap or exceed one lap', () => {
    const c = clone();
    c.roof!.segments.push({ ...c.roof!.segments[0]! });
    expectInvalid(c, /roof\.segments\[0\] overlaps roof\.segments\[4\]/);
    const d = clone();
    d.roof!.segments = [{ from: 0, to: 900 }];
    expectInvalid(d, /roof\.segments\[0\]: longer than the whole reference line/);
  });

  it('bounds the eye height and the floodlight count', () => {
    const c = clone();
    c.eyeHeight = 50;
    expectInvalid(c, /eyeHeight: must be between 0\.8 and 2 m/);
    const d = clone();
    d.floodlights.count = 5_000_000;
    expectInvalid(d, /floodlights\.count/);
  });
});
