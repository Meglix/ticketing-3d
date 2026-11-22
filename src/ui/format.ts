import type { SectorCategory } from '../geometry/types.ts';
import type { Venue } from '../venue/loadVenue.ts';
import { strings } from './strings.ts';

/**
 * Pure helpers behind the overlay: price text, what to show for a sector or
 * a seat, and the fake checkout arithmetic. No React, so they are unit-tested.
 */

const leiNumber = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

export function formatLei(amount: number): string {
  return `${leiNumber.format(amount)} lei`;
}

/** "40 lei", or why the seat cannot be bought. */
export function priceText(price: number | null, category: SectorCategory): string {
  if (price !== null) return formatLei(price);
  return category === 'press' ? strings.notForSalePress : strings.notForSale;
}

export interface SectorSummary {
  code: string;
  name: string;
  standName: string;
  ringName: string;
  /** Lei per ticket; null = not for sale. */
  price: number | null;
  tierLabel: string;
  tierColor: string;
  category: SectorCategory;
  estimated: boolean;
}

export interface SeatSummary extends SectorSummary {
  seatId: string;
  row: number;
  seat: number;
  /** Number of seats in this seat's row (bounds the "adjacent seats" of a multi-ticket order). */
  seatsInRow: number;
}

export function sectorSummary(venue: Venue, code: string): SectorSummary | null {
  const sector = venue.sectorByCode.get(code);
  if (!sector) return null;
  const tier = venue.tierById.get(sector.tierId);
  return {
    code: sector.code,
    name: sector.name,
    standName: sector.standName,
    ringName: sector.ringName,
    price: tier?.price ?? null,
    tierLabel: tier?.label ?? '',
    tierColor: tier?.color ?? '#8d96a3',
    category: sector.category,
    estimated: sector.estimated,
  };
}

export function seatSummary(venue: Venue, seatId: string): SeatSummary | null {
  const seat = venue.seatById.get(seatId);
  if (!seat) return null;
  const sector = venue.sectorByCode.get(seat.sector);
  const base = sectorSummary(venue, seat.sector);
  if (!sector || !base) return null;
  let seatsInRow = 0;
  for (let i = sector.seatStart; i < sector.seatEnd; i++) {
    if (venue.manifest.seats[i]!.row === seat.row) seatsInRow++;
  }
  return { ...base, seatId, row: seat.row, seat: seat.seat, seatsInRow };
}

/** One-line note for special categories (shown under the seat details). */
export function categoryNote(category: SectorCategory): string | null {
  switch (category) {
    case 'accessible':
      return strings.accessibleNote;
    case 'vip':
      return strings.vipNote;
    case 'press':
      return strings.pressNote;
    case 'standard':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Fake checkout
// ---------------------------------------------------------------------------

export const MAX_TICKETS = 4;

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_TICKETS, Math.max(1, Math.round(quantity)));
}

export function checkoutTotal(price: number, quantity: number): number {
  return price * clampQuantity(quantity);
}

/**
 * Seat numbers for `quantity` adjacent seats that include `seat`, kept inside
 * the row: normally seat, seat+1, …; shifted left at the end of the row.
 */
export function adjacentSeats(seat: number, quantity: number, seatsInRow: number): { first: number; last: number } {
  const n = Math.min(clampQuantity(quantity), Math.max(1, seatsInRow));
  const first = Math.max(1, Math.min(seat, seatsInRow - n + 1));
  return { first, last: first + n - 1 };
}

/** The next Saturday at least five days after `now`, 20:00 local time (a plausible demo fixture). */
export function demoEventDate(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 20, 0, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
}

const eventDay = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Sâmbătă, 28 noiembrie 2026, ora 20:00". */
export function formatEventDate(date: Date): string {
  const day = eventDay.format(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ora ${hh}:${mm}`;
}

/** Deterministic, obviously fake booking reference, e.g. "DEMO-4K2Q9Z". */
export function demoReference(seatId: string, quantity: number): string {
  let h = 2166136261; // FNV-1a
  for (const ch of `${seatId}#${quantity}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `DEMO-${(h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}
