// In-browser stand-in for the Phase 3 API. Same function signatures the real HTTP client will expose;
// state persists in localStorage and changes are broadcast to other tabs (admin alerts, live prices).
import { eur } from '../domain/money';
import { DEFAULT_BANDS, dealAllowance, fitTiers, isDealLive, liveDealFor, minQty, orderTotals, resolveMinimum, resolveShipping, unitPrice, validateBands } from '../domain/pricing';
import { addDays, romeDateKey } from '../domain/romeTime';
import type {
  AccountState, Category, City, Deal, Permission, StaffRole, Lang, Order, OrderLine, OrderStatus, PaymentInput, PaymentRecord, PaymentStatus, Product, Settings, UploadedDoc, User, Zone,
} from '../domain/types';
import { normalizeMobile, rules } from '../lib/validate';
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

/** Permissions of a user: resellers have none; staff get their role's (ROLE). */
function permissionsOf(u: User): Permission[] {
  if (u.role !== 'staff') return [];
  return db.roles.find((r) => r.id === u.roleId)?.permissions ?? [];
}

function withPerms(u: User): User {
  const out = clone(u);
  if (u.role === 'staff') out.permissions = permissionsOf(u);
  delete (out as Partial<User>).password;
  return out;
}

function requireStaff(): User {
  const u = requireUser();
  if (u.role !== 'staff') throw new ApiError('forbidden');
  return u;
}

/** Every admin endpoint checks one permission on the server; hiding menu items is only a convenience (USR-06). */
function requirePerm(p: Permission): User {
  const u = requireStaff();
  if (!permissionsOf(u).includes(p)) throw new ApiError('no_permission');
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
  return withPerms(user);
}

export async function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export async function me(): Promise<User | null> {
  const u = sessionUser();
  return u ? withPerms(u) : null;
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
  if (!o || (u.role === 'reseller' && o.userId !== u.id) || (u.role === 'staff' && !permissionsOf(u).includes('orders.view'))) throw new ApiError('not_found'); // INV-05
  return clone(o);
}

export async function sellerDetails() {
  requireUser();
  return clone({ business: db.settings.business, branding: db.settings.branding });
}

/* ---------- admin ---------- */

export async function adminOrders(): Promise<Order[]> {
  await latency();
  requirePerm('orders.view');
  return clone(db.orders);
}

const FLOW: OrderStatus[] = ['received', 'confirmed', 'shipped', 'delivered'];

export async function setOrderStatus(id: string, status: OrderStatus) {
  await latency();
  const admin = requirePerm(status === 'cancelled' ? 'orders.cancel' : 'orders.status');
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
  const admin = requirePerm('payments.record');
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
  const admin = requirePerm('orders.edit');
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
  const admin = requirePerm('orders.edit');
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found');
  o.emailSentAt = new Date().toISOString();
  audit(admin, `Resent invoice ${o.invoiceNumber} to ${o.businessName}`);
  commit();
}

export async function applications(): Promise<User[]> {
  await latency();
  requirePerm('resellers.view');
  return clone(db.users.filter((u) => u.role === 'reseller' && (u.state === 'pending' || u.state === 'info_requested')));
}

export async function resellers(): Promise<User[]> {
  await latency();
  requirePerm('resellers.view');
  return clone(db.users.filter((u) => u.role === 'reseller').map(withPerms));
}

export async function review(userId: string, decision: 'approve' | 'reject' | 'info', note = '') {
  await latency();
  const admin = requirePerm('resellers.approve');
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new ApiError('not_found');
  u.state = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info_requested';
  u.reviewNote = note || undefined;
  audit(admin, `${decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Requested info from'} ${u.businessName}${note ? `: “${note}”` : ''}`);
  commit();
}

export async function adminSettings(): Promise<Settings> {
  requireStaff();
  return clone(db.settings);
}

export async function updateSettings(patch: Partial<Settings>, what: string) {
  await latency();
  const admin = requirePerm(patch.globalMinOrderCents !== undefined ? 'rules.edit' : patch.saleBanner ? 'deals.edit' : 'settings.edit');
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
  requireStaff();
  return clone(db.cities);
}

export async function saveCities(next: City[], what: string) {
  await latency();
  const admin = requirePerm('rules.edit');
  db.cities = clone(next);
  audit(admin, what);
  commit();
}

