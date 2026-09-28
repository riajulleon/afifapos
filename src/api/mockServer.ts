// In-browser stand-in for the Phase 3 API. Same function signatures the real HTTP client will expose;
// state persists in localStorage and changes are broadcast to other tabs (admin alerts, live prices).
import { syncOrderCommission } from '../domain/commission';
import { unknownVariables } from '../domain/email';
import { eur } from '../domain/money';
import { DEFAULT_BANDS, dealAllowance, discountAmount, fitTiers, isDealLive, liveDealFor, minQty, orderTotals, resolveMinimum, resolveShipping, unitPrice, validateBands } from '../domain/pricing';
import { buildReport, REPORT_TYPES, type Report, type ReportType } from '../domain/reports';
import { addDays, romeDateKey } from '../domain/romeTime';
import type {
  AccountState, Audience, Campaign, Category, City, CommissionEntry, Deal, EmailContent, EmailLog, EmailTemplate, EmailTrigger, Permission, StaffRole, Lang, Order, OrderDiscount, OrderLine, OrderStatus,
  PaymentInput, PaymentKind, PaymentRecord, PaymentStatus, Payout, Product, Settings, SmtpSettings, UploadedDoc, User, Zone,
} from '../domain/types';
import { sanitizeHtml } from '../lib/sanitize';
import { normalizeMobile, rules } from '../lib/validate';
import { baseVars, compose, makeLog, orderVars, simulateDelivery, templateFor } from '../mock/mailer';
import { createSeed, DB_VERSION, seedSettings, WALK_IN, type Db } from '../mock/seed';

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

/* ---------- commission + email side effects ---------- */

/** Keeps the order's commission lines in step after any change to the order (COM-03). */
function syncCommission(o: Order) {
  const pct = db.users.find((u) => u.id === o.pocId)?.commissionPct ?? db.settings.commission.defaultPct;
  const { update, add } = syncOrderCommission(o, db.commissions, pct, db.settings.commission, () => uid('c'));
  for (const e of update) {
    const i = db.commissions.findIndex((x) => x.id === e.id);
    if (i >= 0) db.commissions[i] = e;
  }
  db.commissions.push(...add);
}

const EMAIL_LOG_CAP = 5000;

function logEmail(log: EmailLog) {
  db.emails.unshift(log);
  if (db.emails.length > EMAIL_LOG_CAP) db.emails.length = EMAIL_LOG_CAP;
}

/** Sends a triggered email if its template is switched on (MAIL-02). Walk-in POS customers have no address and get none. */
function notify(trigger: EmailTrigger, to: Pick<User, 'email' | 'fullName' | 'businessName' | 'lang'>, extra: Record<string, string> = {}, order?: Order) {
  const tpl = templateFor(db, trigger);
  if (!tpl?.enabled || !to.email) return;
  const vars = { ...(order ? orderVars(db, order, to, to.lang) : baseVars(db, to, to.lang)), ...extra };
  const rendered = compose(db, tpl.content[to.lang], to.lang, vars, trigger === 'payment_received' || trigger === 'application_received' || trigger === 'application_rejected' ? undefined : order);
  logEmail(makeLog(db, uid('e'), trigger, to.email, to.fullName, rendered, new Date(), { orderId: order?.id }));
}

