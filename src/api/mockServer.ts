// In-browser stand-in for the Phase 3 API. Same function signatures the real HTTP client will expose;
// state persists in localStorage and changes are broadcast to other tabs (admin alerts, live prices).
import { eur } from '../domain/money';
import { DEFAULT_BANDS, dealAllowance, fitTiers, isDealLive, liveDealFor, minQty, orderTotals, resolveMinimum, resolveShipping, unitPrice, validateBands } from '../domain/pricing';
import { addDays, romeDateKey } from '../domain/romeTime';
import type {
  AccountState, City, Deal, Lang, Order, OrderLine, OrderStatus, PaymentInput, PaymentRecord, PaymentStatus, Product, Settings, UploadedDoc, User, Zone,
} from '../domain/types';
import { createSeed, DB_VERSION, seedSettings, type Db } from '../mock/seed';

const DB_KEY = 'afifa-mockdb';
const SESSION_KEY = 'afifa-session';

export class ApiError extends Error {
  constructor(public code: string, public params: Record<string, string | number> = {}) {
    super(code);
  }
}

/* ---------- storage + events ---------- */

let db: Db = load();

function load(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) {
        parsed.settings.footer ??= structuredClone(seedSettings.footer);
        parsed.settings.pricing ??= { ...DEFAULT_BANDS };
        parsed.settings.saleBanner ??= { image: null, strength: 0.55 };
        return parsed;
      }
    }
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  const fresh = createSeed();
  persist(fresh);
  return fresh;
}

function persist(next: Db = db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode: keep in memory */
  }
}

export type ServerEvent = { type: 'changed' } | { type: 'order-placed'; orderId: string; number: string; business: string; city: string; totalCents: number };

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('afifa-events') : null;
const listeners = new Set<(e: ServerEvent) => void>();

export function subscribe(fn: (e: ServerEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(e: ServerEvent) {
  listeners.forEach((fn) => fn(e));
  channel?.postMessage(e);
}

channel?.addEventListener('message', (msg) => {
  db = load(); // another tab wrote; reload before notifying
  listeners.forEach((fn) => fn(msg.data as ServerEvent));
});

function commit() {
  persist();
  emit({ type: 'changed' });
}

const latency = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
const clone = <T>(x: T): T => structuredClone(x);
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function audit(actor: User | null, action: string) {
  db.audit.unshift({ id: uid('a'), at: new Date().toISOString(), actor: actor?.fullName ?? 'System', action });
}

/* ---------- session ---------- */

function sessionUser(): User | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    return db.users.find((u) => u.id === id) ?? null;
  } catch {
    return null;
  }
}

function requireUser(): User {
  const u = sessionUser();
  if (!u) throw new ApiError('unauthenticated');
  return u;
}

function requireApproved(): User {
  const u = requireUser();
  if (u.state !== 'approved') throw new ApiError('not_approved');
  return u;
}

function requireAdmin(): User {
  const u = requireUser();
  if (u.role === 'reseller') throw new ApiError('forbidden');
  return u;
}

const failed = new Map<string, { count: number; until: number }>();

export async function login(identifier: string, password: string): Promise<User> {
  await latency();
  const id = identifier.trim().toLowerCase();
  const digits = id.replace(/\D/g, '').replace(/^39(?=3\d{8,9}$)/, '');
  const lock = failed.get(id);
  if (lock && lock.until > Date.now()) throw new ApiError('locked', { minutes: Math.ceil((lock.until - Date.now()) / 60000) });
  const user = db.users.find((u) => u.email.toLowerCase() === id || (digits.length >= 9 && u.mobile === digits));
  if (!user || user.password !== password) {
    const f = { count: (lock?.count ?? 0) + 1, until: 0 };
    if (f.count >= 5) f.until = Date.now() + 15 * 60000; // AUTH-05
    failed.set(id, f);
    throw new ApiError('invalid_credentials');
  }
  if (user.state === 'rejected') throw new ApiError('rejected');
  if (user.state === 'suspended') throw new ApiError('suspended');
  failed.delete(id);
  localStorage.setItem(SESSION_KEY, user.id);
  return clone(user);
}

