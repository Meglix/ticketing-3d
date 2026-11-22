/**
 * A deliberately different, fictional venue: a compact football-only bowl
 * (no athletics track, one ring, tight corners, continuous roof). It exists
 * to prove the generator is venue-agnostic and to show how to author a venue.
 *
 * Run:  npm run author:example      → venues/example-arena.json
 * View: http://localhost:5173/?venue=example-arena
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeReferenceCurve } from '../src/geometry/roundedRect.ts';
import { maxSeatsInRow } from '../src/geometry/seats.ts';
import type { SectorConfig, StandConfig, VenueConfig } from '../src/venue/schema.ts';
import { parseVenueConfig } from '../src/venue/validate.ts';
import { fitCounts, formatVenueJson, profile, round } from './authoring.ts';

const REF = { halfLength: 60.5, halfWidth: 42, cornerRadius: 14 };
const SEAT = 0.5;
const AISLE = 1.2;
const FILL = 0.95; // share of the geometric maximum that is sold as seats

const curve = makeReferenceCurve(REF);
const R = REF.cornerRadius;
const SX = REF.halfLength - R;
const SZ = REF.halfWidth - R;
const Q = (Math.PI / 2) * R;
const centres = { W: 0, N: SX + Q + SZ, E: 2 * SX + 2 * Q + 2 * SZ, S: 3 * SX + 3 * Q + 3 * SZ };
const sideHalf = SX + Q / 2;
const endHalf = SZ + Q / 2;
const rows = profile(22, 1.0, 1.2, 0.38, 0.46);

function stand(id: string, name: string, centre: number, half: number, letters: string[], tiers: string[], vipLetter?: string): StandConfig {
  const n = letters.length;
  const sectors: SectorConfig[] = letters.map((letter, i) => ({
    code: `${id}${letter}`,
    name: letter === vipLetter ? `VIP · ${id}${letter}` : `Sector ${id}${letter}`,
    tier: tiers[i]!,
    category: letter === vipLetter ? 'vip' : 'standard',
    estimated: false,
    span: { from: round(centre - half + (2 * half * i) / n), to: round(centre - half + (2 * half * (i + 1)) / n) },
    rows: rows.map((r) => ({ ...r, seats: 0 })),
  }));
  return { id, name, rings: [{ ring: 1, name: 'Inel unic', parapetHeight: 1.0, slabThickness: null, backWallHeight: 2.0, sectors }] };
}

const stands: StandConfig[] = [
  stand('V', 'Tribuna Vest', centres.W, sideHalf, ['A', 'B', 'C', 'D'], ['b', 'c', 'c', 'b'], 'C'),
  stand('N', 'Peluza Nord', centres.N, endHalf, ['A', 'B', 'C'], ['a', 'a', 'a']),
  stand('E', 'Tribuna Est', centres.E, sideHalf, ['A', 'B', 'C', 'D'], ['b', 'c', 'c', 'b']),
  stand('S', 'Peluza Sud', centres.S, endHalf, ['A', 'B', 'C'], ['a', 'a', 'a']),
];

// Fill every row to FILL of what fits.
const refs = stands.flatMap((st) => st.rings[0]!.sectors.flatMap((sec) => sec.rows.map((row) => ({ sec, row }))));
const maxes = refs.map(({ sec, row }) => maxSeatsInRow(curve, sec.span, row.distance, AISLE, SEAT));
const target = Math.floor(maxes.reduce((a, b) => a + b, 0) * FILL);
fitCounts(maxes, target).forEach((n, i) => (refs[i]!.row.seats = n));
const vip = refs.filter((r) => r.sec.category === 'vip').reduce((a, r) => a + r.row.seats, 0);

const config: VenueConfig = {
  id: 'example-arena',
  name: 'Arena Exemplu',
  city: 'Oraș demo',
  capacity: { total: target, vip, press: 0, accessible: 0 },
  eyeHeight: 1.2,
  seatWidth: SEAT,
  aisleWidth: AISLE,
  minCValue: 0.06,
  priceTiers: [
    { id: 'a', label: '30 lei', price: 30, color: '#3a9ad9' },
    { id: 'b', label: '50 lei', price: 50, color: '#b45bc9' },
    { id: 'c', label: '80 lei', price: 80, color: '#f08a3e' },
  ],
  pitch: { length: 105, width: 68 },
  track: null,
  layout: { template: 'bowl', referenceLine: REF },
  stands,
  roof: {
    estimated: false,
    segments: [{ from: round(-sideHalf), to: round(centres.S + endHalf) }],
    inner: { distance: 3, height: 21 },
    outer: { distance: 22, height: 24 },
    columnDistance: 19.5,
    trussDepth: 3,
    translucentDepth: 4,
    frameSpacing: 8,
  },
  facade: { estimated: false, distance: 22, height: 24 },
  floodlights: { count: 240 },
  screens: [{ x: REF.halfLength + 19, z: 0, elevation: 17, width: 10, height: 4 }],
};

parseVenueConfig(config); // fail fast
const out = fileURLToPath(new URL('../venues/example-arena.json', import.meta.url));
writeFileSync(out, formatVenueJson(config));
console.log(`wrote ${out}: ${target} seats (${vip} VIP)`);
