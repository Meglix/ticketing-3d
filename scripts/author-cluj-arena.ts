/**
 * Authoring script: produces venues/cluj-arena.json from a handful of
 * ESTIMATED parameters (see reference/REFERENCE_ANALYSIS.md).
 *
 * Run:  npm run author:cluj      (Node ≥ 22.18 runs TypeScript directly)
 *
 * The JSON it writes is the source of truth the app reads. This script only
 * documents *how* the estimate was made, so it can be re-run when better
 * numbers arrive (e.g. real row counts from the stadium). Real seat counts
 * from the ticketing system would replace the fitted `seats` values directly
 * in the JSON.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeReferenceCurve } from '../src/geometry/roundedRect.ts';
import { maxSeatsInRow } from '../src/geometry/seats.ts';
import type {
  PriceTier,
  RingConfig,
  RowConfig,
  SectorCategory,
  SectorConfig,
  StandConfig,
  VenueConfig,
} from '../src/venue/schema.ts';
import { parseVenueConfig } from '../src/venue/validate.ts';
import { fitCounts, formatVenueJson, profile, round } from './authoring.ts';

// ---------------------------------------------------------------------------
// Sourced numbers (reference/FACTS.md)
// ---------------------------------------------------------------------------
const CAPACITY = { total: 30335, vip: 1464, press: 168, accessible: 32 };

// ---------------------------------------------------------------------------
// Estimated geometry (reference/REFERENCE_ANALYSIS.md)
// ---------------------------------------------------------------------------
const REF = { halfLength: 92, halfWidth: 50, cornerRadius: 30 };
const SEAT_WIDTH = 0.5;
const VIP_SEAT_WIDTH = 0.55;
const WHEELCHAIR_SPACE = 0.9;
const AISLE = 1.2;
/** Half-width (reference metres) of the gap at each corner diagonal in the upper ring and roof. */
const CORNER_GAP_HALF = 2.5;

const curve = makeReferenceCurve(REF);
const R = REF.cornerRadius;
const SX = REF.halfLength - R; // half straight along x (62)
const SZ = REF.halfWidth - R; // half straight along z (20)
const QUARTER = (Math.PI / 2) * R; // one corner arc
const HALF_CORNER = QUARTER / 2; // stands meet at the 45° diagonal

// Stand centres in reference arc length (s = 0 is the middle of Tribuna I).
const CENTRE = {
  T1: 0,
  P2: SX + QUARTER + SZ,
  T2: SX + QUARTER + 2 * SZ + QUARTER + SX,
  P1: 2 * SX + 2 * QUARTER + 2 * SZ + SX + QUARTER + SZ,
};
const TRIBUNE_HALF = SX + HALF_CORNER; // 85.56
const PELUZA_HALF = SZ + HALF_CORNER; // 43.56

const LOWER = profile(14, 1.0, 1.6, 0.3, 0.4);
const UPPER = profile(16, 10.0, 11.5, 0.47, 0.54);
const PLATFORM: Omit<RowConfig, 'seats'>[] = [{ row: 1, distance: -1.5, elevation: 0.15, rakeDeg: 0 }];

// ---------------------------------------------------------------------------
// Price tiers (DEMO prices, historical structure only)
// ---------------------------------------------------------------------------
const TIERS: PriceTier[] = [
  { id: 'p15', label: '15 lei', price: 15, color: '#5bc0be' },
  { id: 'p20', label: '20 lei', price: 20, color: '#3a9ad9' },
  { id: 'p25', label: '25 lei', price: 25, color: '#4c6fd6' },
  { id: 'p30', label: '30 lei', price: 30, color: '#7b5bd6' },
  { id: 'p40', label: '40 lei', price: 40, color: '#b45bc9' },
  { id: 'p50', label: '50 lei', price: 50, color: '#d0569c' },
  { id: 'p60', label: '60 lei', price: 60, color: '#e0607e' },
  { id: 'p100', label: '100 lei', price: 100, color: '#f08a3e' },
  { id: 'vip', label: 'VIP · 150 lei', price: 150, color: '#dfe3ea' }, // platinum: gold is reserved for "your seat"
  { id: 'press', label: 'Presă', price: null, color: '#8d96a3' },
];