export async function adminProducts(): Promise<Product[]> {
  await latency();
  requirePerm('products.view');
  return clone(db.products);
}

export async function updateProduct(id: string, patch: Partial<Product>, what: string) {
  await latency();
  const admin = requirePerm('products.edit');
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
  requireStaff();
  return clone(db.deals);
}

export async function saveDeal(deal: Deal) {
  await latency();
  const admin = requirePerm('deals.edit');
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
  const admin = requirePerm('deals.edit');
  const d = db.deals.find((x) => x.id === id);
  if (!d) throw new ApiError('not_found');
  d.cancelled = true;
  audit(admin, `Cancelled deal ${db.products.find((p) => p.id === d.productId)?.name.en} on ${d.date}`);
  commit();
}

export async function auditLog() {
  await latency();
  requirePerm('audit.view');
  return clone(db.audit.slice(0, 200));
}

/* ---------- categories (CAT) ---------- */

export async function categories(): Promise<Category[]> {
  const u = requireUser();
  const list = [...db.categories].sort((a, b) => a.sort - b.sort);
  return clone(u.role === 'staff' ? list : list.filter((c) => c.active));
}

export async function saveCategory(cat: Category) {
  await latency();
  const admin = requirePerm('categories.edit');
  if (!cat.name.en.trim() || !cat.name.it.trim()) throw new ApiError('category_invalid');
  const i = db.categories.findIndex((c) => c.id === cat.id);
  if (i >= 0) db.categories[i] = clone(cat);
  else db.categories.push({ ...clone(cat), id: uid('cat'), sort: db.categories.length });
  audit(admin, `${i >= 0 ? 'Edited' : 'Added'} category ${cat.name.en}`);
  commit();
}

export async function reorderCategories(ids: string[]) {
  await latency();
  const admin = requirePerm('categories.edit');
  ids.forEach((id, i) => { const c = db.categories.find((x) => x.id === id); if (c) c.sort = i; });
  audit(admin, 'Reordered categories');
  commit();
}

/** CAT-03: a category with products can only be deleted by moving its products to another one. */
export async function deleteCategory(id: string, moveTo?: string) {
  await latency();
  const admin = requirePerm('categories.edit');
  const c = db.categories.find((x) => x.id === id);
  if (!c) throw new ApiError('not_found');
  const inUse = db.products.filter((p) => p.category === id);
  if (inUse.length && !moveTo) throw new ApiError('category_not_empty', { n: inUse.length });
  const target = moveTo ? db.categories.find((x) => x.id === moveTo && x.id !== id) : undefined;
  if (inUse.length && !target) throw new ApiError('not_found');
  inUse.forEach((p) => { p.category = target!.id; });
  db.categories = db.categories.filter((x) => x.id !== id);
  audit(admin, `Deleted category ${c.name.en}${inUse.length ? `, moved ${inUse.length} products to ${target!.name.en}` : ''}`);
  commit();
}

/* ---------- staff users and roles (USR, ROLE) ---------- */

export async function roles(): Promise<StaffRole[]> {
  requireStaff();
  return clone(db.roles);
}

export async function saveRole(role: StaffRole) {
  await latency();
  const admin = requirePerm('users.manage');
  if (!role.name.trim()) throw new ApiError('role_invalid');
  const i = db.roles.findIndex((r) => r.id === role.id);
  if (i >= 0 && db.roles[i].builtIn) throw new ApiError('role_builtin');
  const before = i >= 0 ? db.roles[i].permissions : [];
  const next = { ...clone(role), builtIn: false, permissions: [...new Set(role.permissions)] };
  if (i >= 0) db.roles[i] = next;
  else db.roles.push({ ...next, id: uid('role') });
  const added = next.permissions.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !next.permissions.includes(p));
  audit(admin, `${i >= 0 ? 'Edited' : 'Created'} role ${role.name}${added.length ? `; added ${added.join(', ')}` : ''}${removed.length ? `; removed ${removed.join(', ')}` : ''}`);
  commit();
}

