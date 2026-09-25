// Sample data for the mock API. Everything here is example content, replaced by the real database in Phase 3.
import { orderTotals, unitPrice } from '../domain/pricing';
import { addDays, romeDateKey, romeWallTimeToUtc } from '../domain/romeTime';
import type { AuditEntry, City, Deal, Order, OrderStatus, Product, Settings, User } from '../domain/types';

export interface Db {
  version: number;
  settings: Settings;
  products: Product[];
  cities: City[];
  deals: Deal[];
  users: User[];
  orders: Order[];
  audit: AuditEntry[];
  invoiceSeq: Record<string, number>; // per Rome year (INV-01)
  orderSeq: number;
}

export const DB_VERSION = 1;

const L = (en: string, it: string) => ({ en, it });

export const seedProducts: Product[] = [
  { id: 'p1', sku: 'RIC-BAS-5', category: 'grain', name: L('Basmati Rice Premium', 'Riso Basmati Premium'), pack: L('Case of 4 × 5 kg', 'Cartone 4 × 5 kg'), tiers: [3840, 3690, 3520], stock: 420, vatRateId: 'v10', icon: 'wheat', active: true },
  { id: 'p2', sku: 'OLI-EVO-1', category: 'oil', name: L('Extra Virgin Olive Oil', 'Olio Extravergine d’Oliva'), pack: L('Case of 12 × 1 L', 'Cartone 12 × 1 L'), tiers: [7190, 6850, 6500], stock: 160, vatRateId: 'v4', icon: 'droplet', active: true },
  { id: 'p3', sku: 'LEG-CEC-1', category: 'grain', name: L('Dried Chickpeas', 'Ceci secchi'), pack: L('Case of 10 × 1 kg', 'Cartone 10 × 1 kg'), tiers: [1780, 1690, 1590], stock: 18, vatRateId: 'v4', icon: 'bean', active: true },
  { id: 'p4', sku: 'OLI-GIR-5', category: 'oil', name: L('Sunflower Oil', 'Olio di Semi di Girasole'), pack: L('Case of 6 × 5 L', 'Cartone 6 × 5 L'), tiers: [5220, 4990, 4750], stock: 240, vatRateId: 'v10', icon: 'sun', active: true },
  { id: 'p5', sku: 'LEG-LEN-1', category: 'grain', name: L('Red Lentils', 'Lenticchie Rosse'), pack: L('Case of 10 × 1 kg', 'Cartone 10 × 1 kg'), tiers: [1950, 1860, 1740], stock: 0, vatRateId: 'v4', icon: 'soup', active: true },
  { id: 'p6', sku: 'SPZ-CUR-4', category: 'spice', name: L('Ground Turmeric', 'Curcuma in Polvere'), pack: L('Case of 12 × 400 g', 'Cartone 12 × 400 g'), tiers: [2880, 2740, 2610], stock: 95, vatRateId: 'v22', icon: 'leaf', active: true },
  { id: 'p7', sku: 'FAR-000-1', category: 'flour', name: L('Soft Wheat Flour Type 00', 'Farina di Grano Tenero 00'), pack: L('Case of 10 × 1 kg', 'Cartone 10 × 1 kg'), tiers: [1190, 1130, 1070], stock: 310, vatRateId: 'v4', icon: 'croissant', active: true },
  { id: 'p8', sku: 'CON-PEL-4', category: 'canned', name: L('Peeled Tomatoes', 'Pomodori Pelati'), pack: L('Case of 24 × 400 g', 'Cartone 24 × 400 g'), tiers: [1920, 1830, 1740], stock: 75, vatRateId: 'v4', icon: 'package', active: true },
  { id: 'p9', sku: 'BEV-MAN-1', category: 'drink', name: L('Mango Nectar', 'Nettare di Mango'), pack: L('Case of 12 × 1 L', 'Cartone 12 × 1 L'), tiers: [2160, 2050, 1940], stock: 130, vatRateId: 'v22', icon: 'cup-soda', active: true },
];

