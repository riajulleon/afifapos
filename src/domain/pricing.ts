// Business rules from the specification: MIN, ZONE, PRICE and VAT. Pure functions, unit-tested.
import { roundHalfUp } from './money';
import { dealWindow } from './romeTime';
import type { City, Deal, PriceSource, Product, VatSummaryRow } from './types';

/* ---------- MIN / ZONE: zone → city → global ---------- */

export interface ResolvedRule {
  cents: number;
  from: 'zone' | 'city' | 'global';
}

export function resolveMinimum(city: City, zoneId: string | undefined, globalMinCents: number): ResolvedRule {
  const zone = city.zones.find((z) => z.id === zoneId);
  if (zone && zone.minOrderCents !== null) return { cents: zone.minOrderCents, from: 'zone' };
  if (city.minOrderCents !== null) return { cents: city.minOrderCents, from: 'city' };
  return { cents: globalMinCents, from: 'global' };
}

export function resolveShipping(city: City, zoneId: string | undefined): ResolvedRule {
  const zone = city.zones.find((z) => z.id === zoneId);
  if (zone && zone.shippingCents !== null) return { cents: zone.shippingCents, from: 'zone' };
  return { cents: city.shippingCents, from: 'city' };
}

/* ---------- PRICE: sale replaces tiers while a deal is live ---------- */

export function tierIndex(qty: number): 0 | 1 | 2 {
  return qty >= 50 ? 2 : qty >= 10 ? 1 : 0;
}

export function isDealLive(deal: Deal, now: Date): boolean {
  if (deal.cancelled) return false;
  if (deal.stockCap !== null && deal.sold >= deal.stockCap) return false;
  const { start, end } = dealWindow(deal.date);
  return now >= start && now < end;
}

export function liveDealFor(productId: string, deals: Deal[], now: Date): Deal | undefined {
  return deals.find((d) => d.productId === productId && isDealLive(d, now));
}

export interface UnitPrice {
  unitCents: number;
  source: PriceSource;
}

/** PRICE-01: live deal → flat sale price at any quantity; otherwise the tier for the quantity. */
export function unitPrice(product: Product, qty: number, deal: Deal | undefined): UnitPrice {
  if (deal) return { unitCents: deal.priceCents, source: `deal:${deal.id}` };
  const t = tierIndex(qty);
  return { unitCents: product.tiers[t], source: (['tier_1', 'tier_2', 'tier_3'] as const)[t] };
}

/**
 * PRICE-02/03: how many more cases this reseller may still buy at the sale price today,
 * counting cases already ordered on the deal day. Stock cap also applies (PRICE-04).
 */
export function dealAllowance(deal: Deal, alreadyBoughtToday: number): number {
  const byLimit = Math.max(0, deal.perResellerLimit - alreadyBoughtToday);
  const byStock = deal.stockCap === null ? Infinity : Math.max(0, deal.stockCap - deal.sold);
  return Math.min(byLimit, byStock);
}

/* ---------- VAT: per rate on the total base, shipping split by value (VAT-04, VAT-06) ---------- */

export interface VatLine {
  netCents: number;
  vatPercent: number;
}

/** Splits `amount` across weights with the largest-remainder method so the parts always sum exactly. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || amount === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const floors = raw.map(Math.floor);
  let rest = amount - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}

export function vatSummary(lines: VatLine[], shippingCents: number): VatSummaryRow[] {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vatPercent, (byRate.get(l.vatPercent) ?? 0) + l.netCents);
  const rates = [...byRate.keys()].sort((a, b) => a - b);
  const bases = rates.map((r) => byRate.get(r)!);
  const shipParts = allocate(shippingCents, bases);
  return rates.map((percent, i) => {
    const baseCents = bases[i] + shipParts[i];
    return { percent, baseCents, vatCents: roundHalfUp((baseCents * percent) / 100) };
  });
}

export interface Totals {
  subtotalCents: number;
  shippingCents: number;
  vat: VatSummaryRow[];
  vatCents: number;
  totalCents: number;
}

export function orderTotals(lines: VatLine[], shippingCents: number): Totals {
  const subtotalCents = lines.reduce((a, l) => a + l.netCents, 0);
  const ship = lines.length ? shippingCents : 0;
  const vat = vatSummary(lines, ship);
  const vatCents = vat.reduce((a, r) => a + r.vatCents, 0);
  return { subtotalCents, shippingCents: ship, vat, vatCents, totalCents: subtotalCents + ship + vatCents };
}
