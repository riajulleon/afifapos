import { describe, expect, it } from 'vitest';
import { commissionStatus, syncOrderCommission } from './commission';
import { escapeHtml, fill, renderEmail, unknownVariables } from './email';
import { discountAmount, orderTotals } from './pricing';
import { bucketOf, buckets, grainFor } from './reports';
import type { CommissionEntry, CommissionSettings, Order } from './types';

describe('POS discount', () => {
  it('rounds percent half up and caps fixed at the goods value', () => {
    expect(discountAmount('percent', 5, 10010)).toBe(501); // 500.5 → 501
    expect(discountAmount('fixed', 5000, 3000)).toBe(3000);
    expect(discountAmount('percent', 0, 3000)).toBe(0);
    expect(discountAmount('percent', 150, 3000)).toBe(3000);
  });

  it('splits the discount across VAT rates by value, so totals still add up', () => {
    // €100 at 4% and €100 at 22%, €20 off → €90 + €90 bases.
    const t = orderTotals([{ netCents: 10000, vatPercent: 4 }, { netCents: 10000, vatPercent: 22 }], 0, 2000);
    expect(t.subtotalCents).toBe(18000);
    expect(t.vat).toEqual([{ percent: 4, baseCents: 9000, vatCents: 360 }, { percent: 22, baseCents: 9000, vatCents: 1980 }]);
    expect(t.totalCents).toBe(18000 + 360 + 1980);
  });

  it('never discounts below zero', () => {
    const t = orderTotals([{ netCents: 1000, vatPercent: 22 }], 500, 99999);
    expect(t.subtotalCents).toBe(0);
    expect(t.totalCents).toBe(500 + 110);
  });
});

const rules: CommissionSettings = { defaultPct: 3, payableWhen: 'paid' };
const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1', number: 'AF-1', invoiceNumber: '1', channel: 'online', pocId: 'rep', userId: 'r1', businessName: 'Shop', cityId: 'c', cityName: 'C', zoneName: '', address: '',
  lines: [], subtotalCents: 100000, shippingCents: 0, vat: [], totalCents: 122000, paymentMethodId: 'bank', paymentMethodName: { en: '', it: '' }, paymentInstructions: { en: '', it: '' },
  paymentStatus: 'awaiting', payments: [], status: 'received', history: [], placedAt: '2026-09-01T10:00:00Z', romeDate: '2026-09-01', lang: 'en', emailSentAt: null, ...over,
});
let n = 0;
const id = () => `c${++n}`;
function apply(entries: CommissionEntry[], o: Order, pct = 4) {
  const r = syncOrderCommission(o, entries, pct, rules, id);
  const next = entries.map((e) => r.update.find((u) => u.id === e.id) ?? e);
  return [...next, ...r.add];
}

describe('commission', () => {
  it('is pending until paid, then payable; cancelled is void', () => {
    expect(commissionStatus(order(), rules)).toBe('pending');
    expect(commissionStatus(order({ paymentStatus: 'paid' }), rules)).toBe('payable');
    expect(commissionStatus(order({ status: 'delivered' }), { ...rules, payableWhen: 'delivered' })).toBe('payable');
    expect(commissionStatus(order({ status: 'cancelled', paymentStatus: 'paid' }), rules)).toBe('void');
  });

  it('creates one line, updates it in place, and is idempotent', () => {
    let e = apply([], order());
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ amountCents: 4000, status: 'pending', adjustment: false });
    e = apply(e, order({ paymentStatus: 'paid', subtotalCents: 90000 }));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ amountCents: 3600, status: 'payable' });
    expect(apply(e, order({ paymentStatus: 'paid', subtotalCents: 90000 }))).toEqual(e);
  });

  it('keeps the rate from when the order was placed', () => {
    const e = apply([], order(), 4);
    expect(apply(e, order({ paymentStatus: 'paid' }), 10)[0].amountCents).toBe(4000);
  });

  it('never changes a paid line: edits after payout become adjustments, cancellation a clawback', () => {
    let e = apply([], order({ paymentStatus: 'paid' }));
    e = e.map((x) => ({ ...x, status: 'paid' as const, payoutId: 'po1' }));
    e = apply(e, order({ paymentStatus: 'paid', subtotalCents: 110000 }));
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ status: 'paid', amountCents: 4000 });
    expect(e[1]).toMatchObject({ adjustment: true, amountCents: 400, status: 'payable' });
    e = apply(e, order({ paymentStatus: 'paid', subtotalCents: 110000, status: 'cancelled' }));
    const open = e.filter((x) => x.status === 'payable');
    expect(open).toHaveLength(1);
    expect(open[0].amountCents).toBe(-4000); // paid 4000 back
    expect(apply(e, order({ paymentStatus: 'paid', subtotalCents: 110000, status: 'cancelled' }))).toEqual(e);
  });

  it('voids an unpaid line when the order is cancelled, and skips orders without a contact', () => {
    let e = apply([], order());
    e = apply(e, order({ status: 'cancelled' }));
    expect(e[0].status).toBe('void');
    expect(apply([], order({ pocId: null }))).toEqual([]);
  });
});

describe('report buckets', () => {
  it('picks the grain from the range length', () => {
    expect(grainFor('2026-09-01', '2026-09-30')).toBe('day');
    expect(grainFor('2026-06-01', '2026-09-30')).toBe('week');
    expect(grainFor('2025-10-01', '2026-09-30')).toBe('month');
  });
  it('covers the range and assigns dates to the right bucket', () => {
    expect(buckets('2026-01-30', '2026-03-02', 'month')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(buckets('2026-09-01', '2026-09-15', 'week')).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
    expect(bucketOf('2026-09-10', '2026-09-01', 'week')).toBe('2026-09-08');
  });
});

describe('email rendering', () => {
  it('escapes variable values and leaves unknown ones visible', () => {
    expect(fill('Hi {{customer_name}} {{nope}}', { customer_name: '<b>Ann</b>' })).toBe('Hi &lt;b&gt;Ann&lt;/b&gt; {{nope}}');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
  it('flags variables a template may not use', () => {
    expect(unknownVariables({ subject: '{{order_number}}', blocks: [{ id: 'x', type: 'text', html: '{{receipt_number}}' }] }, 'order_placed')).toEqual(['receipt_number']);
  });
  it('drops unsafe button links', () => {
    const { html } = renderEmail({
      content: { subject: 's', blocks: [{ id: 'b', type: 'button', label: 'Go', url: 'javascript:alert(1)' }] },
      theme: { showLogo: false, accent: '#111111', background: '#ffffff', footer: { en: '', it: '' } }, brandName: 'A', logo: null, lang: 'en', vars: {},
    });
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });
});