export const seedCities: City[] = [
  {
    id: 'roma', name: 'Roma', minOrderCents: 30000, shippingCents: 1200, active: true,
    zones: [
      { id: 'roma-tor', name: 'Tor Pignattara', minOrderCents: null, shippingCents: null, active: true },
      { id: 'roma-cen', name: 'Centocelle', minOrderCents: null, shippingCents: null, active: true },
      { id: 'roma-esq', name: 'Esquilino', minOrderCents: null, shippingCents: null, active: true },
      { id: 'roma-cs', name: 'Centro Storico', minOrderCents: null, shippingCents: null, active: true },
      { id: 'roma-ost', name: 'Ostia', minOrderCents: null, shippingCents: 2000, active: true },
    ],
  },
  { id: 'latina', name: 'Latina', minOrderCents: null, shippingCents: 2200, active: true, zones: [{ id: 'lt-c', name: 'Centro', minOrderCents: null, shippingCents: null, active: true }, { id: 'lt-s', name: 'Latina Scalo', minOrderCents: null, shippingCents: null, active: true }] },
  { id: 'napoli', name: 'Napoli', minOrderCents: null, shippingCents: 3800, active: true, zones: [{ id: 'na-c', name: 'Centro', minOrderCents: null, shippingCents: null, active: true }, { id: 'na-f', name: 'Fuorigrotta', minOrderCents: null, shippingCents: null, active: true }] },
  { id: 'milano', name: 'Milano', minOrderCents: null, shippingCents: 4500, active: true, zones: [{ id: 'mi-c', name: 'Centro', minOrderCents: null, shippingCents: null, active: true }, { id: 'mi-l', name: 'Loreto', minOrderCents: null, shippingCents: null, active: true }] },
  { id: 'firenze', name: 'Firenze', minOrderCents: null, shippingCents: 3200, active: true, zones: [{ id: 'fi-c', name: 'Centro', minOrderCents: null, shippingCents: null, active: true }] },
];

export const seedSettings: Settings = {
  globalMinOrderCents: 80000,
  branding: { brandName: 'Afifa Wholesale', siteTitle: 'Afifa Wholesale', logoLight: null, logoDark: null, senderName: 'Afifa Wholesale' },
  business: {
    legalName: 'Afifa Distribuzione S.r.l.',
    address: 'Via Prenestina 410, 00171 Roma RM',
    vatNumber: 'IT01234567890',
    fiscalCode: '01234567890',
    rea: 'RM-1234567',
    iban: 'IT60 X054 2811 1010 0000 0123 456',
    invoicePrefix: '',
    footer: L('Thank you for your order.', 'Grazie per il tuo ordine.'),
  },
  vatRates: [
    { id: 'v22', percent: 22, label: L('Standard 22%', 'Ordinaria 22%') },
    { id: 'v10', percent: 10, label: L('Reduced 10%', 'Ridotta 10%') },
    { id: 'v4', percent: 4, label: L('Super-reduced 4%', 'Minima 4%') },
  ],
  paymentMethods: [
    { id: 'bank', kind: 'bank', enabled: true, shipOnlyAfterPayment: false, sort: 0, name: L('Bank transfer', 'Bonifico bancario'),
      instructions: L('Pay to Afifa Distribuzione S.r.l., IBAN IT60 X054 2811 1010 0000 0123 456, BIC BPMOIT22. Quote your order number as the reference.', 'Intestato ad Afifa Distribuzione S.r.l., IBAN IT60 X054 2811 1010 0000 0123 456, BIC BPMOIT22. Indica il numero d’ordine nella causale.') },
    { id: 'paypal', kind: 'paypal', enabled: true, shipOnlyAfterPayment: true, sort: 1, name: L('PayPal', 'PayPal'),
      instructions: L('Send the total to pagamenti@afifa-wholesale.it and write your order number in the note.', 'Invia il totale a pagamenti@afifa-wholesale.it e scrivi il numero d’ordine nella nota.') },
    { id: 'cod', kind: 'cod', enabled: false, shipOnlyAfterPayment: false, sort: 2, name: L('Cash on delivery', 'Contrassegno'),
      instructions: L('Pay the driver on delivery, in cash or by cheque.', 'Paga al corriere alla consegna, in contanti o con assegno.') },
  ],
  invoiceCopyToAdmin: null,
};

