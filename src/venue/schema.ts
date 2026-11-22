import { z } from 'zod';

/**
 * Venue config schema. This file is the authority for the JSON format
 * (PLAN.md §3 is a summary). Objects are strict, so a typo in a key is an
 * error instead of a silently ignored field.
 *
 * Units: metres, degrees, lei. Positions along the bowl are arc lengths `s`
 * on the reference line (see src/geometry/roundedRect.ts).
 */

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const positive = finite.refine((v) => v > 0, 'must be > 0');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour');

export const RowSchema = z.strictObject({
  /** Row number as printed on the ticket. */
  row: z.number().int().positive(),
  seats: z.number().int().positive(),
  /** Horizontal distance (m) of the seat line from the bowl reference line (the front of the stands). */
  distance: finite.refine((v) => v >= -20 && v <= 200, 'must be between -20 and 200 m'),
  /** Height (m) of the row's tread above pitch level. */
  elevation: finite.refine((v) => v >= 0 && v <= 150, 'must be between 0 and 150 m'),
  /** Rake (slope) of the stand at this row, degrees. Cross-checked against the row-to-row slope. */
  rakeDeg: finite.refine((v) => v >= 0 && v <= 40, 'must be between 0 and 40 degrees'),
});

export const SectorCategorySchema = z.enum(['standard', 'vip', 'press', 'accessible']);

export const SectorSchema = z.strictObject({
  /** Code printed on tickets, e.g. "2M2". Unique in the venue. */
  code: z.string().min(1).max(12),
  name: z.string().min(1),
  /** Id of a price tier. */
  tier: z.string().min(1),
  category: SectorCategorySchema,
  /** True when the sector's geometry is not confirmed against the real venue. */
  estimated: z.boolean(),
  /** Extent along the reference line, metres of arc length. `to` must exceed `from`. */
  span: z.strictObject({ from: finite, to: finite }),
  /** Optional seat pitch override (e.g. wider VIP seats, wheelchair spaces). */
  seatWidth: positive.optional(),
  rows: z.array(RowSchema).min(1),
});

export const RingSchema = z.strictObject({
  /** 1 = lowest seating ring; 0 may be used for pitch-level platforms. Unique within a stand. */
  ring: z.number().int().min(0),
  name: z.string().min(1),
  /** Height of the front wall / balustrade above the first row's tread (0 = none). */
  parapetHeight: finite.refine((v) => v >= 0 && v <= 3, 'must be between 0 and 3 m'),
  /** Thickness of the structure under the rows. null = solid down to the ground (a lower ring). */
  slabThickness: positive.nullable(),
  /** Height of the wall behind the last row, above its tread (0 = none). */
  backWallHeight: finite.refine((v) => v >= 0 && v <= 30, 'must be between 0 and 30 m'),
  sectors: z.array(SectorSchema).min(1),
});

export const StandSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  rings: z.array(RingSchema).min(1),
});

export const PriceTierSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Price in lei; null = not for sale (e.g. press). */
  price: z.number().int().positive().nullable(),
  color: hexColor,
});

const SpanSchema = z.strictObject({ from: finite, to: finite });

export const BowlLayoutSchema = z.strictObject({
  template: z.literal('bowl'),
  referenceLine: z.strictObject({
    halfLength: positive,
    halfWidth: positive,
    cornerRadius: positive,
  }),
});

/**
 * Layout templates. Only "bowl" exists today. A theatre "horseshoe" template
 * would be added here as another member of the union (with its own reference
 * curve), plus one branch in src/geometry/generate.ts.
 */
export const LayoutSchema = z.discriminatedUnion('template', [BowlLayoutSchema]);

export const VenueConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'must be kebab-case'),
  name: z.string().min(1),
  city: z.string().min(1),
  capacity: z.strictObject({
    total: z.number().int().positive(),
    vip: z.number().int().min(0),
    press: z.number().int().min(0),
    accessible: z.number().int().min(0),
  }),
  /** Eye height above the tread for a seated spectator (m). */
  eyeHeight: finite.refine((v) => v >= 0.8 && v <= 2, 'must be between 0.8 and 2 m (seated eye height)'),
  /** Default centre-to-centre seat pitch (m). */
  seatWidth: positive,
  /** Width of the radial aisle between neighbouring sectors (m). */
  aisleWidth: finite.refine((v) => v >= 0, 'must be >= 0'),
  /** Minimum sightline clearance (C-value, m) every seat must reach. */
  minCValue: finite.refine((v) => v >= 0, 'must be >= 0'),
  priceTiers: z.array(PriceTierSchema).min(1),
  pitch: z.strictObject({ length: positive, width: positive }),
  track: z
    .strictObject({
      lanes: z.number().int().positive(),
      laneWidth: positive,
      /** Radius of the inside edge of lane 1. */
      innerRadius: positive,
      /** Length of each straight between the two bends. */
      straightLength: positive,
    })
    .nullable(),
  layout: LayoutSchema,
  stands: z.array(StandSchema).min(1),
  roof: z
    .strictObject({
      estimated: z.boolean(),
      /** Spans of the separate roof frames along the reference line. */
      segments: z.array(SpanSchema).min(1),
      /** Leading edge: distance from the reference line and height of the roof skin. */
      inner: z.strictObject({ distance: finite, height: positive }),
      /** Back edge (cornice). */
      outer: z.strictObject({ distance: finite, height: positive }),
      /** Distance of the supporting columns from the reference line. */
      columnDistance: finite,
      /** Depth of the cantilever truss at the column (m). */
      trussDepth: positive,
      /** Width of the translucent band along the leading edge (m). */
      translucentDepth: finite.refine((v) => v >= 0, 'must be >= 0'),
      /** Spacing of the roof frames (m, measured along the column line). */
      frameSpacing: positive,
    })
    .nullable(),
  facade: z
    .strictObject({
      estimated: z.boolean(),
      distance: finite,
      height: positive,
    })
    .nullable(),
  floodlights: z.strictObject({ count: z.number().int().min(0).max(5000) }),
  screens: z.array(
    z.strictObject({
      x: finite,
      z: finite,
      elevation: finite,
      width: positive,
      height: positive,
    }),
  ),
});

export type VenueConfig = z.infer<typeof VenueConfigSchema>;
export type StandConfig = z.infer<typeof StandSchema>;
export type RingConfig = z.infer<typeof RingSchema>;
export type SectorConfig = z.infer<typeof SectorSchema>;
export type RowConfig = z.infer<typeof RowSchema>;
export type PriceTier = z.infer<typeof PriceTierSchema>;
export type SectorCategory = z.infer<typeof SectorCategorySchema>;