function buyerOf(o: Order) {
  return db.users.find((u) => u.id === o.userId);
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
  const user: User = { ...input, email, id: uid('u'), role: 'reseller', state: 'pending', createdAt: new Date().toISOString(), pocId: null };
  db.users.push(user);
  localStorage.setItem(SESSION_KEY, user.id);
  notify('application_received', user);
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
    channel: 'online',
    pocId: u.pocId ?? null,
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
  syncCommission(order);
  notify('order_placed', u, {}, order);
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

export async function setOrderStatus(id: string, status: OrderStatus, reason = '') {
  await latency();
  const admin = requirePerm(status === 'cancelled' ? 'orders.cancel' : 'orders.status');
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError('not_found');
  if (o.status === 'cancelled') throw new ApiError('bad_transition');
  const inWarehouse = o.status === 'received' || o.status === 'confirmed';
  const pm = db.settings.paymentMethods.find((m) => m.id === o.paymentMethodId);
  if (status === 'shipped' && pm?.shipOnlyAfterPayment && o.paymentStatus !== 'paid') throw new ApiError('pay_before_ship'); // PAY-05
  if (status !== 'cancelled' && FLOW.indexOf(status) <= FLOW.indexOf(o.status)) throw new ApiError('bad_transition');
  o.status = status;
  o.history.push({ status, at: new Date().toISOString() });
  if (status === 'cancelled' && inWarehouse) {
    // Goods that never left go back on the shelf, and sale counts are released.
    for (const l of o.lines) {
      const p = db.products.find((x) => x.id === l.productId);
      if (p) p.stock += l.qty;
      const d = l.source.startsWith('deal:') ? db.deals.find((x) => `deal:${x.id}` === l.source) : undefined;
      if (d) d.sold = Math.max(0, d.sold - l.qty);
    }
  }
  syncCommission(o);
  const buyer = buyerOf(o);
  if (buyer) {
    const trigger = ({ cancelled: 'order_cancelled', shipped: 'order_shipped', delivered: 'order_completed' } as Partial<Record<OrderStatus, EmailTrigger>>)[status];
    if (trigger) notify(trigger, buyer, { reason: reason.trim() || (buyer.lang === 'it' ? 'nessun motivo indicato' : 'no reason given') }, o);
  }
  audit(admin, `Order ${o.number} → ${status}${reason.trim() ? `: “${reason.trim()}”` : ''}`);
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
  syncCommission(o);
  const buyer = buyerOf(o);
  if (buyer) {
    notify('payment_received', buyer, {
      amount: eur(p.amountCents, buyer.lang), receipt_number: record.receiptNumber,
      receipt_link: `${orderVars(db, o, buyer, buyer.lang).order_link.replace('/orders/', '/receipt/')}/${record.id}`,
      balance: eur(Math.max(0, o.totalCents - paidSoFar(o)), buyer.lang),
    }, o);
  }
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

  // A POS discount stays as entered: a percentage re-applies to the new goods value, a fixed amount is capped by it.
  const goods = lines.reduce((a, l) => a + l.lineCents, 0);
  const discount: OrderDiscount | undefined = o.discount ? { ...o.discount, cents: discountAmount(o.discount.kind, o.discount.value, goods) } : undefined;
  const t = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), edit.shippingCents, discount?.cents ?? 0);
  Object.assign(o, {
    lines, subtotalCents: t.subtotalCents, shippingCents: t.shippingCents, vat: t.vat, totalCents: t.totalCents,
    paymentMethodId: pm.id, paymentMethodName: pm.name, paymentInstructions: pm.instructions,
    editedAt: new Date().toISOString(), emailSentAt: new Date().toISOString(),
  });
  if (discount) o.discount = discount;
  o.paymentStatus = statusFor(o);
  syncCommission(o);
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
  if (decision === 'reject') notify('application_rejected', u, { reason: note.trim() || (u.lang === 'it' ? 'documenti non validi' : 'documents could not be verified') });
  audit(admin, `${decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Requested info from'} ${u.businessName}${note ? `: “${note}”` : ''}`);
  commit();
}

export async function adminSettings(): Promise<Settings> {
  requireStaff();
  const s = clone(db.settings);
  delete s.smtp.password; // write-only (MAIL-01)
  return s;
}

/** Each settings area has its own permission; a patch needs all of the ones it touches. */
const SETTING_PERM: Partial<Record<keyof Settings, Permission>> = {
  globalMinOrderCents: 'rules.edit', saleBanner: 'deals.edit', commission: 'commissions.manage', emailTheme: 'email.manage', smtp: 'email.manage',
};

