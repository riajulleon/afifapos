import { describe, expect, it } from 'vitest';
import { allocate, bandIndex, bandLabels, dealAllowance, fitTiers, isDealLive, orderTotals, resolveMinimum, resolveShipping, unitPrice, validateBands } from './pricing';
import { romeDateKey, romeWallTimeToUtc } from './romeTime';
import type { City, Deal, Product } from './types';

const roma: City = {
  id: 'roma',
  name: 'Roma',
  minOrderCents: 30000,
  shippingCents: 1200,
  active: true,
  zones: [
    { id: 'tor', name: 'Tor Pignattara', minOrderCents: null, shippingCents: null, active: true },
    { id: 'ostia', name: 'Ostia', minOrderCents: 50000, shippingCents: 2000, active: true },
    { id: 'centro', name: 'Centro Storico', minOrderCents: null, shippingCents: 0, active: true },
  ],
};
const milano: City = { id: 'milano', name: 'Milano', minOrderCents: null, shippingCents: 4500, active: true, zones: [] };

describe('minimum order (MIN)', () => {
  it('uses zone, then city, then global', () => {
    expect(resolveMinimum(roma, 'tor', 80000)).toEqual({ cents: 30000, from: 'city' });
    expect(resolveMinimum(roma, 'ostia', 80000)).toEqual({ cents: 50000, from: 'zone' });
    expect(resolveMinimum(milano, undefined, 80000)).toEqual({ cents: 80000, from: 'global' });
  });
});

describe('shipping (ZONE)', () => {
  it('inherits the city fee unless the zone sets one; 0 is free, not inherit', () => {
    expect(resolveShipping(roma, 'tor').cents).toBe(1200);
    expect(resolveShipping(roma, 'ostia').cents).toBe(2000);
    expect(resolveShipping(roma, 'centro')).toEqual({ cents: 0, from: 'zone' });
  });
});

describe('VAT summary (VAT-04, VAT-06)', () => {
  it('matches the worked example in the spec (€357.88)', () => {
    const t = orderTotals(
      [
        { netCents: 10680, vatPercent: 4 },
        { netCents: 19200, vatPercent: 10 },
        { netCents: 1850, vatPercent: 22 },
      ],
      1200,
    );
    expect(t.subtotalCents).toBe(31730);
    expect(t.vat).toEqual([
      { percent: 4, baseCents: 11084, vatCents: 443 },
      { percent: 10, baseCents: 19926, vatCents: 1993 },
      { percent: 22, baseCents: 1920, vatCents: 422 },
    ]);
    expect(t.totalCents).toBe(35788);
  });
  it('allocation always sums exactly', () => {
    expect(allocate(1000, [1, 1, 1]).reduce((a, b) => a + b)).toBe(1000);
  });
  it('charges no shipping on an empty cart', () => {
    expect(orderTotals([], 1200).totalCents).toBe(0);
  });
});

describe('sale vs tier (PRICE)', () => {
  const rice: Product = {
    id: 'p1', sku: 'RIC', category: 'grain', name: { en: 'Rice', it: 'Riso' }, pack: { en: '', it: '' },
    tiers: [3840, 3690, 3520], stock: 100, vatRateId: 'v10', icon: 'wheat', active: true,
    description: { en: '', it: '' }, image: null, expiryDate: null, brand: '', origin: '', ean: '',
  };
  const deal: Deal = {
    id: 'd1', productId: 'p1', date: '2026-03-29', priceCents: 3072, perResellerLimit: 20,
    stockCap: null, sold: 0, featured: true, sort: 0, cancelled: false,
  };
  it('uses tiers without a deal and the flat sale price with one', () => {
    const bands = { starts: [3, 21, 41] };
    expect(unitPrice(rice, 12, undefined, bands)).toEqual({ unitCents: 3840, source: 'tier_1' });
    expect(unitPrice(rice, 21, undefined, bands)).toEqual({ unitCents: 3690, source: 'tier_2' });
    expect(unitPrice(rice, 60, deal, bands)).toEqual({ unitCents: 3072, source: 'deal:d1' });
  });
  it('is live 08:00–23:59:59 Rome time, including on the DST change day', () => {
    // 29 Mar 2026: clocks go forward in Italy, so 08:00 Rome = 06:00 UTC.
    expect(romeWallTimeToUtc('2026-03-29', '08:00:00').toISOString()).toBe('2026-03-29T06:00:00.000Z');
    expect(isDealLive(deal, new Date('2026-03-29T05:59:59Z'))).toBe(false);
    expect(isDealLive(deal, new Date('2026-03-29T06:00:00Z'))).toBe(true);
    expect(isDealLive(deal, new Date('2026-03-29T21:59:59Z'))).toBe(true); // 23:59:59 CEST
    expect(isDealLive(deal, new Date('2026-03-29T22:00:00Z'))).toBe(false);
    expect(romeDateKey(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
  });
  it('limits cases per reseller per day and by stock cap', () => {
    expect(dealAllowance(deal, 15)).toBe(5);
    expect(dealAllowance({ ...deal, stockCap: 50, sold: 48 }, 0)).toBe(2);
  });
});

describe('quantity bands (Settings › Pricing)', () => {
  const b = { starts: [3, 21, 41] };
  it('labels and finds the band for a quantity', () => {
    expect(bandLabels(b)).toEqual(['3–20', '21–40', '41+']);
    expect([3, 20, 21, 40, 41, 500].map((q) => bandIndex(q, b))).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it('fits product prices to the number of bands', () => {
    expect(fitTiers([100, 90], 4)).toEqual([100, 90, 90, 90]);
    expect(fitTiers([100, 90, 80], 2)).toEqual([100, 90]);
  });
  it('rejects bands that do not increase', () => {
    expect(validateBands({ starts: [3, 21, 41] })).toBeNull();
    expect(validateBands({ starts: [3, 3, 41] })).toBe('bands_order');
    expect(validateBands({ starts: [0, 10] })).toBe('bands_invalid');
    expect(validateBands({ starts: [5] })).toBe('bands_count');
  });
});