export async function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export async function me(): Promise<User | null> {
  const u = sessionUser();
  return u ? clone(u) : null;
}

export async function setMyLang(lang: Lang) {
  const u = sessionUser();
  if (u) {
    u.lang = lang;
    persist();
  }
}

export interface ApplicationInput {
  fullName: string; businessName: string; address: string; cityId: string; zoneId: string;
  email: string; mobile: string; password: string; vatNumber: string; fiscalCode: string; sdiOrPec: string;
  licenceDoc: UploadedDoc; vatDoc: UploadedDoc; lang: Lang;
}

export async function apply(input: ApplicationInput): Promise<User> {
  await latency();
  const email = input.email.trim().toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === email)) throw new ApiError('email_taken');
  if (db.users.some((u) => u.mobile === input.mobile)) throw new ApiError('mobile_taken');
  const user: User = { ...input, email, id: uid('u'), role: 'reseller', state: 'pending', createdAt: new Date().toISOString() };
  db.users.push(user);
  localStorage.setItem(SESSION_KEY, user.id);
  commit();
  return clone(user);
}

export async function resubmit(docs: { licenceDoc?: UploadedDoc; vatDoc?: UploadedDoc }) {
  await latency();
  const u = requireUser();
  if (u.state !== 'info_requested') throw new ApiError('forbidden');
  Object.assign(u, docs, { state: 'pending' as AccountState });
  commit();
}

/* ---------- public catalog ---------- */

export interface PublicSettings {
  branding: Settings['branding'];
  vatRates: Settings['vatRates'];
  paymentMethods: Settings['paymentMethods'];
  globalMinOrderCents: number;
  footer: Settings['footer'];
  pricing: Settings['pricing'];
  saleBanner: Settings['saleBanner'];
}

export async function publicSettings(): Promise<PublicSettings> {
  const s = db.settings;
  return clone({
    branding: s.branding,
    vatRates: s.vatRates,
    paymentMethods: s.paymentMethods.filter((m) => m.enabled).sort((a, b) => a.sort - b.sort),
    globalMinOrderCents: s.globalMinOrderCents,
    footer: s.footer,
    pricing: s.pricing,
    saleBanner: s.saleBanner,
  });
}

export async function serverTime(): Promise<string> {
  return new Date().toISOString();
}

export async function cities(): Promise<City[]> {
  return clone(db.cities.filter((c) => c.active).map((c) => ({ ...c, zones: c.zones.filter((z) => z.active) })));
}

export async function products(): Promise<Product[]> {
  await latency();
  requireApproved();
  return clone(db.products.filter((p) => p.active));
}

/** Deals for a Rome date (default today). Resellers only get today's; admins can ask for any. */
export async function deals(date?: string): Promise<Deal[]> {
  await latency();
  const u = requireUser();
  const day = date ?? romeDateKey();
  if (u.role === 'reseller' && day !== romeDateKey()) throw new ApiError('forbidden');
  return clone(db.deals.filter((d) => d.date === day && !d.cancelled).sort((a, b) => a.sort - b.sort));
}

/**
 * Best sellers across all resellers: cases ordered in the last `days` Rome days, cancelled orders excluded.
 * Resellers only get the ranking, not the volumes, since other resellers' sales are commercially sensitive.
 */
export async function topSellers(days = 30): Promise<{ productId: string; rank: number }[]> {
  await latency();
  requireApproved();
  const since = addDays(romeDateKey(), -days);
  const cases = new Map<string, number>();
  for (const o of db.orders) {
    if (o.status === 'cancelled' || o.romeDate <= since) continue;
    for (const l of o.lines) cases.set(l.productId, (cases.get(l.productId) ?? 0) + l.qty);
  }
  const active = new Set(db.products.filter((p) => p.active).map((p) => p.id));
  return [...cases.entries()]
    .filter(([id]) => active.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([productId], i) => ({ productId, rank: i + 1 }));
}

/** Cases of each deal product this reseller already ordered today (PRICE-02). */
export async function boughtToday(): Promise<Record<string, number>> {
  const u = requireApproved();
  return countBoughtToday(u.id);
}

