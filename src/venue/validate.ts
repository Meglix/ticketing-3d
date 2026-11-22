import { makeReferenceCurve, signedDistance, type ReferenceCurve } from '../geometry/roundedRect.ts';
import { maxSeatsInRow, rowLength } from '../geometry/seats.ts';
import { VenueConfigSchema, type SectorConfig, type VenueConfig } from './schema.ts';

/**
 * Turning raw JSON into a trusted VenueConfig. Two stages, both fail fast:
 *  1. zod: shape, types, ranges.
 *  2. semantic checks that zod can't express (cross-references, geometry,
 *     capacity totals). All problems are collected and reported together.
 */

export class VenueConfigError extends Error {
  readonly issues: string[];
  constructor(venueId: string, issues: string[]) {
    const shown = issues.slice(0, 25);
    const more = issues.length > shown.length ? `\n  … and ${issues.length - shown.length} more` : '';
    super(`Invalid venue config "${venueId}":\n  - ${shown.join('\n  - ')}${more}`);
    this.name = 'VenueConfigError';
    this.issues = issues;
  }
}

/** Allowed disagreement between a row's rakeDeg and its slope to the next row. */
export const RAKE_TOLERANCE_DEG = 1.5;

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : `${out ? '.' : ''}${String(p)}`;
  return out || '(root)';
}