export async function deleteRole(id: string) {
  await latency();
  const admin = requirePerm('users.manage');
  const r = db.roles.find((x) => x.id === id);
  if (!r) throw new ApiError('not_found');
  if (r.builtIn) throw new ApiError('role_builtin');
  const users = db.users.filter((u) => u.roleId === id).length;
  if (users) throw new ApiError('role_in_use', { n: users });
  db.roles = db.roles.filter((x) => x.id !== id);
  audit(admin, `Deleted role ${r.name}`);
  commit();
}

export async function staffUsers(): Promise<User[]> {
  await latency();
  requirePerm('users.manage');
  return db.users.filter((u) => u.role === 'staff').map(withPerms);
}

export interface StaffInput { id?: string; fullName: string; email: string; mobile: string; roleId: string; lang: Lang; password?: string }

const activeOwners = () => db.users.filter((u) => u.role === 'staff' && u.roleId === 'owner' && u.state === 'approved');

export async function saveStaffUser(input: StaffInput) {
  await latency();
  const admin = requirePerm('users.manage');
  const email = input.email.trim().toLowerCase();
  if (!input.fullName.trim() || rules.email(email) || !db.roles.some((r) => r.id === input.roleId)) throw new ApiError('user_invalid');
  if (db.users.some((u) => u.id !== input.id && u.email.toLowerCase() === email)) throw new ApiError('email_taken');
  const mobile = normalizeMobile(input.mobile);
  if (mobile && db.users.some((u) => u.id !== input.id && u.mobile === mobile)) throw new ApiError('mobile_taken');
  const existing = db.users.find((u) => u.id === input.id && u.role === 'staff');
  if (existing) {
    if (existing.roleId === 'owner' && input.roleId !== 'owner' && activeOwners().length <= 1) throw new ApiError('last_owner');
    const from = db.roles.find((r) => r.id === existing.roleId)?.name;
    Object.assign(existing, { fullName: input.fullName.trim(), email, mobile, roleId: input.roleId, lang: input.lang });
    if (input.password) existing.password = input.password;
    audit(admin, `Edited staff user ${existing.fullName}${from !== db.roles.find((r) => r.id === input.roleId)?.name ? ` (role ${from} → ${db.roles.find((r) => r.id === input.roleId)?.name})` : ''}`);
  } else {
    if (!input.password || rules.password(input.password)) throw new ApiError('user_invalid');
    const base = db.users.find((u) => u.id === admin.id)!;
    db.users.push({ ...clone(base), id: uid('u'), role: 'staff', state: 'approved', fullName: input.fullName.trim(), email, mobile, roleId: input.roleId, lang: input.lang, password: input.password, createdAt: new Date().toISOString(), licenceDoc: undefined, vatDoc: undefined, extraDocs: undefined, reviewNote: undefined });
    audit(admin, `Created staff user ${input.fullName.trim()} (${db.roles.find((r) => r.id === input.roleId)?.name})`);
  }
  commit();
}

export async function setStaffActive(id: string, active: boolean) {
  await latency();
  const admin = requirePerm('users.manage');
  const u = db.users.find((x) => x.id === id && x.role === 'staff');
  if (!u) throw new ApiError('not_found');
  if (!active && u.roleId === 'owner' && activeOwners().length <= 1) throw new ApiError('last_owner');
  if (!active && u.id === admin.id) throw new ApiError('not_yourself');
  u.state = active ? 'approved' : 'suspended';
  audit(admin, `${active ? 'Reactivated' : 'Deactivated'} staff user ${u.fullName}`);
  commit();
}

/** USR-03: only users who never did anything can be deleted; everyone else is deactivated. */
export async function deleteStaffUser(id: string) {
  await latency();
  const admin = requirePerm('users.manage');
  const u = db.users.find((x) => x.id === id && x.role === 'staff');
  if (!u) throw new ApiError('not_found');
  if (u.id === admin.id) throw new ApiError('not_yourself');
  if (db.audit.some((a) => a.actor === u.fullName)) throw new ApiError('user_has_history');
  db.users = db.users.filter((x) => x.id !== id);
  audit(admin, `Deleted staff user ${u.fullName}`);
  commit();
}

/* ---------- reseller management (RES, APR) ---------- */

export interface ResellerInput {
  fullName: string; businessName: string; address: string; cityId: string; zoneId: string;
  email: string; mobile: string; vatNumber: string; fiscalCode: string; sdiOrPec: string; lang: Lang;
}