function countBoughtToday(userId: string): Record<string, number> {
  const today = romeDateKey();
  const out: Record<string, number> = {};
  for (const o of db.orders) {
    if (o.userId !== userId || o.romeDate !== today || o.status === 'cancelled') continue;
    for (const l of o.lines) if (l.source.startsWith('deal:')) out[l.productId] = (out[l.productId] ?? 0) + l.qty;
  }
  return out;
}

/* ---------- orders ---------- */

export async function placeOrder(input: { items: { productId: string; qty: number }[]; paymentMethodId: string }): Promise<Order> {
  await latency();
  const u = requireApproved();
  const now = new Date();
  const city = db.cities.find((c) => c.id === u.cityId);
  if (!city) throw new ApiError('no_city');
  const zone: Zone | undefined = city.zones.find((z) => z.id === u.zoneId);
  const pm = db.settings.paymentMethods.find((m) => m.id === input.paymentMethodId && m.enabled);
  if (!pm) throw new ApiError('payment_method');
  const bought = countBoughtToday(u.id);

  // Server re-prices everything (PRICE-01) and re-checks limits and the minimum (MIN-05).
  const lines = input.items.filter((i) => i.qty > 0).map((i) => {
    const p = db.products.find((x) => x.id === i.productId && x.active);
    if (!p) throw new ApiError('product_gone');
    if (i.qty < minQty(db.settings.pricing)) throw new ApiError('below_moq', { name: p.name.en, n: minQty(db.settings.pricing) });
    if (i.qty > p.stock) throw new ApiError('stock', { name: p.name.en, left: p.stock });
    const deal = liveDealFor(p.id, db.deals, now);
    if (deal && i.qty > dealAllowance(deal, bought[p.id] ?? 0)) throw new ApiError('deal_limit', { name: p.name.en, left: dealAllowance(deal, bought[p.id] ?? 0) });
    const price = unitPrice(p, i.qty, deal, db.settings.pricing);
    const vatPercent = db.settings.vatRates.find((v) => v.id === p.vatRateId)?.percent ?? 22;
    return { productId: p.id, sku: p.sku, name: p.name, pack: p.pack, qty: i.qty, unitCents: price.unitCents, source: price.source, vatPercent, lineCents: price.unitCents * i.qty, deal };
  });
  if (!lines.length) throw new ApiError('empty');
  const ship = resolveShipping(city, u.zoneId).cents;
  const t = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), ship);
  const min = resolveMinimum(city, u.zoneId, db.settings.globalMinOrderCents);
  if (t.subtotalCents < min.cents) throw new ApiError('below_minimum', { min: eur(min.cents, u.lang), city: city.name });

  const romeDate = romeDateKey(now);
  const year = romeDate.slice(0, 4);
  db.orderSeq += 1;
  db.invoiceSeq[year] = (db.invoiceSeq[year] ?? 0) + 1; // INV-01: taken in the same step as the order
  for (const l of lines) {
    const p = db.products.find((x) => x.id === l.productId)!;
    p.stock -= l.qty;
    if (l.deal) l.deal.sold += l.qty;
  }
  const order: Order = {
    id: uid('o'),
    number: `AF-${year}-${String(db.orderSeq).padStart(5, '0')}`,
    invoiceNumber: `${db.settings.business.invoicePrefix}${year}/${String(db.invoiceSeq[year]).padStart(6, '0')}`,
    userId: u.id,
    businessName: u.businessName,
    cityId: city.id,
    cityName: city.name,
    zoneName: zone?.name ?? '',
    address: u.address,
    lines: lines.map(({ deal: _deal, ...l }) => l),
    subtotalCents: t.subtotalCents,
    shippingCents: t.shippingCents,
    vat: t.vat,
    totalCents: t.totalCents,
    paymentMethodId: pm.id,
    paymentMethodName: pm.name,
    paymentInstructions: pm.instructions,
    paymentStatus: 'awaiting',
    payments: [],
    status: 'received',
    history: [{ status: 'received', at: now.toISOString() }],
    placedAt: now.toISOString(),
    romeDate,
    lang: u.lang,
    emailSentAt: now.toISOString(), // INV-07: the real API queues the invoice email here
  };
  db.orders.unshift(order);
  persist();
  emit({ type: 'order-placed', orderId: order.id, number: order.number, business: u.businessName, city: city.name, totalCents: order.totalCents });
  emit({ type: 'changed' });
  return clone(order);
}

