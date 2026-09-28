// Reports hub (REP). Pure functions over the order book, so every report is testable and the API only adds
// the permission check. Money is cents excl. VAT unless a column says otherwise. Dates are Rome dates.
import { addDays } from './romeTime';
import type { Category, CommissionEntry, Lang, Order, Payout, Product, User } from './types';

export const REPORT_TYPES = ['sales', 'revenue', 'orders', 'resellers', 'team', 'commission', 'products'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type Fmt = 'text' | 'eur' | 'int' | 'pct' | 'date' | 'hours' | 'status' | 'pay' | 'channel' | 'comm';
export type Grain = 'day' | 'week' | 'month';

export interface Kpi { key: string; value: number; fmt: Fmt }
export interface Series { key: string; values: number[] }
export interface Item { label: string; value: number; i18n?: boolean }

export type Chart =
  | { kind: 'line'; key: string; fmt: Fmt; buckets: string[]; series: Series[] }
  | { kind: 'bar'; key: string; fmt: Fmt; buckets: string[]; series: Series[]; stacked: boolean }
  | { kind: 'hbar'; key: string; fmt: Fmt; items: Item[] }
  | { kind: 'donut'; key: string; fmt: Fmt; items: Item[] };

export interface Column { key: string; fmt: Fmt }
export type Cell = string | number | null;

export interface Report {
  type: ReportType;
  from: string;
  to: string;
  grain: Grain;
  kpis: Kpi[];
  charts: Chart[];
  columns: Column[];
  rows: Cell[][];
  totals: Cell[] | null;
  /** Row links: order ids, reseller ids or staff ids, same order as rows. */
  links?: (string | null)[];
}

export interface ReportInput {
  orders: Order[];
  users: User[];
  products: Product[];
  categories: Category[];
  commissions: CommissionEntry[];
  payouts: Payout[];
  from: string;
  to: string;
  /** Language for product and category names. */
  lang?: Lang;
}

/* ---------- buckets ---------- */

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export function grainFor(from: string, to: string): Grain {
  const n = daysBetween(from, to) + 1;
  return n <= 45 ? 'day' : n <= 190 ? 'week' : 'month';
}

/** Bucket keys covering the range: dates for day/week (week = 7-day block from `from`), YYYY-MM for month. */
export function buckets(from: string, to: string, grain: Grain): string[] {
  const out: string[] = [];
  if (grain === 'month') {
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) out.push(m);
    return out;
  }
  const step = grain === 'day' ? 1 : 7;
  for (let d = from; d <= to; d = addDays(d, step)) out.push(d);
  return out;
}

export function bucketOf(date: string, from: string, grain: Grain): string {
  if (grain === 'month') return date.slice(0, 7);
  if (grain === 'day') return date;
  return addDays(from, Math.floor(daysBetween(from, date) / 7) * 7);
}

function sumBy<T>(xs: T[], f: (x: T) => number) {
  return xs.reduce((a, x) => a + f(x), 0);
}

function seriesBy(orders: Order[], keys: string[], from: string, grain: Grain, value: (o: Order) => number): number[] {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const out = keys.map(() => 0);
  for (const o of orders) {
    const i = idx.get(bucketOf(o.romeDate, from, grain));
    if (i !== undefined) out[i] += value(o);
  }
  return out;
}

const cases = (o: Order) => sumBy(o.lines, (l) => l.qty);
const paidOf = (o: Order) => sumBy(o.payments, (p) => p.amountCents);
const vatOf = (o: Order) => sumBy(o.vat, (r) => r.vatCents);
const goodsBefore = (o: Order) => sumBy(o.lines, (l) => l.lineCents);

/* ---------- reports ---------- */