// ---------------------------------------------------------------------------
// Sector layout per stand
// ---------------------------------------------------------------------------
interface SectorDraft {
  code: string;
  name: string;
  tier: string;
  category: SectorCategory;
  from: number;
  to: number;
  seatWidth?: number;
  rows: Omit<RowConfig, 'seats'>[];
}

/** Sectors between consecutive boundaries (relative to the stand centre). */
function sectors(
  ring: number,
  centre: number,
  boundaries: number[],
  letters: string[],
  tiers: string[],
  rows: Omit<RowConfig, 'seats'>[],
  special: Record<string, Partial<SectorDraft>> = {},
): SectorDraft[] {
  if (letters.length !== boundaries.length - 1 || tiers.length !== letters.length) {
    throw new Error(`ring ${ring}: ${letters.length} letters for ${boundaries.length - 1} intervals`);
  }
  return letters.map((letter, i) => {
    const code = `${ring}${letter}`;
    return {
      code,
      name: `Sector ${code}`,
      tier: tiers[i]!,
      category: 'standard',
      from: round(centre + boundaries[i]!),
      to: round(centre + boundaries[i + 1]!),
      rows,
      ...special[letter],
    };
  });
}

const gapped = (b: number[]) => [b[0]! + CORNER_GAP_HALF, ...b.slice(1, -1), b[b.length - 1]! - CORNER_GAP_HALF];

const T1_LOWER_B = [-TRIBUNE_HALF, -SX, -46.5, -31, 0, 31, 46.5, SX, TRIBUNE_HALF];
const T1_UPPER_B = gapped([-TRIBUNE_HALF, -SX, -46.5, -31, -3.5, 3.5, 31, 46.5, SX, TRIBUNE_HALF]);
const T2_B = [-TRIBUNE_HALF, -SX, -41.33, -20.67, 0, 20.67, 41.33, SX, TRIBUNE_HALF];
const PEL_B = [-PELUZA_HALF, -SZ - HALF_CORNER / 2, -SZ, 0, SZ, SZ + HALF_CORNER / 2, PELUZA_HALF];

const vip = (letter: string) => ({
  [letter]: { name: `VIP · Sector 1${letter}`, category: 'vip' as const, seatWidth: VIP_SEAT_WIDTH },
});