export async function myOrders(): Promise<Order[]> {
  await latency();
  const u = requireUser();
  return clone(db.orders.filter((o) => o.userId === u.id));
}

export async function order(id: string): Promise<Order> {
  await latency();
  const u = requireUser();
  const o = db.orders.find((x) => x.id === id);
  if (!o || (u.role === 'reseller' && o.userId !== u.id)) throw new ApiError('not_found'); // INV-05
  return clone(o);
}

export async function sellerDetails() {
  requireUser();
  return clone({ business: db.settings.business, branding: db.settings.branding });
}

/* ---------- admin ---------- */

export async function adminOrders(): Promise<Order[]> {
  await latency();
  requireAdmin();
  return clone(db.orders);
}

const FLOW: OrderStatus[] = ['received', 'confirmed', 'shipped', 'delivered'];

export async function setOrderStatus(id: string, status: OrderStatus) {
  await latency();
  const admin = requireAdmin();
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found');
  const pm = db.settings.paymentMethods.find((m) => m.id === o.paymentMethodId);
  if (status === 'shipped' && pm?.shipOnlyAfterPayment && o.paymentStatus !== 'paid') throw new ApiError('pay_before_ship'); // PAY-05
  if (status !== 'cancelled' && FLOW.indexOf(status) <= FLOW.indexOf(o.status)) throw new ApiError('bad_transition');
  o.status = status;
  o.history.push({ status, at: new Date().toISOString() });
  audit(admin, `Order ${o.number} → ${status}`);
  commit();
}

const paidSoFar = (o: Order) => o.payments.reduce((a, p) => a + p.amountCents, 0);
const statusFor = (o: Order): PaymentStatus => { const paid = paidSoFar(o); return paid === 0 ? 'awaiting' : paid >= o.totalCents ? 'paid' : 'partial'; };

/** Records money received and issues the next receipt number (emailed to the buyer in Phase 3). */
export async function markPaid(id: string, p: PaymentInput): Promise<PaymentRecord> {
  await latency();
  const admin = requireAdmin();
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found');
  if (!p.reference.trim()) throw new ApiError('reference_required');
  if (!(p.amountCents > 0)) throw new ApiError('amount_required');
  const year = p.receivedOn.slice(0, 4);
  db.receiptSeq[year] = (db.receiptSeq[year] ?? 0) + 1;
  const now = new Date().toISOString();
  const record: PaymentRecord = { ...p, id: uid('pay'), receiptNumber: `RC-${year}-${String(db.receiptSeq[year]).padStart(6, '0')}`, recordedAt: now, recordedBy: admin.fullName, emailedAt: now };
  o.payments.push(record);
  const status = statusFor(o);
  o.paymentStatus = status;
  audit(admin, `Order ${o.number} payment ${status}: ${eur(p.amountCents)} via ${p.kind}, ref ${p.reference}, receipt ${record.receiptNumber}`);
  commit();
  return clone(record);
}

export interface OrderEdit {
  lines: { productId: string; qty: number; unitCents: number }[];
  shippingCents: number;
  paymentMethodId: string;
}