/** Returns an error code for the first invalid field, or null. Same rules as the application form. */
function checkReseller(r: ResellerInput, exceptId?: string): { code: string; field?: string } | null {
  const req: (keyof ResellerInput)[] = ['fullName', 'businessName', 'address', 'cityId', 'zoneId'];
  for (const k of req) if (!String(r[k] ?? '').trim()) return { code: 'field_required', field: k };
  if (rules.email(r.email)) return { code: 'field_invalid', field: 'email' };
  if (rules.mobile(r.mobile)) return { code: 'field_invalid', field: 'mobile' };
  if (rules.vatNumber(r.vatNumber)) return { code: 'field_invalid', field: 'vatNumber' };
  if (rules.fiscalCode(r.fiscalCode)) return { code: 'field_invalid', field: 'fiscalCode' };
  if (rules.sdiOrPec(r.sdiOrPec)) return { code: 'field_invalid', field: 'sdiOrPec' };
  const city = db.cities.find((c) => c.id === r.cityId);
  if (!city || !city.zones.some((z) => z.id === r.zoneId)) return { code: 'field_invalid', field: 'zoneId' };
  const email = r.email.trim().toLowerCase();
  if (db.users.some((u) => u.id !== exceptId && u.email.toLowerCase() === email)) return { code: 'email_taken' };
  if (db.users.some((u) => u.id !== exceptId && u.mobile === normalizeMobile(r.mobile))) return { code: 'mobile_taken' };
  const vat = r.vatNumber.replace(/\s/g, '').toUpperCase();
  if (db.users.some((u) => u.id !== exceptId && u.role === 'reseller' && u.vatNumber.toUpperCase() === vat)) return { code: 'vat_taken' };
  return null;
}

const cleanReseller = (r: ResellerInput) => ({
  ...r,
  fullName: r.fullName.trim(), businessName: r.businessName.trim(), address: r.address.trim(),
  email: r.email.trim().toLowerCase(), mobile: normalizeMobile(r.mobile),
  vatNumber: r.vatNumber.replace(/\s/g, '').toUpperCase(), fiscalCode: r.fiscalCode.replace(/\s/g, '').toUpperCase(), sdiOrPec: r.sdiOrPec.trim(),
});

export async function reseller(id: string): Promise<User> {
  await latency();
  requirePerm('resellers.view');
  const u = db.users.find((x) => x.id === id && x.role === 'reseller');
  if (!u) throw new ApiError('not_found');
  return withPerms(u);
}

/** Admin-created resellers start Approved (RES table in the spec). The mock sets a temporary password; production emails a set-password link. */
export async function createReseller(input: ResellerInput, password: string): Promise<User> {
  await latency();
  const admin = requirePerm('resellers.create');
  const bad = checkReseller(input);
  if (bad) throw new ApiError(bad.code, { field: bad.field ?? '' });
  if (rules.password(password)) throw new ApiError('field_invalid', { field: 'password' });
  const u: User = { ...cleanReseller(input), id: uid('u'), role: 'reseller', state: 'approved', password, createdAt: new Date().toISOString() };
  db.users.push(u);
  audit(admin, `Created reseller ${u.businessName}`);
  commit();
  return withPerms(u);
}

/** APR-01 / RES edit: every field; the audit log keeps before → after. */
export async function updateReseller(id: string, input: ResellerInput) {
  await latency();
  const admin = requirePerm('resellers.edit');
  const u = db.users.find((x) => x.id === id && x.role === 'reseller');
  if (!u) throw new ApiError('not_found');
  const bad = checkReseller(input, id);
  if (bad) throw new ApiError(bad.code, { field: bad.field ?? '' });
  const next = cleanReseller(input);
  const changes = (Object.keys(next) as (keyof ResellerInput)[]).filter((k) => String(u[k]) !== String(next[k])).map((k) => `${k} “${u[k]}” → “${next[k]}”`);
  Object.assign(u, next);
  audit(admin, `Edited ${u.state === 'approved' ? 'reseller' : 'application'} ${u.businessName}: ${changes.join('; ') || 'no changes'}`);
  commit();
}