const baseUser = { lang: 'en' as const, password: 'wholesale1', role: 'reseller' as const };

export const seedUsers: User[] = [
  { ...baseUser, id: 'u-admin', role: 'owner', state: 'approved', fullName: 'Giulia Russo', email: 'admin@afifa.it', mobile: '3331234567', password: 'admin12345', businessName: 'Afifa Distribuzione S.r.l.', address: 'Via Prenestina 410', cityId: 'roma', zoneId: 'roma-cen', vatNumber: 'IT01234567890', fiscalCode: '01234567890', sdiOrPec: 'M5UXCR1', createdAt: '2025-01-10T09:00:00Z' },
  { ...baseUser, id: 'u-bottega', state: 'approved', fullName: 'Marco De Luca', email: 'ordini@bottegasapori.it', mobile: '3478124590', businessName: 'Bottega Sapori S.r.l.', address: 'Via Casilina 212, 00176 Roma', cityId: 'roma', zoneId: 'roma-tor', vatNumber: 'IT09876543210', fiscalCode: '09876543210', sdiOrPec: 'KRRH6B9', createdAt: '2025-03-02T10:00:00Z', licenceDoc: { name: 'visura_camerale.pdf', size: 1887436, type: 'application/pdf' }, vatDoc: { name: 'certificato_iva.pdf', size: 402113, type: 'application/pdf' } },
  { ...baseUser, id: 'u-esq', state: 'approved', fullName: 'Rahim Hossain', email: 'info@alimentariesquilino.it', mobile: '3285550101', businessName: 'Alimentari Esquilino', address: 'Via Principe Amedeo 88, 00185 Roma', cityId: 'roma', zoneId: 'roma-esq', vatNumber: 'IT11122233344', fiscalCode: '11122233344', sdiOrPec: 'alimentariesquilino@pec.it', createdAt: '2025-04-11T10:00:00Z' },
  { ...baseUser, id: 'u-riso', state: 'approved', fullName: 'Anna Ferri', email: 'ordini@casadelriso.it', mobile: '3401112233', businessName: 'Casa del Riso', address: 'Corso della Repubblica 15, 04100 Latina', cityId: 'latina', zoneId: 'lt-c', vatNumber: 'IT22233344455', fiscalCode: '22233344455', sdiOrPec: 'SUBM70N', createdAt: '2025-05-20T10:00:00Z' },
  { ...baseUser, id: 'u-sud', state: 'approved', fullName: 'Salvatore Esposito', email: 'acquisti@emporiosud.it', mobile: '3394445566', businessName: 'Emporio Sud', address: 'Via Leopardi 40, 80125 Napoli', cityId: 'napoli', zoneId: 'na-f', vatNumber: 'IT04561237890', fiscalCode: '04561237890', sdiOrPec: 'T04ZHR3', createdAt: '2025-06-01T10:00:00Z' },
  { ...baseUser, id: 'u-mil', state: 'approved', fullName: 'Paolo Colombo', email: 'ordini@saporidoriente.it', mobile: '3317778899', businessName: 'Sapori d’Oriente', address: 'Viale Monza 120, 20127 Milano', cityId: 'milano', zoneId: 'mi-l', vatNumber: 'IT33344455566', fiscalCode: '33344455566', sdiOrPec: 'W7YVJK9', createdAt: '2025-07-01T10:00:00Z' },
  { ...baseUser, id: 'u-p1', state: 'pending', fullName: 'Kamal Uddin', email: 'minimarket.pigneto@gmail.com', mobile: '3201239876', businessName: 'Mini Market Pigneto', address: 'Via del Pigneto 51, 00176 Roma', cityId: 'roma', zoneId: 'roma-tor', vatNumber: 'IT09876543211', fiscalCode: '09876543211', sdiOrPec: '0000000', createdAt: '', licenceDoc: { name: 'licenza.pdf', size: 902331, type: 'application/pdf' }, vatDoc: { name: 'iva.jpg', size: 1302331, type: 'image/jpeg' } },
  { ...baseUser, id: 'u-p2', state: 'pending', fullName: 'Lucia Romano', email: 'emporio.vomero@libero.it', mobile: '3475556677', businessName: 'Emporio Vomero', address: 'Via Scarlatti 70, 80127 Napoli', cityId: 'napoli', zoneId: 'na-c', vatNumber: 'IT04561237891', fiscalCode: '04561237891', sdiOrPec: 'emporiovomero@pec.it', createdAt: '', licenceDoc: { name: 'visura.pdf', size: 702331, type: 'application/pdf' }, vatDoc: { name: 'piva.pdf', size: 302331, type: 'application/pdf' } },
  { ...baseUser, id: 'u-p3', state: 'pending', fullName: 'Arif Chowdhury', email: 'bazar.tor@gmail.com', mobile: '3292223344', businessName: 'Bazar Torpignattara', address: 'Via di Tor Pignattara 140, 00177 Roma', cityId: 'roma', zoneId: 'roma-tor', vatNumber: 'IT13579246801', fiscalCode: '13579246801', sdiOrPec: 'USAL8PV', createdAt: '', licenceDoc: { name: 'licence.docx', size: 402331, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, vatDoc: { name: 'vat.png', size: 2302331, type: 'image/png' } },
];

/** Deterministic pseudo-random numbers so the demo dashboard looks the same on every reset. */
function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function seedDeals(today: string): Deal[] {
  const mk = (id: string, productId: string, date: string, pct: number, limit: number, cap: number | null, sold: number, featured: boolean, sort: number): Deal => {
    const p = seedProducts.find((x) => x.id === productId)!;
    return { id, productId, date, priceCents: Math.round((p.tiers[0] * (100 - pct)) / 100), perResellerLimit: limit, stockCap: cap, sold, featured, sort, cancelled: false };
  };
  const tomorrow = addDays(today, 1);
  return [
    mk('d1', 'p1', today, 20, 20, 100, 62, true, 0),
    mk('d2', 'p6', today, 30, 15, 50, 41, false, 1),
    mk('d3', 'p8', today, 20, 30, 100, 88, false, 2),
    mk('d4', 'p4', today, 20, 20, 120, 54, false, 3),
    mk('d5', 'p7', today, 20, 40, 200, 60, false, 4),
    mk('d6', 'p2', tomorrow, 15, 10, 60, 0, true, 0),
    mk('d7', 'p9', tomorrow, 25, 24, null, 0, false, 1),
  ];
}

function buildOrder(db: Pick<Db, 'products' | 'cities' | 'settings'>, seq: number, invSeq: number, user: User, placedAt: Date, items: [string, number][], status: OrderStatus, paid: boolean): Order {
  const city = db.cities.find((c) => c.id === user.cityId)!;
  const zone = city.zones.find((z) => z.id === user.zoneId);
  const lines = items.map(([pid, qty]) => {
    const p = db.products.find((x) => x.id === pid)!;
    const price = unitPrice(p, qty, undefined);
    const vatPercent = db.settings.vatRates.find((v) => v.id === p.vatRateId)!.percent;
    return { productId: p.id, sku: p.sku, name: p.name, pack: p.pack, qty, unitCents: price.unitCents, source: price.source, vatPercent, lineCents: price.unitCents * qty };
  });
  const ship = zone?.shippingCents ?? city.shippingCents;
  const t = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), ship);
  const pm = db.settings.paymentMethods[seq % 2];
  const year = romeDateKey(placedAt).slice(0, 4);
  const flow: OrderStatus[] = ['received', 'confirmed', 'packed', 'shipped', 'delivered'];
  const upto = flow.indexOf(status);
  return {
    id: `o${seq}`,
    number: `AF-${year}-${String(seq).padStart(5, '0')}`,
    invoiceNumber: `${year}/${String(invSeq).padStart(6, '0')}`,
    userId: user.id,
    businessName: user.businessName,
    cityId: city.id,
    cityName: city.name,
    zoneName: zone?.name ?? '',
    address: user.address,
    lines,
    subtotalCents: t.subtotalCents,
    shippingCents: t.shippingCents,
    vat: t.vat,
    totalCents: t.totalCents,
    paymentMethodId: pm.id,
    paymentMethodName: pm.name,
    paymentInstructions: pm.instructions,
    paymentStatus: paid ? 'paid' : 'awaiting',
    payment: paid ? { receivedOn: romeDateKey(new Date(placedAt.getTime() + 86400000)), amountCents: t.totalCents, reference: `CRO ${1000 + seq}`, note: '' } : undefined,
    status,
    history: flow.slice(0, upto + 1).map((s, i) => ({ status: s, at: new Date(placedAt.getTime() + i * 5 * 3600000).toISOString() })),
    placedAt: placedAt.toISOString(),
    romeDate: romeDateKey(placedAt),
    lang: user.lang,
    emailSentAt: placedAt.toISOString(),
  };
}