const standDrafts: Array<{ id: string; name: string; rings: Array<{ ring: number; name: string; drafts: SectorDraft[] }> }> = [
  {
    id: 'T1',
    name: 'Tribuna I',
    rings: [
      {
        ring: 1,
        name: 'Inelul 1 (inferior)',
        drafts: sectors(1, CENTRE.T1, T1_LOWER_B, ['A1', 'A2', 'B', 'C', 'D', 'E', 'F1', 'F2'],
          ['p25', 'p30', 'p50', 'vip', 'vip', 'p50', 'p30', 'p25'], LOWER, { ...vip('C'), ...vip('D') }),
      },
      {
        ring: 2,
        name: 'Inelul 2 (superior)',
        drafts: sectors(2, CENTRE.T1, T1_UPPER_B, ['A1', 'A2', 'B', 'C', 'P', 'D', 'E', 'F1', 'F2'],
          ['p30', 'p40', 'p60', 'p100', 'press', 'p100', 'p60', 'p40', 'p30'], UPPER,
          { P: { name: 'Tribuna presei', category: 'press' } }),
      },
    ],
  },
  {
    id: 'P2',
    name: 'Peluza II (Nord)',
    rings: [
      { ring: 1, name: 'Inelul 1 (inferior)', drafts: sectors(1, CENTRE.P2, PEL_B, ['G1', 'G2', 'H', 'I', 'J1', 'J2'], Array(6).fill('p15'), LOWER) },
      { ring: 2, name: 'Inelul 2 (superior)', drafts: sectors(2, CENTRE.P2, gapped(PEL_B), ['G1', 'G2', 'H', 'I', 'J1', 'J2'], Array(6).fill('p20'), UPPER) },
    ],
  },
  {
    id: 'T2',
    name: 'Tribuna II',
    rings: [
      {
        ring: 0,
        name: 'Platformă (nivelul terenului)',
        drafts: [{
          code: 'PD',
          name: 'Platformă persoane cu dizabilități',
          tier: 'p15',
          category: 'accessible',
          from: round(CENTRE.T2 - 16),
          to: round(CENTRE.T2 + 16),
          seatWidth: WHEELCHAIR_SPACE,
          rows: PLATFORM,
        }],
      },
      { ring: 1, name: 'Inelul 1 (inferior)', drafts: sectors(1, CENTRE.T2, T2_B, ['K1', 'K2', 'L', 'M1', 'M2', 'N', 'O1', 'O2'], ['p20', 'p25', 'p25', 'p25', 'p25', 'p25', 'p25', 'p20'], LOWER) },
      { ring: 2, name: 'Inelul 2 (superior)', drafts: sectors(2, CENTRE.T2, gapped(T2_B), ['K1', 'K2', 'L', 'M1', 'M2', 'N', 'O1', 'O2'], ['p25', 'p30', 'p40', 'p40', 'p40', 'p40', 'p30', 'p25'], UPPER) },
    ],
  },
  {
    id: 'P1',
    name: 'Peluza I (Sud)',
    rings: [
      { ring: 1, name: 'Inelul 1 (inferior)', drafts: sectors(1, CENTRE.P1, PEL_B, ['T1', 'T2', 'U', 'V', 'X', 'Y'], Array(6).fill('p15'), LOWER) },
      { ring: 2, name: 'Inelul 2 (superior)', drafts: sectors(2, CENTRE.P1, gapped(PEL_B), ['T1', 'T2', 'U', 'V', 'X', 'Y'], Array(6).fill('p20'), UPPER) },
    ],
  },
];

// ---------------------------------------------------------------------------
// Capacity fit: geometric maximum per row, scaled to the sourced totals
// ---------------------------------------------------------------------------

interface RowRef {
  draft: SectorDraft;
  rowIndex: number;
  max: number;
}
const byCategory: Record<SectorCategory, RowRef[]> = { standard: [], vip: [], press: [], accessible: [] };
for (const stand of standDrafts) {
  for (const ring of stand.rings) {
    for (const draft of ring.drafts) {
      draft.rows.forEach((row, rowIndex) => {
        const max = maxSeatsInRow(curve, draft, row.distance, AISLE, draft.seatWidth ?? SEAT_WIDTH);
        byCategory[draft.category].push({ draft, rowIndex, max });
      });
    }
  }
}

const targets: Record<SectorCategory, number> = {
  standard: CAPACITY.total - CAPACITY.vip - CAPACITY.press - CAPACITY.accessible,
  vip: CAPACITY.vip,
  press: CAPACITY.press,
  accessible: CAPACITY.accessible,
};
const seatCount = new Map<string, number>(); // `${code}:${rowIndex}` → seats
const fill: Record<string, string> = {};
for (const cat of Object.keys(byCategory) as SectorCategory[]) {
  const refs = byCategory[cat];
  const counts = fitCounts(refs.map((r) => r.max), targets[cat]);
  refs.forEach((r, i) => seatCount.set(`${r.draft.code}:${r.rowIndex}`, counts[i]!));
  const maxSum = refs.reduce((a, r) => a + r.max, 0);
  fill[cat] = `${targets[cat]} of ${maxSum} geometric max (fill ${((100 * targets[cat]) / maxSum).toFixed(1)} %)`;
}

// ---------------------------------------------------------------------------
// Assemble the config
// ---------------------------------------------------------------------------
const RING_STYLE: Record<number, Pick<RingConfig, 'parapetHeight' | 'slabThickness' | 'backWallHeight'>> = {
  0: { parapetHeight: 0, slabThickness: null, backWallHeight: 0 },
  1: { parapetHeight: 1.1, slabThickness: null, backWallHeight: 2.5 },
  2: { parapetHeight: 0.8, slabThickness: 1.2, backWallHeight: 1.2 },
};