export function buildReport(type: ReportType, input: ReportInput): Report {
  const { from, to } = input;
  const grain = grainFor(from, to);
  const keys = buckets(from, to, grain);
  const inRange = input.orders.filter((o) => o.romeDate >= from && o.romeDate <= to);
  const sold = inRange.filter((o) => o.status !== 'cancelled');
  const staffName = (id?: string | null) => input.users.find((u) => u.id === id)?.fullName ?? '—';
  const base = { type, from, to, grain };

  switch (type) {
    case 'sales': {
      const net = sumBy(sold, (o) => o.subtotalCents);
      const online = sold.filter((o) => o.channel !== 'pos');
      const pos = sold.filter((o) => o.channel === 'pos');
      const byCity = new Map<string, number>();
      sold.forEach((o) => byCity.set(o.cityName, (byCity.get(o.cityName) ?? 0) + o.subtotalCents));
      const rows = keys.map((k) => {
        const xs = sold.filter((o) => bucketOf(o.romeDate, from, grain) === k);
        return [k, xs.length, sumBy(xs, cases), sumBy(xs, goodsBefore), sumBy(xs, (o) => o.discount?.cents ?? 0), sumBy(xs, (o) => o.subtotalCents), sumBy(xs.filter((o) => o.channel !== 'pos'), (o) => o.subtotalCents), sumBy(xs.filter((o) => o.channel === 'pos'), (o) => o.subtotalCents)];
      });
      return {
        ...base,
        kpis: [
          { key: 'netSales', value: net, fmt: 'eur' },
          { key: 'orders', value: sold.length, fmt: 'int' },
          { key: 'avgOrder', value: sold.length ? Math.round(net / sold.length) : 0, fmt: 'eur' },
          { key: 'cases', value: sumBy(sold, cases), fmt: 'int' },
          { key: 'discounts', value: sumBy(sold, (o) => o.discount?.cents ?? 0), fmt: 'eur' },
          { key: 'posShare', value: net ? sumBy(pos, (o) => o.subtotalCents) / net : 0, fmt: 'pct' },
        ],
        charts: [
          { kind: 'bar', key: 'salesByChannel', fmt: 'eur', buckets: keys, stacked: true, series: [
            { key: 'online', values: seriesBy(online, keys, from, grain, (o) => o.subtotalCents) },
            { key: 'pos', values: seriesBy(pos, keys, from, grain, (o) => o.subtotalCents) },
          ] },
          { kind: 'donut', key: 'salesByCity', fmt: 'eur', items: [...byCity].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })) },
        ],
        columns: [{ key: 'period', fmt: 'date' }, { key: 'orders', fmt: 'int' }, { key: 'cases', fmt: 'int' }, { key: 'goods', fmt: 'eur' }, { key: 'discounts', fmt: 'eur' }, { key: 'netSales', fmt: 'eur' }, { key: 'online', fmt: 'eur' }, { key: 'pos', fmt: 'eur' }],
        rows,
        totals: ['', ...[1, 2, 3, 4, 5, 6, 7].map((i) => sumBy(rows, (r) => r[i] as number))],
      };
    }

    case 'revenue': {
      const payments = input.orders.flatMap((o) => o.payments.map((p) => ({ ...p, order: o }))).filter((p) => p.receivedOn >= from && p.receivedOn <= to);
      const byKind = new Map<string, number>();
      payments.forEach((p) => byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + p.amountCents));
      const collectedSeries = keys.map((k) => sumBy(payments.filter((p) => bucketOf(p.receivedOn, from, grain) === k), (p) => p.amountCents));
      const rows = keys.map((k, i) => {
        const xs = sold.filter((o) => bucketOf(o.romeDate, from, grain) === k);
        return [k, sumBy(xs, (o) => o.subtotalCents), sumBy(xs, (o) => o.shippingCents), sumBy(xs, vatOf), sumBy(xs, (o) => o.totalCents), collectedSeries[i]];
      });
      const vatByRate = new Map<number, number>();
      sold.forEach((o) => o.vat.forEach((r) => vatByRate.set(r.percent, (vatByRate.get(r.percent) ?? 0) + r.vatCents)));
      return {
        ...base,
        kpis: [
          { key: 'invoiced', value: sumBy(sold, (o) => o.totalCents), fmt: 'eur' },
          { key: 'netSales', value: sumBy(sold, (o) => o.subtotalCents), fmt: 'eur' },
          { key: 'vat', value: sumBy(sold, vatOf), fmt: 'eur' },
          { key: 'shipping', value: sumBy(sold, (o) => o.shippingCents), fmt: 'eur' },
          { key: 'collected', value: sumBy(payments, (p) => p.amountCents), fmt: 'eur' },
          { key: 'outstanding', value: sumBy(sold, (o) => Math.max(0, o.totalCents - paidOf(o))), fmt: 'eur' },
        ],
        charts: [
          { kind: 'bar', key: 'invoicedVsCollected', fmt: 'eur', buckets: keys, stacked: false, series: [
            { key: 'invoiced', values: seriesBy(sold, keys, from, grain, (o) => o.totalCents) },
            { key: 'collected', values: collectedSeries },
          ] },
          { kind: 'donut', key: 'collectedByMethod', fmt: 'eur', items: [...byKind].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: `admin.pay.kind.${label}`, value, i18n: true })) },
          { kind: 'hbar', key: 'vatByRate', fmt: 'eur', items: [...vatByRate].sort((a, b) => b[0] - a[0]).map(([p, value]) => ({ label: `${p}%`, value })) },
        ],
        columns: [{ key: 'period', fmt: 'date' }, { key: 'netSales', fmt: 'eur' }, { key: 'shipping', fmt: 'eur' }, { key: 'vat', fmt: 'eur' }, { key: 'invoiced', fmt: 'eur' }, { key: 'collected', fmt: 'eur' }],
        rows,
        totals: ['', ...[1, 2, 3, 4, 5].map((i) => sumBy(rows, (r) => r[i] as number))],
      };
    }

    case 'orders': {
      const byStatus = new Map<string, number>();
      inRange.forEach((o) => byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1));
      const delivered = inRange.map((o) => {
        const a = o.history.find((h) => h.status === 'received')?.at;
        const b = o.history.find((h) => h.status === 'delivered')?.at;
        return a && b ? (Date.parse(b) - Date.parse(a)) / 3600000 : null;
      }).filter((h): h is number => h !== null);
      const cancelled = inRange.length - sold.length;
      const list = [...inRange].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
      return {
        ...base,
        kpis: [
          { key: 'orders', value: inRange.length, fmt: 'int' },
          { key: 'cancelled', value: cancelled, fmt: 'int' },
          { key: 'cancelRate', value: inRange.length ? cancelled / inRange.length : 0, fmt: 'pct' },
          { key: 'avgLines', value: inRange.length ? Math.round((sumBy(inRange, (o) => o.lines.length) / inRange.length) * 10) / 10 : 0, fmt: 'int' },
          { key: 'toDeliver', value: delivered.length ? sumBy(delivered, (h) => h) / delivered.length : 0, fmt: 'hours' },
          { key: 'awaitingPay', value: sold.filter((o) => o.paymentStatus !== 'paid').length, fmt: 'int' },
        ],
        charts: [
          { kind: 'bar', key: 'ordersByChannel', fmt: 'int', buckets: keys, stacked: true, series: [
            { key: 'online', values: seriesBy(inRange.filter((o) => o.channel !== 'pos'), keys, from, grain, () => 1) },
            { key: 'pos', values: seriesBy(inRange.filter((o) => o.channel === 'pos'), keys, from, grain, () => 1) },
          ] },
          { kind: 'donut', key: 'ordersByStatus', fmt: 'int', items: (['received', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).filter((s) => byStatus.get(s)).map((s) => ({ label: `status.${s}`, value: byStatus.get(s)!, i18n: true })) },
        ],
        columns: [{ key: 'order', fmt: 'text' }, { key: 'date', fmt: 'date' }, { key: 'customer', fmt: 'text' }, { key: 'city', fmt: 'text' }, { key: 'channel', fmt: 'channel' }, { key: 'status', fmt: 'status' }, { key: 'payment', fmt: 'pay' }, { key: 'total', fmt: 'eur' }],
        rows: list.map((o) => [o.number, o.romeDate, o.businessName, o.cityName, o.channel, o.status, o.paymentStatus, o.totalCents]),
        links: list.map((o) => o.id),
        totals: ['', '', '', '', '', '', '', sumBy(list, (o) => o.totalCents)],
      };
    }

    case 'resellers': {
      const resellers = input.users.filter((u) => u.role === 'reseller' && u.state !== 'pending' && u.state !== 'info_requested' && u.state !== 'rejected');
      const stats = resellers.map((u) => {
        const xs = sold.filter((o) => o.userId === u.id);
        const net = sumBy(xs, (o) => o.subtotalCents);
        const last = input.orders.filter((o) => o.userId === u.id && o.status !== 'cancelled').map((o) => o.romeDate).sort().pop() ?? '';
        const owed = sumBy(input.orders.filter((o) => o.userId === u.id && o.status !== 'cancelled'), (o) => Math.max(0, o.totalCents - paidOf(o)));
        return { u, n: xs.length, net, last, owed };
      }).sort((a, b) => b.net - a.net);
      const total = sumBy(stats, (s) => s.net);
      const active = stats.filter((s) => s.n > 0);
      return {
        ...base,
        kpis: [
          { key: 'activeResellers', value: active.length, fmt: 'int' },
          { key: 'newResellers', value: resellers.filter((u) => u.createdAt.slice(0, 10) >= from && u.createdAt.slice(0, 10) <= to).length, fmt: 'int' },
          { key: 'netSales', value: total, fmt: 'eur' },
          { key: 'perReseller', value: active.length ? Math.round(total / active.length) : 0, fmt: 'eur' },
          { key: 'topShare', value: total ? (stats[0]?.net ?? 0) / total : 0, fmt: 'pct' },
          { key: 'outstanding', value: sumBy(stats, (s) => s.owed), fmt: 'eur' },
        ],
        charts: [{ kind: 'hbar', key: 'topResellers', fmt: 'eur', items: active.slice(0, 10).map((s) => ({ label: s.u.businessName, value: s.net })) }],
        columns: [{ key: 'customer', fmt: 'text' }, { key: 'city', fmt: 'text' }, { key: 'poc', fmt: 'text' }, { key: 'orders', fmt: 'int' }, { key: 'netSales', fmt: 'eur' }, { key: 'avgOrder', fmt: 'eur' }, { key: 'share', fmt: 'pct' }, { key: 'lastOrder', fmt: 'date' }, { key: 'outstanding', fmt: 'eur' }],
        rows: stats.map((s) => [s.u.businessName, input.orders.find((o) => o.userId === s.u.id)?.cityName ?? s.u.cityId, staffName(s.u.pocId), s.n, s.net, s.n ? Math.round(s.net / s.n) : 0, total ? s.net / total : 0, s.last, s.owed]),
        links: stats.map((s) => s.u.id),
        totals: ['', '', '', sumBy(stats, (s) => s.n), total, null, 1, '', sumBy(stats, (s) => s.owed)],
      };
    }

    case 'team': {
      const staff = input.users.filter((u) => u.role === 'staff' && (input.users.some((r) => r.pocId === u.id) || input.orders.some((o) => o.pocId === u.id)));
      const total = sumBy(sold, (o) => o.subtotalCents);
      const stats = staff.map((u) => {
        const xs = sold.filter((o) => o.pocId === u.id);
        const entries = input.commissions.filter((e) => e.staffId === u.id && e.romeDate >= from && e.romeDate <= to && e.status !== 'void');
        return {
          u, n: xs.length, net: sumBy(xs, (o) => o.subtotalCents),
          resellers: input.users.filter((r) => r.pocId === u.id).length,
          earned: sumBy(entries, (e) => e.amountCents),
          paid: sumBy(input.payouts.filter((p) => p.staffId === u.id && p.paidOn >= from && p.paidOn <= to), (p) => p.amountCents),
        };
      }).sort((a, b) => b.net - a.net);
      const covered = sumBy(stats, (s) => s.net);
      return {
        ...base,
        kpis: [
          { key: 'teamSales', value: covered, fmt: 'eur' },
          { key: 'coverage', value: total ? covered / total : 0, fmt: 'pct' },
          { key: 'teamOrders', value: sumBy(stats, (s) => s.n), fmt: 'int' },
          { key: 'commissionEarned', value: sumBy(stats, (s) => s.earned), fmt: 'eur' },
          { key: 'commissionPaid', value: sumBy(stats, (s) => s.paid), fmt: 'eur' },
        ],
        charts: [
          { kind: 'bar', key: 'teamSalesTrend', fmt: 'eur', buckets: keys, stacked: true, series: stats.map((s) => ({ key: s.u.fullName, values: seriesBy(sold.filter((o) => o.pocId === s.u.id), keys, from, grain, (o) => o.subtotalCents) })) },
          { kind: 'hbar', key: 'salesByMember', fmt: 'eur', items: stats.map((s) => ({ label: s.u.fullName, value: s.net })) },
        ],
        columns: [{ key: 'member', fmt: 'text' }, { key: 'resellers', fmt: 'int' }, { key: 'orders', fmt: 'int' }, { key: 'netSales', fmt: 'eur' }, { key: 'rate', fmt: 'pct' }, { key: 'commissionEarned', fmt: 'eur' }, { key: 'commissionPaid', fmt: 'eur' }],
        rows: stats.map((s) => [s.u.fullName, s.resellers, s.n, s.net, (s.u.commissionPct ?? 0) / 100, s.earned, s.paid]),
        links: stats.map((s) => s.u.id),
        totals: ['', sumBy(stats, (s) => s.resellers), sumBy(stats, (s) => s.n), covered, null, sumBy(stats, (s) => s.earned), sumBy(stats, (s) => s.paid)],
      };
    }

    case 'commission': {
      const entries = input.commissions.filter((e) => e.romeDate >= from && e.romeDate <= to).sort((a, b) => b.romeDate.localeCompare(a.romeDate));
      const live = entries.filter((e) => e.status !== 'void');
      const members = [...new Set(live.map((e) => e.staffId))];
      const by = (st: CommissionEntry['status']) => members.map((id) => sumBy(live.filter((e) => e.staffId === id && e.status === st), (e) => e.amountCents));
      return {
        ...base,
        kpis: [
          { key: 'commissionEarned', value: sumBy(live, (e) => e.amountCents), fmt: 'eur' },
          { key: 'payable', value: sumBy(live.filter((e) => e.status === 'payable'), (e) => e.amountCents), fmt: 'eur' },
          { key: 'pending', value: sumBy(live.filter((e) => e.status === 'pending'), (e) => e.amountCents), fmt: 'eur' },
          { key: 'commissionPaid', value: sumBy(input.payouts.filter((p) => p.paidOn >= from && p.paidOn <= to), (p) => p.amountCents), fmt: 'eur' },
        ],
        charts: [
          { kind: 'bar', key: 'commissionByMember', fmt: 'eur', buckets: members.map(staffName), stacked: true, series: [
            { key: 'paid', values: by('paid') }, { key: 'payable', values: by('payable') }, { key: 'pending', values: by('pending') },
          ] },
        ],
        columns: [{ key: 'date', fmt: 'date' }, { key: 'order', fmt: 'text' }, { key: 'customer', fmt: 'text' }, { key: 'member', fmt: 'text' }, { key: 'base', fmt: 'eur' }, { key: 'rate', fmt: 'pct' }, { key: 'amount', fmt: 'eur' }, { key: 'status', fmt: 'comm' }],
        rows: entries.map((e) => [e.romeDate, e.orderNumber, e.businessName, staffName(e.staffId), e.baseCents, e.pct / 100, e.amountCents, e.status]),
        links: entries.map((e) => e.orderId),
        totals: ['', '', '', '', null, null, sumBy(live, (e) => e.amountCents), ''],
      };
    }

    case 'products': {
      const lines = sold.flatMap((o) => o.lines);
      const lang = input.lang ?? 'en';
      const catName = (id: string) => input.categories.find((c) => c.id === id)?.name[lang] ?? id;
      const stats = input.products.map((p) => {
        const ls = lines.filter((l) => l.productId === p.id);
        return { p, qty: sumBy(ls, (l) => l.qty), net: sumBy(ls, (l) => l.lineCents), deal: sumBy(ls.filter((l) => l.source.startsWith('deal:')), (l) => l.qty) };
      }).sort((a, b) => b.net - a.net);
      const total = sumBy(stats, (s) => s.net);
      const byCat = new Map<string, number>();
      stats.forEach((s) => byCat.set(s.p.category, (byCat.get(s.p.category) ?? 0) + s.net));
      return {
        ...base,
        kpis: [
          { key: 'cases', value: sumBy(stats, (s) => s.qty), fmt: 'int' },
          { key: 'goods', value: total, fmt: 'eur' },
          { key: 'productsSold', value: stats.filter((s) => s.qty > 0).length, fmt: 'int' },
          { key: 'dealShare', value: sumBy(stats, (s) => s.qty) ? sumBy(stats, (s) => s.deal) / sumBy(stats, (s) => s.qty) : 0, fmt: 'pct' },
        ],
        charts: [
          { kind: 'hbar', key: 'topProducts', fmt: 'eur', items: stats.filter((s) => s.net).slice(0, 10).map((s) => ({ label: s.p.name[lang], value: s.net })) },
          { kind: 'donut', key: 'salesByCategory', fmt: 'eur', items: [...byCat].filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ label: `cat:${id}`, value })) },
        ],
        columns: [{ key: 'product', fmt: 'text' }, { key: 'sku', fmt: 'text' }, { key: 'category', fmt: 'text' }, { key: 'cases', fmt: 'int' }, { key: 'goods', fmt: 'eur' }, { key: 'avgPrice', fmt: 'eur' }, { key: 'share', fmt: 'pct' }, { key: 'dealCases', fmt: 'int' }, { key: 'stock', fmt: 'int' }],
        rows: stats.map((s) => [s.p.name[lang], s.p.sku, catName(s.p.category), s.qty, s.net, s.qty ? Math.round(s.net / s.qty) : 0, total ? s.net / total : 0, s.deal, s.p.stock]),
        links: stats.map((s) => s.p.id),
        totals: ['', '', '', sumBy(stats, (s) => s.qty), total, null, 1, sumBy(stats, (s) => s.deal), sumBy(stats, (s) => s.p.stock)],
      };
    }
  }
}