/** Admin edit before shipping: lines, prices, shipping fee, payment method. Re-totals VAT and restocks the difference. */
export async function editOrder(id: string, edit: OrderEdit): Promise<Order> {
  await latency();
  const admin = requireAdmin();
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found');
  if (o.status !== 'received' && o.status !== 'confirmed') throw new ApiError('not_editable');
  if (!edit.lines.length) throw new ApiError('empty');
  if (edit.shippingCents < 0) throw new ApiError('generic');
  const pm = db.settings.paymentMethods.find((m) => m.id === edit.paymentMethodId);
  if (!pm) throw new ApiError('payment_method');

  const oldQty = new Map(o.lines.map((l) => [l.productId, l]));
  const newIds = new Set(edit.lines.map((l) => l.productId));
  // Stock check first, so a failed edit changes nothing.
  for (const l of edit.lines) {
    const p = db.products.find((x) => x.id === l.productId);
    if (!p) throw new ApiError('product_gone');
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.unitCents < 0) throw new ApiError('generic');
    const extra = l.qty - (oldQty.get(l.productId)?.qty ?? 0);
    if (extra > p.stock) throw new ApiError('stock', { name: p.name.en, left: p.stock + (oldQty.get(l.productId)?.qty ?? 0) });
  }
  const changes: string[] = [];
  const lines: OrderLine[] = edit.lines.map((l) => {
    const p = db.products.find((x) => x.id === l.productId)!;
    const before = oldQty.get(l.productId);
    const diff = l.qty - (before?.qty ?? 0);
    p.stock -= diff;
    if (before?.source.startsWith('deal:')) {
      const d = db.deals.find((x) => `deal:${x.id}` === before.source);
      if (d) d.sold = Math.max(0, d.sold + diff);
    }
    if (!before) changes.push(`added ${l.qty}× ${p.name.en}`);
    else {
      if (diff) changes.push(`${p.name.en} ${before.qty} → ${l.qty}`);
      if (before.unitCents !== l.unitCents) changes.push(`${p.name.en} price ${eur(before.unitCents)} → ${eur(l.unitCents)}`);
    }
    const tier = unitPrice(p, l.qty, undefined, db.settings.pricing);
    const source = before && before.unitCents === l.unitCents ? before.source : tier.unitCents === l.unitCents ? tier.source : 'manual';
    const vatPercent = before?.vatPercent ?? db.settings.vatRates.find((v) => v.id === p.vatRateId)?.percent ?? 22;
    return { productId: p.id, sku: p.sku, name: p.name, pack: p.pack, qty: l.qty, unitCents: l.unitCents, source, vatPercent, lineCents: l.unitCents * l.qty };
  });
  for (const before of o.lines) {
    if (newIds.has(before.productId)) continue;
    const p = db.products.find((x) => x.id === before.productId);
    if (p) p.stock += before.qty;
    const d = before.source.startsWith('deal:') ? db.deals.find((x) => `deal:${x.id}` === before.source) : undefined;
    if (d) d.sold = Math.max(0, d.sold - before.qty);
    changes.push(`removed ${before.name.en}`);
  }
  if (edit.shippingCents !== o.shippingCents) changes.push(`shipping ${eur(o.shippingCents)} → ${eur(edit.shippingCents)}`);
  if (pm.id !== o.paymentMethodId) changes.push(`payment method → ${pm.name.en}`);

  const t = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), edit.shippingCents);
  Object.assign(o, {
    lines, subtotalCents: t.subtotalCents, shippingCents: t.shippingCents, vat: t.vat, totalCents: t.totalCents,
    paymentMethodId: pm.id, paymentMethodName: pm.name, paymentInstructions: pm.instructions,
    editedAt: new Date().toISOString(), emailSentAt: new Date().toISOString(),
  });
  o.paymentStatus = statusFor(o);
  audit(admin, `Edited order ${o.number}: ${changes.join('; ') || 'no changes'} · new total ${eur(o.totalCents)}`);
  commit();
  return clone(o);
}

export async function resendInvoice(id: string) {
  await latency();
  const admin = requireAdmin();
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found');
  o.emailSentAt = new Date().toISOString();
  audit(admin, `Resent invoice ${o.invoiceNumber} to ${o.businessName}`);
  commit();
}

export async function applications(): Promise<User[]> {
  await latency();
  requireAdmin();
  return clone(db.users.filter((u) => u.role === 'reseller' && (u.state === 'pending' || u.state === 'info_requested')));
}

export async function resellers(): Promise<User[]> {
  await latency();
  requireAdmin();
  return clone(db.users.filter((u) => u.role === 'reseller'));
}

export async function review(userId: string, decision: 'approve' | 'reject' | 'info', note = '') {
  await latency();
  const admin = requireAdmin();
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new ApiError('not_found');
  u.state = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info_requested';
  u.reviewNote = note || undefined;
  audit(admin, `${decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Requested info from'} ${u.businessName}${note ? `: “${note}”` : ''}`);
  commit();
}