const stands: StandConfig[] = standDrafts.map((stand) => ({
  id: stand.id,
  name: stand.name,
  rings: stand.rings.map((ring) => ({
    ring: ring.ring,
    name: ring.name,
    ...RING_STYLE[ring.ring]!,
    sectors: ring.drafts.map((d): SectorConfig => ({
      code: d.code,
      name: d.name,
      tier: d.tier,
      category: d.category,
      estimated: true,
      span: { from: d.from, to: d.to },
      ...(d.seatWidth ? { seatWidth: d.seatWidth } : {}),
      rows: d.rows.map((row, i) => ({
        row: row.row,
        seats: seatCount.get(`${d.code}:${i}`)!,
        distance: row.distance,
        elevation: row.elevation,
        rakeDeg: row.rakeDeg,
      })),
    })),
  })),
}));

const roofSegments = [
  { from: CENTRE.T1 - TRIBUNE_HALF + CORNER_GAP_HALF, to: CENTRE.T1 + TRIBUNE_HALF - CORNER_GAP_HALF },
  { from: CENTRE.P2 - PELUZA_HALF + CORNER_GAP_HALF, to: CENTRE.P2 + PELUZA_HALF - CORNER_GAP_HALF },
  { from: CENTRE.T2 - TRIBUNE_HALF + CORNER_GAP_HALF, to: CENTRE.T2 + TRIBUNE_HALF - CORNER_GAP_HALF },
  { from: CENTRE.P1 - PELUZA_HALF + CORNER_GAP_HALF, to: CENTRE.P1 + PELUZA_HALF - CORNER_GAP_HALF },
].map((s) => ({ from: round(s.from), to: round(s.to) }));

const SCREEN_D = 23.4;
const config: VenueConfig = {
  id: 'cluj-arena',
  name: 'Cluj Arena',
  city: 'Cluj-Napoca',
  capacity: CAPACITY,
  eyeHeight: 1.2,
  seatWidth: SEAT_WIDTH,
  aisleWidth: AISLE,
  minCValue: 0.06,
  priceTiers: TIERS,
  pitch: { length: 105, width: 68 },
  track: { lanes: 8, laneWidth: 1.22, innerRadius: 36.5, straightLength: 84.39 },
  layout: { template: 'bowl', referenceLine: REF },
  stands,
  roof: {
    estimated: true,
    segments: roofSegments,
    inner: { distance: 1.0, height: 28.0 },
    outer: { distance: 31.1, height: 33.6 },
    columnDistance: 24.0,
    trussDepth: 4.5,
    translucentDepth: 7.0,
    frameSpacing: 10.0,
  },
  facade: { estimated: true, distance: 31.1, height: 33.6 },
  floodlights: { count: 386 },
  screens: [
    { x: REF.halfLength + SCREEN_D, z: 0, elevation: 23.5, width: 12.8, height: 5.0 },
    { x: -(REF.halfLength + SCREEN_D), z: 0, elevation: 23.5, width: 12.8, height: 5.0 },
  ],
};

// Fail fast: the output must pass the same validation the app runs.
parseVenueConfig(config);

const outPath = fileURLToPath(new URL('../venues/cluj-arena.json', import.meta.url));
writeFileSync(outPath, formatVenueJson(config));

// Summary for REFERENCE_ANALYSIS.md / REPORT.md.
console.log(`wrote ${outPath}`);
for (const [cat, text] of Object.entries(fill)) console.log(`  ${cat.padEnd(10)} ${text}`);
for (const stand of stands) {
  for (const ring of stand.rings) {
    const n = ring.sectors.reduce((a, s) => a + s.rows.reduce((b, r) => b + r.seats, 0), 0);
    console.log(`  ${stand.name.padEnd(18)} ring ${ring.ring}: ${String(n).padStart(6)} seats in ${ring.sectors.length} sectors`);
  }
}
console.log(`  lower ring rows: ${LOWER.length}, elevations ${LOWER[0]!.elevation}–${LOWER[LOWER.length - 1]!.elevation} m`);
console.log(`  upper ring rows: ${UPPER.length}, elevations ${UPPER[0]!.elevation}–${UPPER[UPPER.length - 1]!.elevation} m`);