export function parseVenueConfig(raw: unknown): VenueConfig {
  const id =
    raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' ? raw.id : '(unknown id)';
  const parsed = VenueConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VenueConfigError(
      id,
      parsed.error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`),
    );
  }
  const issues = semanticIssues(parsed.data);
  if (issues.length > 0) throw new VenueConfigError(parsed.data.id, issues);
  return parsed.data;
}

/** Spans are stored with mm precision, so overlaps below 1 mm are rounding noise. */
const SPAN_EPS = 1e-3;

function intervalsOverlapOnCircle(a0: number, a1: number, b0: number, b1: number, p: number): boolean {
  const eps = SPAN_EPS;
  const shift = (v: number) => v - Math.floor(v / p) * p;
  const aStart = shift(a0);
  const aEnd = aStart + (a1 - a0);
  const bStart = shift(b0);
  const bEnd = bStart + (b1 - b0);
  for (const k of [-1, 0, 1]) {
    if (Math.max(aStart, bStart + k * p) < Math.min(aEnd, bEnd + k * p) - eps) return true;
  }
  return false;
}

interface Located {
  where: string;
  sector: SectorConfig;
  standId: string;
}

export function semanticIssues(config: VenueConfig): string[] {
  const issues: string[] = [];
  const add = (msg: string) => issues.push(msg);

  // --- layout --------------------------------------------------------------
  let curve: ReferenceCurve;
  try {
    curve = makeReferenceCurve(config.layout.referenceLine);
  } catch (e) {
    add(`layout.referenceLine: ${(e as Error).message}`);
    return issues; // nothing geometric can be checked without the curve
  }
  const spec = config.layout.referenceLine;
  const perimeter = curve.perimeter;

  // --- price tiers ---------------------------------------------------------
  const tierIds = new Set<string>();
  for (const t of config.priceTiers) {
    if (tierIds.has(t.id)) add(`priceTiers: duplicate tier id "${t.id}"`);
    tierIds.add(t.id);
  }

  // --- stands / rings / sectors / rows -----------------------------------
  const standIds = new Set<string>();
  const codes = new Set<string>();
  const located: Located[] = [];
  const totals = { total: 0, vip: 0, press: 0, accessible: 0 };

  for (const stand of config.stands) {
    if (standIds.has(stand.id)) add(`stand "${stand.id}": duplicate stand id`);
    standIds.add(stand.id);
    const ringNumbers = new Set<number>();

    for (const ring of stand.rings) {
      if (ringNumbers.has(ring.ring)) add(`stand "${stand.id}": duplicate ring number ${ring.ring}`);
      ringNumbers.add(ring.ring);

      for (const sector of ring.sectors) {
        const where = `sector ${sector.code} (${stand.name}, ring ${ring.ring})`;
        if (codes.has(sector.code)) add(`${where}: duplicate sector code`);
        codes.add(sector.code);
        if (!tierIds.has(sector.tier)) add(`${where}: unknown price tier "${sector.tier}"`);

        const { from, to } = sector.span;
        if (!(to > from)) add(`${where}: span.to (${to}) must be greater than span.from (${from})`);
        if (to - from > perimeter) add(`${where}: span is longer than the whole reference line (${perimeter.toFixed(1)} m)`);

        const seatWidth = sector.seatWidth ?? config.seatWidth;
        sector.rows.forEach((row, i) => {
          const rw = `${where} row ${row.row}`;
          if (row.distance <= -spec.cornerRadius) {
            add(`${rw}: distance ${row.distance} m is inside the corner radius; rows must lie outside -${spec.cornerRadius} m`);
          }
          const next = sector.rows[i + 1];
          if (next) {
            if (!(next.row > row.row)) add(`${rw}: row numbers must increase (next is ${next.row})`);
            if (!(next.distance > row.distance)) add(`${rw}: distance must increase towards the back (next row is at ${next.distance} m)`);
            if (next.elevation < row.elevation) add(`${rw}: elevation must not decrease towards the back`);
            if (next.distance > row.distance) {
              const slope = (Math.atan2(next.elevation - row.elevation, next.distance - row.distance) * 180) / Math.PI;
              if (Math.abs(slope - row.rakeDeg) > RAKE_TOLERANCE_DEG) {
                add(`${rw}: rakeDeg ${row.rakeDeg}° disagrees with the slope to the next row (${slope.toFixed(1)}°)`);
              }
            }
          }
          if (to > from) {
            const fit = maxSeatsInRow(curve, sector.span, row.distance, config.aisleWidth, seatWidth);
            if (row.seats > fit) {
              const len = rowLength(curve, sector.span, row.distance);
              add(
                `${rw}: ${row.seats} seats × ${seatWidth} m do not fit; the row is ${len.toFixed(2)} m long ` +
                  `(${config.aisleWidth} m of aisles) and holds at most ${fit}`,
              );
            }
          }
        });

        const count = sector.rows.reduce((a, r) => a + r.seats, 0);
        totals.total += count;
        if (sector.category === 'vip') totals.vip += count;
        if (sector.category === 'press') totals.press += count;
        if (sector.category === 'accessible') totals.accessible += count;
        located.push({ where, sector, standId: stand.id });
      }
    }
  }

  // --- overlapping sectors -------------------------------------------------
  const extent = (s: SectorConfig) => ({
    dMin: s.rows[0]!.distance,
    dMax: s.rows[s.rows.length - 1]!.distance,
    eMin: s.rows[0]!.elevation,
    eMax: s.rows[s.rows.length - 1]!.elevation,
  });
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i]!;
      const b = located[j]!;
      const sa = a.sector.span;
      const sb = b.sector.span;
      if (!(sa.to > sa.from && sb.to > sb.from)) continue;
      if (!intervalsOverlapOnCircle(sa.from, sa.to, sb.from, sb.to, perimeter)) continue;
      const ea = extent(a.sector);
      const eb = extent(b.sector);
      const distOverlap = ea.dMin <= eb.dMax && eb.dMin <= ea.dMax;
      const elevOverlap = ea.eMin <= eb.eMax && eb.eMin <= ea.eMax;
      if (distOverlap && elevOverlap) add(`${a.where} overlaps ${b.where}`);
    }
  }

  // --- capacity --------------------------------------------------------------
  const cap = config.capacity;
  for (const key of ['total', 'vip', 'press', 'accessible'] as const) {
    if (totals[key] !== cap[key]) {
      add(`capacity.${key} is ${cap[key]} but the rows add up to ${totals[key]}`);
    }
  }

  // --- field of play fits inside the bowl -----------------------------------
  const track = config.track;
  if (track) {
    const outerR = track.innerRadius + track.lanes * track.laneWidth;
    const hx = track.straightLength / 2;
    for (let a = 0; a <= 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      const cx = Math.cos(rad) >= 0 ? hx : -hx;
      const p = { x: cx + outerR * Math.cos(rad), z: outerR * Math.sin(rad) };
      if (signedDistance(spec, p) > 0) {
        add(`track: its outer edge reaches outside the bowl reference line (at bearing ${a}°)`);
        break;
      }
    }
    if (config.pitch.width / 2 > track.innerRadius) add('pitch: wider than the track infield');
    if (config.pitch.length / 2 > hx + track.innerRadius) add('pitch: longer than the track infield');
  } else {
    const corner = { x: config.pitch.length / 2, z: config.pitch.width / 2 };
    if (signedDistance(spec, corner) > 0) add('pitch: reaches outside the bowl reference line');
  }

  // --- roof -------------------------------------------------------------------
  const roof = config.roof;
  if (roof) {
    if (!(roof.outer.distance > roof.inner.distance)) add('roof: outer.distance must exceed inner.distance');
    if (!(roof.columnDistance > roof.inner.distance && roof.columnDistance <= roof.outer.distance)) {
      add('roof: columnDistance must lie between inner.distance and outer.distance');
    }
    roof.segments.forEach((seg, i) => {
      if (!(seg.to > seg.from)) add(`roof.segments[${i}]: to must be greater than from`);
    });
  }

  return issues;
}
