import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { loadVenue } from '../venue/loadVenue.ts';
import {
  adjacentSeats,
  categoryNote,
  checkoutTotal,
  clampQuantity,
  demoEventDate,
  demoReference,
  formatEventDate,
  formatLei,
  priceText,
  sectorSummary,
  seatSummary,
} from './format.ts';

const venue = loadVenue(raw);

describe('price text', () => {
  it('formats lei and explains seats that are not for sale', () => {
    expect(formatLei(40)).toBe('40 lei');
    expect(priceText(150, 'vip')).toBe('150 lei');
    expect(priceText(null, 'press')).toBe('Nu se vinde (presă)');
    expect(priceText(null, 'standard')).toBe('Nu se vinde');
  });

  it('has a note only for special categories', () => {
    expect(categoryNote('standard')).toBeNull();
    expect(categoryNote('accessible')).toBe('Loc pentru persoane cu dizabilități');
  });
});

describe('summaries', () => {
  it('summarises a seat with its stand, ring, row, seat and tier price', () => {
    const s = seatSummary(venue, '2M2-R8-S18');
    expect(s).toMatchObject({
      code: '2M2',
      standName: 'Tribuna II',
      ringName: 'Inelul 2 (superior)',
      row: 8,
      seat: 18,
      price: 40,
      category: 'standard',
      seatsInRow: 36,
    });
  });

  it('marks press seats as not for sale and the wheelchair platform as accessible', () => {
    expect(sectorSummary(venue, '2P')).toMatchObject({ price: null, category: 'press' });
    expect(seatSummary(venue, 'PD-R1-S1')).toMatchObject({ category: 'accessible', seatsInRow: 32, price: 15 });
  });

  it('returns null for unknown ids instead of throwing', () => {
    expect(seatSummary(venue, 'NOPE-R1-S1')).toBeNull();
    expect(sectorSummary(venue, 'NOPE')).toBeNull();
  });
});

describe('fake checkout arithmetic', () => {
  it('clamps the quantity to 1–4', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(3)).toBe(3);
    expect(clampQuantity(9)).toBe(4);
    expect(clampQuantity(Number.NaN)).toBe(1);
    expect(checkoutTotal(40, 3)).toBe(120);
    expect(checkoutTotal(40, 7)).toBe(160);
  });

  it('keeps adjacent seats inside the row', () => {
    expect(adjacentSeats(18, 2, 36)).toEqual({ first: 18, last: 19 });
    expect(adjacentSeats(35, 4, 36)).toEqual({ first: 33, last: 36 });
    expect(adjacentSeats(1, 1, 36)).toEqual({ first: 1, last: 1 });
    expect(adjacentSeats(2, 4, 3)).toEqual({ first: 1, last: 3 });
  });

  it('dates the demo event on a Saturday evening at least five days ahead', () => {
    const d = demoEventDate(new Date(2026, 10, 22, 12, 0)); // Sunday 22 Nov 2026
    expect(d.getDay()).toBe(6);
    expect(d.getHours()).toBe(20);
    expect(d.getDate()).toBe(28);
    expect(formatEventDate(d)).toBe('Sâmbătă, 28 noiembrie 2026, ora 20:00');
  });

  it('makes a stable, obviously fake reference', () => {
    const ref = demoReference('2M2-R8-S18', 2);
    expect(ref).toMatch(/^DEMO-[0-9A-Z]{6}$/);
    expect(demoReference('2M2-R8-S18', 2)).toBe(ref);
    expect(demoReference('2M2-R8-S18', 3)).not.toBe(ref);
  });
});