export async function updateSettings(patch: Partial<Settings>, what: string) {
  await latency();
  const perms = [...new Set((Object.keys(patch) as (keyof Settings)[]).map((k) => SETTING_PERM[k] ?? 'settings.edit'))];
  if (patch.smtp) throw new ApiError('forbidden'); // SMTP goes through saveSmtp, which keeps the password write-only
  const admin = requireStaff();
  for (const p of perms) requirePerm(p);
  if (patch.pos) {
    const pos = patch.pos;
    if (!(pos.maxDiscountPct >= 0 && pos.maxDiscountPct <= 100) || !db.cities.some((c) => c.id === pos.storeCityId)) throw new ApiError('generic');
  }
  if (patch.commission && !(patch.commission.defaultPct >= 0 && patch.commission.defaultPct <= 50)) throw new ApiError('rate_invalid');
  if (patch.emailTheme && ![patch.emailTheme.accent, patch.emailTheme.background].every((c) => /^#[0-9a-f]{6}$/i.test(c))) throw new ApiError('generic');
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

export interface StaffInput { id?: string; fullName: string; email: string; mobile: string; roleId: string; lang: Lang; password?: string; commissionPct?: number | null }

const activeOwners = () => db.users.filter((u) => u.role === 'staff' && u.roleId === 'owner' && u.state === 'approved');

export async function saveStaffUser(input: StaffInput) {
  await latency();
  const admin = requirePerm('users.manage');
  const email = input.email.trim().toLowerCase();
  if (!input.fullName.trim() || rules.email(email) || !db.roles.some((r) => r.id === input.roleId)) throw new ApiError('user_invalid');
  if (db.users.some((u) => u.id !== input.id && u.email.toLowerCase() === email)) throw new ApiError('email_taken');
  const mobile = normalizeMobile(input.mobile);
  if (mobile && db.users.some((u) => u.id !== input.id && u.mobile === mobile)) throw new ApiError('mobile_taken');
  const pct = input.commissionPct ?? undefined;
  if (pct !== undefined && !(pct >= 0 && pct <= 50)) throw new ApiError('rate_invalid');
  const existing = db.users.find((u) => u.id === input.id && u.role === 'staff');
  if (existing) {
    if (existing.roleId === 'owner' && input.roleId !== 'owner' && activeOwners().length <= 1) throw new ApiError('last_owner');
    const from = db.roles.find((r) => r.id === existing.roleId)?.name;
    if (existing.commissionPct !== pct) audit(admin, `Commission rate of ${existing.fullName}: ${existing.commissionPct ?? 'default'}% → ${pct ?? 'default'}% (new orders only)`);
    Object.assign(existing, { fullName: input.fullName.trim(), email, mobile, roleId: input.roleId, lang: input.lang, commissionPct: pct });
    if (input.password) existing.password = input.password;
    audit(admin, `Edited staff user ${existing.fullName}${from !== db.roles.find((r) => r.id === input.roleId)?.name ? ` (role ${from} → ${db.roles.find((r) => r.id === input.roleId)?.name})` : ''}`);
  } else {
    if (!input.password || rules.password(input.password)) throw new ApiError('user_invalid');
    const base = db.users.find((u) => u.id === admin.id)!;
    db.users.push({ ...clone(base), id: uid('u'), role: 'staff', state: 'approved', fullName: input.fullName.trim(), email, mobile, roleId: input.roleId, lang: input.lang, password: input.password, commissionPct: pct, createdAt: new Date().toISOString(), licenceDoc: undefined, vatDoc: undefined, extraDocs: undefined, reviewNote: undefined });
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
  if (db.audit.some((a) => a.actor === u.fullName) || db.commissions.some((c) => c.staffId === id)) throw new ApiError('user_has_history');
  db.users.forEach((r) => { if (r.pocId === id) r.pocId = null; });
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

/* ---------- POS (POS) ---------- */

export interface PosCustomer { id: string; businessName: string; fullName: string; cityName: string; email: string; pocId: string | null; deliveryCents: number }

/** Everything the till needs in one call: sellable products and approved resellers (POS-01). */
export async function posCatalog(): Promise<{ products: Product[]; customers: PosCustomer[]; maxDiscountPct: number; canOverride: boolean; receiptFooter: Settings['pos']['receiptFooter'] }> {
  await latency();
  const u = requirePerm('pos.use');
  return clone({
    maxDiscountPct: db.settings.pos.maxDiscountPct,
    canOverride: permissionsOf(u).includes('pos.discount'),
    receiptFooter: db.settings.pos.receiptFooter,
    products: db.products.filter((p) => p.active),
    customers: db.users.filter((u) => u.role === 'reseller' && u.state === 'approved').map((u) => ({
      id: u.id, businessName: u.businessName, fullName: u.fullName, cityName: db.cities.find((c) => c.id === u.cityId)?.name ?? '', email: u.email, pocId: u.pocId ?? null,
      deliveryCents: (() => { const c = db.cities.find((x) => x.id === u.cityId); return c ? resolveShipping(c, u.zoneId).cents : 0; })(),
    })),
  });
}

export interface PosSaleInput {
  customer: { kind: 'walkin'; name: string } | { kind: 'reseller'; userId: string };
  items: { productId: string; qty: number }[];
  discount: { kind: 'percent' | 'fixed'; value: number; reason: string } | null;
  /** 'later' puts the sale on the reseller's account (awaiting payment); walk-ins always pay now. */
  payment: { kind: PaymentKind | 'later'; tenderedCents?: number; reference: string };
  /** true = goods leave with the customer now (Completed); false = we deliver (Confirmed, delivery fee applies). */
  handedOver: boolean;
}

/**
 * Rings up a counter sale (POS-02…05). The server prices everything again, checks stock, the discount limit
 * and the payment, then takes the order, invoice and receipt numbers in one step.
 */
export async function posCheckout(input: PosSaleInput): Promise<Order> {
  await latency();
  const cashier = requirePerm('pos.use');
  const now = new Date();
  const store = db.cities.find((c) => c.id === db.settings.pos.storeCityId) ?? db.cities[0];
  const buyer = input.customer.kind === 'reseller' ? db.users.find((u) => u.id === (input.customer as { userId: string }).userId && u.role === 'reseller' && u.state === 'approved') : undefined;
  if (input.customer.kind === 'reseller' && !buyer) throw new ApiError('pos_customer');
  const who: User = buyer ?? WALK_IN(input.customer.kind === 'walkin' && input.customer.name.trim() ? input.customer.name.trim().slice(0, 80) : 'Walk-in customer', { cityId: store.id, zoneId: store.zones[0]?.id ?? '', address: db.settings.business.address });
  if (!buyer && !input.handedOver) throw new ApiError('pos_walkin_delivery');
  if (!buyer && input.payment.kind === 'later') throw new ApiError('pos_walkin_later');

  const merged = new Map<string, number>();
  for (const i of input.items) {
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 9999) throw new ApiError('generic');
    merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);
  }
  if (!merged.size) throw new ApiError('empty');
  const bought = buyer ? countBoughtToday(buyer.id) : {};
  const lines = [...merged].map(([productId, qty]) => {
    const p = db.products.find((x) => x.id === productId && x.active);
    if (!p) throw new ApiError('product_gone');
    if (qty > p.stock) throw new ApiError('stock', { name: p.name.en, left: p.stock });
    // A live deal applies at the counter too, within its limits; above the allowance the band price applies.
    const live = liveDealFor(p.id, db.deals, now);
    const deal = live && qty <= dealAllowance(live, bought[p.id] ?? 0) ? live : undefined;
    const price = unitPrice(p, qty, deal, db.settings.pricing);
    const vatPercent = db.settings.vatRates.find((v) => v.id === p.vatRateId)?.percent ?? 22;
    return { productId: p.id, sku: p.sku, name: p.name, pack: p.pack, qty, unitCents: price.unitCents, source: price.source, vatPercent, lineCents: price.unitCents * qty, deal };
  });

  const goods = lines.reduce((a, l) => a + l.lineCents, 0);
  let discount: OrderDiscount | undefined;
  if (input.discount && input.discount.value > 0) {
    const d = input.discount;
    if (d.kind === 'percent' && !(d.value > 0 && d.value <= 100)) throw new ApiError('discount_invalid');
    if (d.kind === 'fixed' && !(Number.isInteger(d.value) && d.value > 0)) throw new ApiError('discount_invalid');
    if (!d.reason.trim()) throw new ApiError('discount_reason');
    const cents = discountAmount(d.kind, d.value, goods);
    const max = db.settings.pos.maxDiscountPct;
    if (cents > Math.round((goods * max) / 100) && !permissionsOf(cashier).includes('pos.discount')) throw new ApiError('discount_limit', { max });
    discount = { kind: d.kind, value: d.value, cents, reason: d.reason.trim().slice(0, 120) };
  }
  const zone = buyer ? db.cities.find((c) => c.id === buyer.cityId) : undefined;
  const ship = input.handedOver || !zone ? 0 : resolveShipping(zone, buyer!.zoneId).cents;
  const t = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), ship, discount?.cents ?? 0);

  const pay = input.payment;
  const later = pay.kind === 'later';
  if (!later) {
    if (pay.kind === 'cash') {
      if (!(Number.isInteger(pay.tenderedCents) && pay.tenderedCents! >= t.totalCents)) throw new ApiError('pos_tendered', { total: eur(t.totalCents) });
    } else if (!pay.reference.trim()) throw new ApiError('reference_required');
  }

  const romeDate = romeDateKey(now);
  const year = romeDate.slice(0, 4);
  db.orderSeq += 1;
  db.invoiceSeq[year] = (db.invoiceSeq[year] ?? 0) + 1;
  for (const l of lines) {
    db.products.find((x) => x.id === l.productId)!.stock -= l.qty;
    if (l.deal) l.deal.sold += l.qty;
  }
  const at = now.toISOString();
  const status: OrderStatus = input.handedOver ? 'delivered' : 'confirmed';
  const kindName: Record<string, [string, string]> = { cash: ['Cash', 'Contanti'], card: ['Card', 'Carta'], later: ['On account', 'A credito'] };
  const pm = !later && !kindName[pay.kind] ? db.settings.paymentMethods.find((m) => m.kind === pay.kind) : undefined;
  const methodName = pm?.name ?? { en: (kindName[pay.kind] ?? [pay.kind, pay.kind])[0], it: (kindName[pay.kind] ?? [pay.kind, pay.kind])[1] };
  const order: Order = {
    id: uid('o'),
    number: `AF-${year}-${String(db.orderSeq).padStart(5, '0')}`,
    invoiceNumber: `${db.settings.business.invoicePrefix}${year}/${String(db.invoiceSeq[year]).padStart(6, '0')}`,
    channel: 'pos',
    cashier: cashier.fullName,
    tenderedCents: pay.kind === 'cash' ? pay.tenderedCents : undefined,
    ...(discount ? { discount } : {}),
    pocId: buyer?.pocId ?? null,
    userId: buyer?.id ?? '',
    businessName: who.businessName,
    cityId: buyer?.cityId ?? store.id,
    cityName: db.cities.find((c) => c.id === (buyer?.cityId ?? store.id))?.name ?? store.name,
    zoneName: buyer ? db.cities.find((c) => c.id === buyer.cityId)?.zones.find((z) => z.id === buyer.zoneId)?.name ?? '' : '',
    address: who.address,
    lines: lines.map(({ deal: _deal, ...l }) => l),
    subtotalCents: t.subtotalCents,
    shippingCents: t.shippingCents,
    vat: t.vat,
    totalCents: t.totalCents,
    paymentMethodId: pm?.id ?? `pos-${pay.kind}`,
    paymentMethodName: methodName,
    paymentInstructions: later ? (db.settings.paymentMethods.find((m) => m.id === 'bank')?.instructions ?? { en: '', it: '' }) : { en: 'Paid at the counter.', it: 'Pagato al banco.' },
    paymentStatus: 'awaiting',
    payments: [],
    status,
    history: (input.handedOver ? FLOW : FLOW.slice(0, 2)).map((s) => ({ status: s, at })),
    placedAt: at,
    romeDate,
    lang: buyer?.lang ?? cashier.lang,
    emailSentAt: buyer ? at : null,
  };
  if (!later) {
    db.receiptSeq[year] = (db.receiptSeq[year] ?? 0) + 1;
    order.payments.push({
      id: uid('pay'), receiptNumber: `RC-${year}-${String(db.receiptSeq[year]).padStart(6, '0')}`, kind: pay.kind as PaymentKind, receivedOn: romeDate, amountCents: t.totalCents,
      reference: pay.kind === 'cash' ? 'Cash' : pay.reference.trim().slice(0, 60), note: pay.kind === 'cash' ? `Tendered ${eur(pay.tenderedCents!)}, change ${eur(pay.tenderedCents! - t.totalCents)}` : '',
      recordedAt: at, recordedBy: cashier.fullName, emailedAt: buyer ? at : null,
    });
    order.paymentStatus = 'paid';
  }
  db.orders.unshift(order);
  syncCommission(order);
  if (buyer) {
    notify('order_placed', buyer, {}, order);
    const p = order.payments[0];
    if (p) notify('payment_received', buyer, { amount: eur(p.amountCents, buyer.lang), receipt_number: p.receiptNumber, receipt_link: `${orderVars(db, order, buyer, buyer.lang).order_link.replace('/orders/', '/receipt/')}/${p.id}`, balance: eur(0, buyer.lang) }, order);
  }
  audit(cashier, `POS sale ${order.number} to ${order.businessName}: ${eur(order.totalCents)}${discount ? `, discount ${eur(discount.cents)} (${discount.reason})` : ''}, ${later ? 'on account' : `paid by ${pay.kind}`}`);
  commit();
  return clone(order);
}

/* ---------- points of contact and commission (TEAM, COM) ---------- */

export interface StaffOption { id: string; fullName: string; roleName: string; commissionPct: number; active: boolean }

/** Staff who can be a reseller's point of contact. */
export async function pocOptions(): Promise<StaffOption[]> {
  requireStaff();
  return db.users.filter((u) => u.role === 'staff').map((u) => ({
    id: u.id, fullName: u.fullName, roleName: db.roles.find((r) => r.id === u.roleId)?.name ?? '', commissionPct: u.commissionPct ?? db.settings.commission.defaultPct, active: u.state === 'approved',
  }));
}

/** TEAM-02: new orders earn commission for the new contact; existing orders keep theirs. */
export async function assignPoc(resellerIds: string[], staffId: string | null) {
  await latency();
  const admin = requirePerm('resellers.edit');
  const staff = staffId ? db.users.find((u) => u.id === staffId && u.role === 'staff' && u.state === 'approved') : null;
  if (staffId && !staff) throw new ApiError('not_found');
  const changed: string[] = [];
  for (const id of resellerIds) {
    const r = db.users.find((u) => u.id === id && u.role === 'reseller');
    if (!r) throw new ApiError('not_found');
    if ((r.pocId ?? null) === staffId) continue;
    const before = db.users.find((u) => u.id === r.pocId)?.fullName ?? 'nobody';
    r.pocId = staffId;
    changed.push(`${r.businessName} (${before} → ${staff?.fullName ?? 'nobody'})`);
  }
  if (changed.length) audit(admin, `Point of contact changed: ${changed.join('; ')}`);
  commit();
}

const canSeeTeam = (u: User) => permissionsOf(u).some((p) => p === 'commissions.manage' || p === 'reports.view');

export interface MemberStats {
  id: string; fullName: string; email: string; roleName: string; active: boolean; commissionPct: number;
  resellers: { id: string; businessName: string; cityName: string }[];
  orders: number; salesCents: number;
  pendingCents: number; payableCents: number; paidCents: number; earnedCents: number;
  lastPayout: Payout | null;
}

/**
 * Team performance for a date range (TEAM-04). Managers see everyone with resellers or commission;
 * everyone else sees only their own figures.
 */
export async function teamPerformance(from: string, to: string): Promise<MemberStats[]> {
  await latency();
  const me = requireStaff();
  const everyone = canSeeTeam(me);
  const members = db.users.filter((u) => u.role === 'staff' && (everyone ? u.roleId === 'sales' || db.users.some((r) => r.pocId === u.id) || db.commissions.some((c) => c.staffId === u.id) : u.id === me.id));
  return members.map((m) => {
    const orders = db.orders.filter((o) => o.pocId === m.id && o.status !== 'cancelled' && o.romeDate >= from && o.romeDate <= to);
    const entries = db.commissions.filter((c) => c.staffId === m.id && c.status !== 'void' && c.romeDate >= from && c.romeDate <= to);
    const sum = (st: CommissionEntry['status']) => entries.filter((c) => c.status === st).reduce((a, c) => a + c.amountCents, 0);
    const payouts = db.payouts.filter((p) => p.staffId === m.id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
    return {
      id: m.id, fullName: m.fullName, email: m.email, roleName: db.roles.find((r) => r.id === m.roleId)?.name ?? '', active: m.state === 'approved',
      commissionPct: m.commissionPct ?? db.settings.commission.defaultPct,
      resellers: db.users.filter((r) => r.pocId === m.id).map((r) => ({ id: r.id, businessName: r.businessName, cityName: db.cities.find((c) => c.id === r.cityId)?.name ?? '' })),
      orders: orders.length, salesCents: orders.reduce((a, o) => a + o.subtotalCents, 0),
      pendingCents: sum('pending'), payableCents: sum('payable'), paidCents: sum('paid'), earnedCents: entries.reduce((a, c) => a + c.amountCents, 0),
      lastPayout: payouts[0] ?? null,
    };
  }).sort((a, b) => b.salesCents - a.salesCents);
}

/** Commission lines. Without commissions.manage you only get your own (COM-05). */
export async function commissions(staffId?: string): Promise<CommissionEntry[]> {
  await latency();
  const me = requireStaff();
  const all = permissionsOf(me).includes('commissions.manage');
  const who = all ? staffId : me.id;
  return clone(db.commissions.filter((c) => !who || c.staffId === who).sort((a, b) => b.romeDate.localeCompare(a.romeDate) || b.createdAt.localeCompare(a.createdAt)));
}

export async function payouts(staffId?: string): Promise<Payout[]> {
  await latency();
  const me = requireStaff();
  const all = permissionsOf(me).includes('commissions.manage');
  const who = all ? staffId : me.id;
  return clone(db.payouts.filter((p) => !who || p.staffId === who).sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.number.localeCompare(a.number)));
}

export async function payout(id: string): Promise<{ payout: Payout; entries: CommissionEntry[] }> {
  await latency();
  const me = requireStaff();
  const p = db.payouts.find((x) => x.id === id);
  if (!p || (!permissionsOf(me).includes('commissions.manage') && p.staffId !== me.id)) throw new ApiError('not_found');
  return clone({ payout: p, entries: db.commissions.filter((c) => p.entryIds.includes(c.id)) });
}

export interface PayoutInput { staffId: string; entryIds: string[]; kind: PaymentKind; reference: string; paidOn: string; note: string }

/** COM-06: pays the chosen payable lines (clawbacks included) in one numbered payout; paid lines are then locked. */
export async function createPayout(input: PayoutInput): Promise<Payout> {
  await latency();
  const admin = requirePerm('commissions.manage');
  const staff = db.users.find((u) => u.id === input.staffId && u.role === 'staff');
  if (!staff) throw new ApiError('not_found');
  const ids = new Set(input.entryIds);
  const entries = db.commissions.filter((c) => ids.has(c.id));
  if (!entries.length || entries.length !== ids.size) throw new ApiError('payout_nothing');
  if (entries.some((c) => c.staffId !== staff.id || c.status !== 'payable')) throw new ApiError('payout_stale');
  const amount = entries.reduce((a, c) => a + c.amountCents, 0);
  if (amount <= 0) throw new ApiError('payout_nothing');
  if (!input.reference.trim()) throw new ApiError('reference_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > romeDateKey()) throw new ApiError('date_invalid');
  const y = input.paidOn.slice(0, 4);
  db.payoutSeq[y] = (db.payoutSeq[y] ?? 0) + 1;
  const p: Payout = {
    id: uid('po'), number: `PO-${y}-${String(db.payoutSeq[y]).padStart(4, '0')}`, staffId: staff.id, staffName: staff.fullName, entryIds: entries.map((c) => c.id), amountCents: amount,
    kind: input.kind, reference: input.reference.trim().slice(0, 80), paidOn: input.paidOn, note: input.note.trim().slice(0, 200), recordedBy: admin.fullName, recordedAt: new Date().toISOString(),
  };
  entries.forEach((c) => { c.status = 'paid'; c.payoutId = p.id; });
  db.payouts.push(p);
  audit(admin, `Commission payout ${p.number} to ${staff.fullName}: ${eur(amount)} for ${entries.length} lines, ref ${p.reference}`);
  commit();
  return clone(p);
}

/* ---------- reports (REP) ---------- */

export type ReportTypeArg = ReportType;

export async function report(type: ReportType, from: string, to: string, lang: Lang = 'en'): Promise<Report> {
  await latency();
  requirePerm('reports.view');
  if (!REPORT_TYPES.includes(type)) throw new ApiError('not_found');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new ApiError('date_invalid');
  if (addDays(from, 800) < to) throw new ApiError('range_too_long');
  return buildReport(type, {
    orders: db.orders, users: db.users.map(withPerms), products: db.products, categories: db.categories, commissions: db.commissions, payouts: db.payouts, from, to, lang,
  });
}

/* ---------- email (MAIL) ---------- */

export async function emailTemplates(): Promise<EmailTemplate[]> {
  await latency();
  requirePerm('email.manage');
  return clone(db.templates);
}

const MAX_IMAGE = 1_500_000;

/** Validates and cleans template content (MAIL-03): subject, block limits, safe links and images, known variables. */
function cleanContent(content: Record<Lang, EmailContent>, kind: EmailTrigger | 'campaign'): Record<Lang, EmailContent> {
  const out = {} as Record<Lang, EmailContent>;
  for (const lang of ['en', 'it'] as const) {
    const c = content[lang];
    if (!c || !c.subject.trim() || c.subject.length > 200) throw new ApiError('template_subject', { lang: lang.toUpperCase() });
    if (!c.blocks.length || c.blocks.length > 60) throw new ApiError('template_blocks');
    const blocks = c.blocks.map((b) => {
      switch (b.type) {
        case 'text': return { ...b, html: sanitizeHtml(b.html).slice(0, 20000) };
        case 'heading': return { ...b, text: b.text.slice(0, 200) };
        case 'button': {
          if (!/^(https?:\/\/|mailto:|\{\{\s*[a-z_]+\s*\}\})/i.test(b.url.trim())) throw new ApiError('template_link', { label: b.label });
          return { ...b, label: b.label.slice(0, 60), url: b.url.trim() };
        }
        case 'image': {
          if (b.src && !(b.src.startsWith('data:image/') || b.src.startsWith('https://'))) throw new ApiError('template_image');
          if (b.src.length > MAX_IMAGE) throw new ApiError('template_image_size');
          return { ...b, width: Math.max(40, Math.min(536, Math.round(b.width) || 536)) };
        }
        case 'spacer': return { ...b, size: Math.max(4, Math.min(80, Math.round(b.size) || 16)) };
        default: return b;
      }
    });
    const next = { subject: c.subject.trim(), blocks };
    const unknown = unknownVariables(next, kind);
    if (unknown.length) throw new ApiError('template_vars', { vars: unknown.map((v) => `{{${v}}}`).join(', ') });
    out[lang] = next;
  }
  return out;
}

/** MAIL-05: every save is a new version; the last 30 are kept. */
export async function saveTemplate(id: EmailTrigger, content: Record<Lang, EmailContent>, note: string): Promise<EmailTemplate> {
  await latency();
  const admin = requirePerm('email.manage');
  const tpl = db.templates.find((x) => x.id === id);
  if (!tpl) throw new ApiError('not_found');
  const clean = cleanContent(content, id);
  tpl.content = clean;
  tpl.versions.unshift({ n: (tpl.versions[0]?.n ?? 0) + 1, savedAt: new Date().toISOString(), savedBy: admin.fullName, note: note.trim().slice(0, 120), content: clone(clean) });
  tpl.versions = tpl.versions.slice(0, 30);
  audit(admin, `Email template “${id}” saved as version ${tpl.versions[0].n}${note.trim() ? `: ${note.trim()}` : ''}`);
  commit();
  return clone(tpl);
}

/** Rollback never deletes history: the old content comes back as a new version. */
export async function restoreTemplateVersion(id: EmailTrigger, n: number): Promise<EmailTemplate> {
  await latency();
  const admin = requirePerm('email.manage');
  const tpl = db.templates.find((x) => x.id === id);
  const v = tpl?.versions.find((x) => x.n === n);
  if (!tpl || !v) throw new ApiError('not_found');
  tpl.content = clone(v.content);
  tpl.versions.unshift({ n: tpl.versions[0].n + 1, savedAt: new Date().toISOString(), savedBy: admin.fullName, note: `Restored version ${n}`, content: clone(v.content) });
  tpl.versions = tpl.versions.slice(0, 30);
  audit(admin, `Email template “${id}” rolled back to version ${n}`);
  commit();
  return clone(tpl);
}

export async function setTemplateEnabled(id: EmailTrigger, enabled: boolean) {
  await latency();
  const admin = requirePerm('email.manage');
  const tpl = db.templates.find((x) => x.id === id);
  if (!tpl) throw new ApiError('not_found');
  tpl.enabled = enabled;
  audit(admin, `Email “${id}” switched ${enabled ? 'on' : 'off'}`);
  commit();
}

/** Sample values for previews and test sends. */
export function sampleVars(lang: Lang): Record<string, string> {
  const o = db.orders.find((x) => x.channel === 'online') ?? db.orders[0];
  const u = db.users.find((x) => x.id === o?.userId) ?? db.users.find((x) => x.role === 'reseller')!;
  return {
    ...(o ? orderVars(db, o, u, lang) : baseVars(db, u, lang)),
    amount: eur(o?.totalCents ?? 12345, lang), receipt_number: 'RC-2026-000123', receipt_link: `${location.origin}/receipt/demo`, balance: eur(0, lang),
    reason: lang === 'it' ? 'prodotto non più disponibile' : 'product no longer available', unsubscribe_link: `${location.origin}/account#emails`,
  };
}

export async function emailPreviewOrder(): Promise<Order | null> {
  requireStaff();
  return clone(db.orders.find((x) => x.channel === 'online') ?? null);
}

export async function sendTestEmail(to: string, content: EmailContent, lang: Lang, kind: EmailTrigger | 'campaign'): Promise<EmailLog> {
  await latency();
  const admin = requirePerm('email.manage');
  if (rules.email(to)) throw new ApiError('field_invalid', { field: 'email' });
  const clean = cleanContent({ en: content, it: content }, kind)[lang];
  const o = db.orders.find((x) => x.channel === 'online');
  const rendered = compose(db, { ...clean, subject: `[TEST] ${clean.subject}` }, lang, sampleVars(lang), o);
  const log = makeLog(db, uid('e'), 'test', to.trim(), admin.fullName, rendered, new Date());
  logEmail(log);
  commit();
  return clone(log);
}

export async function emailLogs(): Promise<EmailLog[]> {
  await latency();
  requirePerm('email.manage');
  return clone(db.emails);
}

/** Tries a failed or bounced email again with the same content (MAIL-06). */
export async function resendEmail(id: string): Promise<EmailLog> {
  await latency();
  const admin = requirePerm('email.manage');
  const old = db.emails.find((e) => e.id === id);
  if (!old) throw new ApiError('not_found');
  const log: EmailLog = { ...clone(old), id: uid('e'), at: new Date().toISOString(), ...simulateDelivery(db.settings, old.to, new Date()) };
  if (log.status === 'delivered') log.error = undefined;
  logEmail(log);
  audit(admin, `Resent “${old.subject}” to ${old.to}: ${log.status}`);
  commit();
  return clone(log);
}

/* SMTP (MAIL-01): the password is write-only. */

export async function saveSmtp(input: Omit<SmtpSettings, 'passwordSet'>) {
  await latency();
  const admin = requirePerm('email.manage');
  if (input.enabled && (!input.host.trim() || !input.fromEmail.trim())) throw new ApiError('smtp_incomplete');
  if (!(Number.isInteger(input.port) && input.port > 0 && input.port < 65536)) throw new ApiError('smtp_port');
  if (input.fromEmail.trim() && rules.email(input.fromEmail)) throw new ApiError('field_invalid', { field: 'email' });
  if (input.replyTo.trim() && rules.email(input.replyTo)) throw new ApiError('field_invalid', { field: 'email' });
  const prev = db.settings.smtp;
  const password = input.password ? input.password : prev.password;
  db.settings.smtp = {
    enabled: input.enabled, host: input.host.trim(), port: input.port, security: input.security, username: input.username.trim(), password,
    passwordSet: !!password || prev.passwordSet, fromName: input.fromName.trim(), fromEmail: input.fromEmail.trim(), replyTo: input.replyTo.trim(),
  };
  audit(admin, `SMTP settings saved: ${input.enabled ? 'on' : 'off'}, ${input.host}:${input.port} (${input.security})${input.password ? ', password changed' : ''}`);
  commit();
}

export async function testSmtp(to: string): Promise<EmailLog> {
  await latency();
  const admin = requirePerm('email.manage');
  if (rules.email(to)) throw new ApiError('field_invalid', { field: 'email' });
  const s = db.settings.smtp;
  const html = `<p style="font-family:sans-serif">SMTP test from ${s.fromName} &lt;${s.fromEmail}&gt; via ${s.host}:${s.port} (${s.security.toUpperCase()}).</p>`;
  const log = makeLog(db, uid('e'), 'test', to.trim(), admin.fullName, { subject: 'SMTP connection test', html }, new Date());
  logEmail(log);
  commit();
  return clone(log);
}

/* Announcements (MAIL-07). */

function audienceUsers(a: Audience): User[] {
  const approved = db.users.filter((u) => u.role === 'reseller' && u.state === 'approved');
  switch (a.kind) {
    case 'all': return approved;
    case 'city': return approved.filter((u) => a.cityIds.includes(u.cityId));
    case 'poc': return approved.filter((u) => u.pocId && a.staffIds.includes(u.pocId));
    case 'selected': return approved.filter((u) => a.userIds.includes(u.id));
  }
}

export async function audienceSize(a: Audience): Promise<{ recipients: number; optedOut: number }> {
  requirePerm('email.manage');
  const users = audienceUsers(a);
  const out = users.filter((u) => u.marketingOptOut).length;
  return { recipients: users.length - out, optedOut: out };
}

export async function campaigns(): Promise<Campaign[]> {
  await latency();
  requirePerm('email.manage');
  return clone(db.campaigns);
}

export async function sendCampaign(input: { name: string; content: Record<Lang, EmailContent>; audience: Audience }): Promise<Campaign> {
  await latency();
  const admin = requirePerm('email.manage');
  if (!input.name.trim()) throw new ApiError('campaign_name');
  const clean = cleanContent(input.content, 'campaign');
  const users = audienceUsers(input.audience);
  const to = users.filter((u) => !u.marketingOptOut);
  if (!to.length) throw new ApiError('campaign_empty');
  const c: Campaign = { id: uid('cmp'), name: input.name.trim().slice(0, 80), content: clean, audience: clone(input.audience), sentAt: new Date().toISOString(), sentBy: admin.fullName, recipients: to.length, skippedOptOut: users.length - to.length };
  const now = new Date();
  for (const u of to) {
    const content = clean[u.lang];
    // Every announcement carries an unsubscribe link, even if the template forgot it (GDPR / ePrivacy).
    const withUnsub = /unsubscribe_link/.test(JSON.stringify(content)) ? content : {
      ...content,
      blocks: [...content.blocks, { id: 'unsub', type: 'text' as const, html: u.lang === 'it' ? 'Non vuoi più ricevere questi aggiornamenti? <a href="{{unsubscribe_link}}">Annulla l’iscrizione</a>.' : 'Don’t want these updates? <a href="{{unsubscribe_link}}">Unsubscribe</a>.' }],
    };
    const vars = { ...baseVars(db, u, u.lang), unsubscribe_link: `${location.origin}/account#emails` };
    logEmail(makeLog(db, uid('e'), 'campaign', u.email, u.fullName, compose(db, withUnsub, u.lang, vars), now, { campaignId: c.id }));
  }
  db.campaigns.unshift(c);
  audit(admin, `Sent announcement “${c.name}” to ${c.recipients} resellers${c.skippedOptOut ? ` (${c.skippedOptOut} opted out)` : ''}`);
  commit();
  return clone(c);
}

/** Resellers choose whether they get announcements; order and payment emails always go out. */
export async function setMarketingOptOut(optOut: boolean) {
  await latency();
  const u = requireUser();
  u.marketingOptOut = optOut;
  audit(u, `${optOut ? 'Unsubscribed from' : 'Subscribed to'} announcements`);
  commit();
}

export async function resetDemo() {
  const session = localStorage.getItem(SESSION_KEY);
  db = createSeed();
  persist();
  if (session && !db.users.some((u) => u.id === session)) localStorage.removeItem(SESSION_KEY);
  emit({ type: 'changed' });
}