export function createSeed(now = new Date()): Db {
  const today = romeDateKey(now);
  const base = { products: structuredClone(seedProducts), cities: structuredClone(seedCities), settings: structuredClone(seedSettings) };
  const users = structuredClone(seedUsers).map((u, i) => (u.createdAt ? u : { ...u, createdAt: new Date(now.getTime() - (i - 5) * 7 * 3600000).toISOString() }));
  const buyers = users.filter((u) => u.role === 'reseller' && u.state === 'approved');
  const rnd = prng(42);
  const orders: Order[] = [];
  let seq = 1400;
  let inv = 0;
  const year = today.slice(0, 4);
  // ~12 weeks of history, growing slowly, for the dashboard chart.
  for (let day = 84; day >= 1; day--) {
    const perDay = rnd() < 0.35 ? 0 : 1 + Math.floor(rnd() * (2 + (84 - day) / 40));
    for (let k = 0; k < perDay; k++) {
      const user = buyers[Math.floor(rnd() * buyers.length)];
      const placedAt = romeWallTimeToUtc(addDays(today, -day), `${9 + Math.floor(rnd() * 9)}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`);
      const n = 2 + Math.floor(rnd() * 3);
      const items: [string, number][] = [];
      const pool = base.products.filter((p) => p.stock > 0);
      for (let j = 0; j < n; j++) {
        const p = pool[Math.floor(rnd() * pool.length)];
        if (!items.some((it) => it[0] === p.id)) items.push([p.id, 2 + Math.floor(rnd() * (user.cityId === 'roma' ? 8 : 16))]);
      }
      const age = day;
      const status: OrderStatus = age > 4 ? 'delivered' : age > 2 ? 'shipped' : age > 1 ? 'packed' : 'confirmed';
      seq += 1;
      if (placedAt.toISOString().slice(0, 4) === year) inv += 1;
      orders.push(buildOrder(base, seq, inv, user, placedAt, items, status, age > 3 || rnd() > 0.5));
    }
  }
  // Two fresh orders today so the admin has something new to act on.
  for (const [uid, items] of [['u-esq', [['p2', 6], ['p1', 8], ['p3', 4]]], ['u-riso', [['p1', 14], ['p4', 6]]]] as const) {
    seq += 1;
    inv += 1;
    const u = users.find((x) => x.id === uid)!;
    orders.push(buildOrder(base, seq, inv, u, new Date(now.getTime() - (seq % 3 + 1) * 1500000), items.map((x) => [x[0], x[1]] as [string, number]), 'received', false));
  }
  orders.reverse();
  return {
    version: DB_VERSION,
    ...base,
    deals: seedDeals(today),
    users,
    orders,
    audit: [
      { id: 'a2', at: new Date(now.getTime() - 3600000 * 5).toISOString(), actor: 'Giulia Russo', action: 'Napoli shipping fee €35.00 → €38.00' },
      { id: 'a1', at: new Date(now.getTime() - 3600000 * 22).toISOString(), actor: 'Giulia Russo', action: 'Approved reseller Casa del Riso (Latina)' },
    ],
    invoiceSeq: { [year]: inv },
    orderSeq: seq,
  };
}