export async function setResellerActive(id: string, active: boolean) {
  await latency();
  const admin = requirePerm('resellers.edit');
  const u = db.users.find((x) => x.id === id && x.role === 'reseller');
  if (!u) throw new ApiError('not_found');
  u.state = active ? 'approved' : 'suspended';
  audit(admin, `${active ? 'Reactivated' : 'Deactivated'} reseller ${u.businessName}`);
  commit();
}

/** Delete is only for resellers without orders; others are deactivated (RES table). */
export async function deleteReseller(id: string) {
  await latency();
  const admin = requirePerm('resellers.delete');
  const u = db.users.find((x) => x.id === id && x.role === 'reseller');
  if (!u) throw new ApiError('not_found');
  if (db.orders.some((o) => o.userId === id)) throw new ApiError('reseller_has_orders');
  db.users = db.users.filter((x) => x.id !== id);
  audit(admin, `Deleted reseller ${u.businessName}`);
  commit();
}

export async function addResellerDoc(id: string, doc: UploadedDoc) {
  await latency();
  const admin = requirePerm('resellers.edit');
  const u = db.users.find((x) => x.id === id && x.role === 'reseller');
  if (!u) throw new ApiError('not_found');
  u.extraDocs = [...(u.extraDocs ?? []), { ...doc, uploadedBy: 'admin', uploadedAt: new Date().toISOString() }];
  audit(admin, `Uploaded ${doc.name} for ${u.businessName}`);
  commit();
}

export interface ImportRowResult { row: number; status: 'ready' | 'warning' | 'error'; message: string; input: ResellerInput }

/**
 * RES-02: dry run returns a status per row and saves nothing; commit creates only the rows without errors.
 * An unknown zone falls back to the city's first zone as a warning.
 */
export async function importResellers(rows: ResellerInput[], opts: { commit: boolean; state: 'approved' | 'pending' }): Promise<ImportRowResult[]> {
  await latency();
  const admin = requirePerm('resellers.import');
  if (rows.length > 2000) throw new ApiError('import_too_big');
  const seenEmail = new Set<string>();
  const seenVat = new Set<string>();
  const results: ImportRowResult[] = rows.map((raw, i) => {
    const r = { ...raw };
    const city = db.cities.find((c) => c.id === r.cityId || c.name.toLowerCase() === String(r.cityId).trim().toLowerCase());
    let warning = '';
    if (city) {
      r.cityId = city.id;
      const zone = city.zones.find((z) => z.id === r.zoneId || z.name.toLowerCase() === String(r.zoneId).trim().toLowerCase());
      if (zone) r.zoneId = zone.id;
      else { r.zoneId = city.zones[0]?.id ?? ''; warning = `zone “${raw.zoneId}” not found, used ${city.zones[0]?.name}`; }
    }
    const bad = checkReseller(r);
    const email = r.email.trim().toLowerCase();
    const vat = r.vatNumber.replace(/\s/g, '').toUpperCase();
    const dup = seenEmail.has(email) ? 'email repeated in this file' : seenVat.has(vat) ? 'Partita IVA repeated in this file' : '';
    seenEmail.add(email);
    seenVat.add(vat);
    if (!city) return { row: i + 2, status: 'error', message: `city “${raw.cityId}” not found`, input: r };
    if (bad) return { row: i + 2, status: 'error', message: bad.field ? `${bad.code === 'field_required' ? 'missing' : 'invalid'} ${bad.field}` : bad.code.replace('_', ' '), input: r };
    if (dup) return { row: i + 2, status: 'error', message: dup, input: r };
    return { row: i + 2, status: warning ? 'warning' : 'ready', message: warning, input: r };
  });
  if (opts.commit) {
    const ok = results.filter((r) => r.status !== 'error');
    for (const r of ok) {
      db.users.push({ ...cleanReseller(r.input), id: uid('u'), role: 'reseller', state: opts.state, password: Math.random().toString(36).slice(2, 14), createdAt: new Date().toISOString() });
    }
    audit(admin, `Imported ${ok.length} resellers as ${opts.state} (${results.length - ok.length} rows skipped)`);
    commit();
  }
  return results;
}

export async function resetDemo() {
  const session = localStorage.getItem(SESSION_KEY);
  db = createSeed();
  persist();
  if (session && !db.users.some((u) => u.id === session)) localStorage.removeItem(SESSION_KEY);
  emit({ type: 'changed' });
}