export async function adminSettings(): Promise<Settings> {
  requireAdmin();
  return clone(db.settings);
}

export async function updateSettings(patch: Partial<Settings>, what: string) {
  await latency();
  const admin = requireAdmin();
  if (patch.pricing) {
    const bad = validateBands(patch.pricing);
    if (bad) throw new ApiError(bad);
    const n = patch.pricing.starts.length;
    db.products.forEach((p) => { p.tiers = fitTiers(p.tiers, n); });
  }
  db.settings = { ...db.settings, ...clone(patch) };
  audit(admin, what);
  commit();
}

export async function adminCities(): Promise<City[]> {
  requireAdmin();
  return clone(db.cities);
}

export async function saveCities(next: City[], what: string) {
  await latency();
  const admin = requireAdmin();
  db.cities = clone(next);
  audit(admin, what);
  commit();
}

export async function adminProducts(): Promise<Product[]> {
  await latency();
  requireAdmin();
  return clone(db.products);
}

export async function updateProduct(id: string, patch: Partial<Product>, what: string) {
  await latency();
  const admin = requireAdmin();
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new ApiError('not_found');
  const next = { ...p, ...patch };
  if (!next.name.en.trim() || !next.name.it.trim() || !next.sku.trim()) throw new ApiError('product_invalid');
  if (next.tiers.length !== db.settings.pricing.starts.length || next.tiers.some((c) => !(c > 0)) || next.stock < 0 || !Number.isInteger(next.stock)) throw new ApiError('product_invalid');
  if (db.products.some((x) => x.id !== id && x.sku.toLowerCase() === next.sku.trim().toLowerCase())) throw new ApiError('sku_taken');
  Object.assign(p, clone(patch));
  audit(admin, what);
  commit();
}

export async function allDeals(): Promise<Deal[]> {
  await latency();
  requireAdmin();
  return clone(db.deals);
}

export async function saveDeal(deal: Deal) {
  await latency();
  const admin = requireAdmin();
  const p = db.products.find((x) => x.id === deal.productId);
  if (!p) throw new ApiError('not_found');
  if (deal.priceCents >= p.tiers[0]) throw new ApiError('deal_price_high'); // DEAL-03
  if (deal.perResellerLimit < minQty(db.settings.pricing)) throw new ApiError('deal_limit_moq', { n: minQty(db.settings.pricing) });
  if (db.deals.some((d) => d.id !== deal.id && d.productId === deal.productId && d.date === deal.date && !d.cancelled)) throw new ApiError('deal_duplicate'); // DEAL-02
  if (deal.featured) db.deals.forEach((d) => { if (d.date === deal.date && d.id !== deal.id) d.featured = false; });
  const i = db.deals.findIndex((d) => d.id === deal.id);
  const wasLive = i >= 0 && isDealLive(db.deals[i], new Date());
  if (i >= 0) db.deals[i] = clone(deal);
  else db.deals.push({ ...clone(deal), id: uid('d') });
  audit(admin, `${i >= 0 ? 'Edited' : 'Scheduled'} deal ${p.name.en} on ${deal.date}: ${eur(deal.priceCents)}${wasLive ? ' (live)' : ''}`);
  commit();
}

export async function cancelDeal(id: string) {
  await latency();
  const admin = requireAdmin();
  const d = db.deals.find((x) => x.id === id);
  if (!d) throw new ApiError('not_found');
  d.cancelled = true;
  audit(admin, `Cancelled deal ${db.products.find((p) => p.id === d.productId)?.name.en} on ${d.date}`);
  commit();
}

export async function auditLog() {
  await latency();
  requireAdmin();
  return clone(db.audit.slice(0, 200));
}

export async function resetDemo() {
  const session = localStorage.getItem(SESSION_KEY);
  db = createSeed();
  persist();
  if (session && !db.users.some((u) => u.id === session)) localStorage.removeItem(SESSION_KEY);
  emit({ type: 'changed' });
}
