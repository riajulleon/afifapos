// Sample data for the mock API. Everything here is example content, replaced by the real database in Phase 3.
import { syncOrderCommission } from '../domain/commission';
import { defaultTemplates } from '../domain/email';
import { eur } from '../domain/money';
import { baseVars, compose, makeLog, markOpened, orderVars } from './mailer';
import { DEFAULT_BANDS, discountAmount, orderTotals, unitPrice } from '../domain/pricing';
import { addDays, romeDateKey, romeWallTimeToUtc } from '../domain/romeTime';
import {
  EMAIL_TRIGGERS, PERMISSIONS, type AuditEntry, type Campaign, type Category, type City, type CommissionEntry, type Deal, type EmailLog, type EmailTemplate,
  type Order, type OrderStatus, type Payout, type Permission, type Product, type Settings, type StaffRole, type User,
} from '../domain/types';

export interface Db {
  version: number;
  settings: Settings;
  products: Product[];
  cities: City[];
  deals: Deal[];
  users: User[];
  roles: StaffRole[];
  categories: Category[];
  orders: Order[];
  audit: AuditEntry[];
  commissions: CommissionEntry[];
  payouts: Payout[];
  templates: EmailTemplate[];
  emails: EmailLog[];
  campaigns: Campaign[];
  invoiceSeq: Record<string, number>; // per Rome year (INV-01)
  receiptSeq: Record<string, number>; // per Rome year
  payoutSeq: Record<string, number>; // per Rome year
  orderSeq: number;
}

export const DB_VERSION = 6; // v6: POS, points of contact and commission, email templates and log

const L = (en: string, it: string) => ({ en, it });

const all = [...PERMISSIONS];
const except = (...no: Permission[]) => all.filter((p) => !no.includes(p));

/** Built-in roles (ROLE-04): can be copied, not deleted. */
export const seedRoles: StaffRole[] = [
  { id: 'owner', name: 'Owner', builtIn: true, permissions: all },
  { id: 'manager', name: 'Manager', builtIn: true, permissions: except('users.manage', 'settings.edit', 'resellers.delete', 'commissions.manage', 'email.manage') },
  { id: 'warehouse', name: 'Warehouse', builtIn: true, permissions: ['orders.view', 'orders.status', 'products.view'] },
  { id: 'accountant', name: 'Accountant', builtIn: true, permissions: ['orders.view', 'orders.export', 'payments.record', 'resellers.view', 'products.view', 'audit.view', 'reports.view', 'commissions.manage'] },
  { id: 'sales', name: 'Sales rep', builtIn: true, permissions: ['orders.view', 'resellers.view', 'products.view', 'pos.use', 'payments.record'] },
];

export const seedCategories: Category[] = [
  { id: 'grain', name: L('Rice & pulses', 'Riso e legumi'), icon: 'wheat', image: null, sort: 0, active: true },
  { id: 'oil', name: L('Oils', 'Oli'), icon: 'droplet', image: null, sort: 1, active: true },
  { id: 'spice', name: L('Spices', 'Spezie'), icon: 'leaf', image: null, sort: 2, active: true },
  { id: 'flour', name: L('Flour', 'Farine'), icon: 'croissant', image: null, sort: 3, active: true },
  { id: 'canned', name: L('Canned', 'Conserve'), icon: 'package', image: null, sort: 4, active: true },
  { id: 'drink', name: L('Drinks', 'Bevande'), icon: 'cup-soda', image: null, sort: 5, active: true },
];

type BaseProduct = Omit<Product, 'description' | 'image' | 'expiryDate' | 'brand' | 'origin' | 'ean'>;

/** Sample details per product: description, brand, origin, EAN, and days until best-before from today. */
const details: Record<string, { en: string; it: string; brand: string; origin: string; ean: string; bestBeforeDays: number }> = {
  p1: { brand: 'Royal Harvest', origin: 'India', ean: '8901234500012', bestBeforeDays: 540,
    en: 'Extra-long grain basmati aged 12 months. Cooks fluffy and separate; the best seller for restaurants and grocery shelves.',
    it: 'Basmati a chicco extra lungo invecchiato 12 mesi. In cottura resta sgranato; il più richiesto da ristoranti e negozi.' },
  p2: { brand: 'Colli Sabini', origin: 'Italia', ean: '8001234500029', bestBeforeDays: 420,
    en: 'Cold-extracted extra virgin olive oil from Lazio olives. Fruity with a light peppery finish. Glass bottles, 12 per case.',
    it: 'Olio extravergine estratto a freddo da olive del Lazio. Fruttato con leggero finale piccante. Bottiglie in vetro, 12 per cartone.' },
  p3: { brand: 'Terra Viva', origin: 'Turkey', ean: '8691234500036', bestBeforeDays: 25,
    en: 'Large dried chickpeas, ready after an overnight soak. Sold in 1 kg bags.',
    it: 'Ceci secchi di calibro grande, pronti dopo una notte in ammollo. Sacchetti da 1 kg.' },
  p4: { brand: 'Sole d’Oro', origin: 'Ukraine', ean: '4821234500043', bestBeforeDays: 300,
    en: 'Refined sunflower oil for frying and baking. High smoke point, neutral taste. 5 L jerry cans.',
    it: 'Olio di semi di girasole raffinato per frittura e forno. Alto punto di fumo, gusto neutro. Taniche da 5 L.' },
  p5: { brand: 'Terra Viva', origin: 'Canada', ean: '0621234500050', bestBeforeDays: 380,
    en: 'Split red lentils, no soaking needed. Cook in 15 minutes for dal and soups.',
    it: 'Lenticchie rosse decorticate, senza ammollo. Cuociono in 15 minuti, ideali per dal e zuppe.' },
  p6: { brand: 'Spice Route', origin: 'India', ean: '8901234500067', bestBeforeDays: 610,
    en: 'Finely ground turmeric with high curcumin content. Resealable 400 g pouches.',
    it: 'Curcuma macinata fine ad alto contenuto di curcumina. Buste richiudibili da 400 g.' },
  p7: { brand: 'Molino Aurelio', origin: 'Italia', ean: '8001234500074', bestBeforeDays: 210,
    en: 'Soft wheat flour type 00, W 260. Good for pizza, bread and fresh pasta.',
    it: 'Farina di grano tenero tipo 00, W 260. Adatta a pizza, pane e pasta fresca.' },
  p8: { brand: 'Campo Rosso', origin: 'Italia', ean: '8001234500081', bestBeforeDays: 900,
    en: 'Whole peeled tomatoes in tomato juice, from Puglia. 400 g tins, 24 per case.',
    it: 'Pomodori pelati interi in succo di pomodoro, dalla Puglia. Latte da 400 g, 24 per cartone.' },
  p9: { brand: 'Tropica', origin: 'Pakistan', ean: '8961234500098', bestBeforeDays: 45,
    en: 'Alphonso mango nectar, 35% fruit. Tetra Pak 1 L cartons, 12 per case.',
    it: 'Nettare di mango Alphonso, 35% di frutta. Brick Tetra Pak da 1 L, 12 per cartone.' },
};

export const seedProducts: BaseProduct[] = [
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
  pos: {
    maxDiscountPct: 10,
    storeCityId: 'roma',
    receiptFooter: L('Goods sold are not returnable once opened. Thank you!', 'La merce aperta non si restituisce. Grazie!'),
  },
  commission: { defaultPct: 3, payableWhen: 'paid' },
  smtp: {
    enabled: true, host: 'smtp.afifa-wholesale.it', port: 587, security: 'tls', username: 'notifiche@afifa-wholesale.it', passwordSet: true,
    fromName: 'Afifa Wholesale', fromEmail: 'notifiche@afifa-wholesale.it', replyTo: 'ordini@afifa-wholesale.it',
  },
  emailTheme: {
    showLogo: true, accent: '#111111', background: '#f4f4f5',
    footer: L('Afifa Distribuzione S.r.l. · Via Prenestina 410, 00171 Roma · P.IVA IT01234567890', 'Afifa Distribuzione S.r.l. · Via Prenestina 410, 00171 Roma · P.IVA IT01234567890'),
  },
  pricing: { ...DEFAULT_BANDS },
  saleBanner: { image: null, strength: 0.55 },
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
    { id: 'stripe', kind: 'stripe', enabled: true, shipOnlyAfterPayment: true, sort: 2, name: L('Card (Stripe payment link)', 'Carta (link di pagamento Stripe)'),
      instructions: L('We email you a Stripe payment link for the total within 1 working hour. Pay by card from the link.', 'Ti inviamo via email un link di pagamento Stripe entro 1 ora lavorativa. Paga con carta dal link.') },
    { id: 'bkash', kind: 'bkash', enabled: true, shipOnlyAfterPayment: true, sort: 3, name: L('bKash', 'bKash'),
      instructions: L('Send the total to bKash merchant number 01700-000000 and write your order number as the reference.', 'Invia il totale al numero merchant bKash 01700-000000 e indica il numero d’ordine come riferimento.') },
    { id: 'other', kind: 'other', enabled: false, shipOnlyAfterPayment: false, sort: 4, name: L('Cash on delivery', 'Contrassegno'),
      instructions: L('Pay the driver on delivery, in cash or by cheque.', 'Paga al corriere alla consegna, in contanti o con assegno.') },
  ],
  invoiceCopyToAdmin: null,
  footer: {
    showOnShop: true,
    showOnAdmin: true,
    about: L('Wholesale food and grocery distribution for approved resellers in Rome and across Italy.', 'Distribuzione all’ingrosso di alimentari per rivenditori approvati a Roma e in tutta Italia.'),
    email: 'ordini@afifa-wholesale.it',
    phone: '+39 06 1234 5678',
    address: 'Via Prenestina 410, 00171 Roma RM',
    hours: L('Mon–Sat 08:00–18:00', 'Lun–Sab 08:00–18:00'),
    links: [
      { label: L('Today’s Sale', 'Offerte di oggi'), href: '/sale' },
      { label: L('Catalog', 'Catalogo'), href: '/catalog' },
      { label: L('Privacy policy', 'Informativa privacy'), href: 'https://afifa-wholesale.it/privacy' },
      { label: L('Terms of sale', 'Condizioni di vendita'), href: 'https://afifa-wholesale.it/terms' },
    ],
    copyright: L('© {year} Afifa Distribuzione S.r.l. · P.IVA IT01234567890 · All rights reserved.', '© {year} Afifa Distribuzione S.r.l. · P.IVA IT01234567890 · Tutti i diritti riservati.'),
  },
};

const baseUser = { lang: 'en' as const, password: 'wholesale1', role: 'reseller' as const };

export const seedUsers: User[] = [
  { ...baseUser, id: 'u-admin', role: 'staff', roleId: 'owner', state: 'approved', fullName: 'Giulia Russo', email: 'admin@afifa.it', mobile: '3331234567', password: 'admin12345', businessName: 'Afifa Distribuzione S.r.l.', address: 'Via Prenestina 410', cityId: 'roma', zoneId: 'roma-cen', vatNumber: 'IT01234567890', fiscalCode: '01234567890', sdiOrPec: 'M5UXCR1', createdAt: '2025-01-10T09:00:00Z' },
  { ...baseUser, id: 'u-wh', role: 'staff', roleId: 'warehouse', state: 'approved', fullName: 'Luca Bianchi', email: 'magazzino@afifa.it', mobile: '3339876543', password: 'warehouse1', businessName: 'Afifa Distribuzione S.r.l.', address: 'Via Prenestina 410', cityId: 'roma', zoneId: 'roma-cen', vatNumber: '', fiscalCode: '', sdiOrPec: '', createdAt: '2025-02-01T09:00:00Z', lang: 'it' },
  { ...baseUser, id: 'u-acc', role: 'staff', roleId: 'accountant', state: 'approved', fullName: 'Sara Conti', email: 'contabilita@afifa.it', mobile: '3334567890', password: 'accounts01', businessName: 'Afifa Distribuzione S.r.l.', address: 'Via Prenestina 410', cityId: 'roma', zoneId: 'roma-cen', vatNumber: '', fiscalCode: '', sdiOrPec: '', createdAt: '2025-02-15T09:00:00Z' },
  { ...baseUser, id: 'u-rep1', role: 'staff', roleId: 'sales', state: 'approved', fullName: 'Davide Marino', email: 'davide@afifa.it', mobile: '3336661122', password: 'salesrep01', commissionPct: 4, businessName: 'Afifa Distribuzione S.r.l.', address: 'Via Prenestina 410', cityId: 'roma', zoneId: 'roma-cen', vatNumber: '', fiscalCode: '', sdiOrPec: '', createdAt: '2025-03-01T09:00:00Z', lang: 'it' },
  { ...baseUser, id: 'u-rep2', role: 'staff', roleId: 'sales', state: 'approved', fullName: 'Nusrat Jahan', email: 'nusrat@afifa.it', mobile: '3336663344', password: 'salesrep02', commissionPct: 3.5, businessName: 'Afifa Distribuzione S.r.l.', address: 'Via Prenestina 410', cityId: 'roma', zoneId: 'roma-cen', vatNumber: '', fiscalCode: '', sdiOrPec: '', createdAt: '2025-04-01T09:00:00Z' },
  { ...baseUser, id: 'u-bottega', state: 'approved', pocId: 'u-rep1', fullName: 'Marco De Luca', email: 'ordini@bottegasapori.it', mobile: '3478124590', businessName: 'Bottega Sapori S.r.l.', address: 'Via Casilina 212, 00176 Roma', cityId: 'roma', zoneId: 'roma-tor', vatNumber: 'IT09876543210', fiscalCode: '09876543210', sdiOrPec: 'KRRH6B9', createdAt: '2025-03-02T10:00:00Z', licenceDoc: { name: 'visura_camerale.pdf', size: 1887436, type: 'application/pdf' }, vatDoc: { name: 'certificato_iva.pdf', size: 402113, type: 'application/pdf' } },
  { ...baseUser, id: 'u-esq', state: 'approved', pocId: 'u-rep1', fullName: 'Rahim Hossain', email: 'info@alimentariesquilino.it', mobile: '3285550101', businessName: 'Alimentari Esquilino', address: 'Via Principe Amedeo 88, 00185 Roma', cityId: 'roma', zoneId: 'roma-esq', vatNumber: 'IT11122233344', fiscalCode: '11122233344', sdiOrPec: 'alimentariesquilino@pec.it', createdAt: '2025-04-11T10:00:00Z' },
  { ...baseUser, id: 'u-riso', state: 'approved', pocId: 'u-rep1', fullName: 'Anna Ferri', email: 'ordini@casadelriso.it', mobile: '3401112233', businessName: 'Casa del Riso', address: 'Corso della Repubblica 15, 04100 Latina', cityId: 'latina', zoneId: 'lt-c', vatNumber: 'IT22233344455', fiscalCode: '22233344455', sdiOrPec: 'SUBM70N', createdAt: '2025-05-20T10:00:00Z' },
  { ...baseUser, id: 'u-sud', state: 'approved', pocId: 'u-rep2', fullName: 'Salvatore Esposito', email: 'acquisti@emporiosud.it', mobile: '3394445566', businessName: 'Emporio Sud', address: 'Via Leopardi 40, 80125 Napoli', cityId: 'napoli', zoneId: 'na-f', vatNumber: 'IT04561237890', fiscalCode: '04561237890', sdiOrPec: 'T04ZHR3', createdAt: '2025-06-01T10:00:00Z' },
  { ...baseUser, id: 'u-mil', state: 'approved', pocId: 'u-rep2', fullName: 'Paolo Colombo', email: 'ordini@saporidoriente.it', mobile: '3317778899', businessName: 'Sapori d’Oriente', address: 'Viale Monza 120, 20127 Milano', cityId: 'milano', zoneId: 'mi-l', vatNumber: 'IT33344455566', fiscalCode: '33344455566', sdiOrPec: 'W7YVJK9', createdAt: '2025-07-01T10:00:00Z' },
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


interface BuildOpts {
  channel?: 'online' | 'pos';
  discount?: { kind: 'percent' | 'fixed'; value: number; reason: string };
  payKind?: 'cash' | 'card';
  cashier?: string;
}

function buildOrder(db: Pick<Db, 'products' | 'cities' | 'settings'>, seq: number, invSeq: number, rcSeq: () => number, user: User, placedAt: Date, items: [string, number][], status: OrderStatus, paid: boolean, opts: BuildOpts = {}): Order {
  const pos = opts.channel === 'pos';
  const city = db.cities.find((c) => c.id === user.cityId)!;
  const zone = city.zones.find((z) => z.id === user.zoneId);
  const lines = items.map(([pid, qty]) => {
    const p = db.products.find((x) => x.id === pid)!;
    const price = unitPrice(p, qty, undefined, db.settings.pricing);
    const vatPercent = db.settings.vatRates.find((v) => v.id === p.vatRateId)!.percent;
    return { productId: p.id, sku: p.sku, name: p.name, pack: p.pack, qty, unitCents: price.unitCents, source: price.source, vatPercent, lineCents: price.unitCents * qty };
  });
  const ship = pos ? 0 : zone?.shippingCents ?? city.shippingCents;
  const goods = lines.reduce((a, l) => a + l.lineCents, 0);
  const discount = opts.discount ? { ...opts.discount, cents: discountAmount(opts.discount.kind, opts.discount.value, goods) } : undefined;
  const t = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), ship, discount?.cents ?? 0);
  const pm = db.settings.paymentMethods[seq % 2];
  const year = romeDateKey(placedAt).slice(0, 4);
  const flow: OrderStatus[] = ['received', 'confirmed', 'shipped', 'delivered'];
  const upto = flow.indexOf(status);
  const kind = pos ? opts.payKind ?? 'cash' : pm.kind;
  const tendered = pos && kind === 'cash' ? Math.ceil(t.totalCents / 1000) * 1000 : undefined;
  return {
    id: `o${seq}`,
    number: `AF-${year}-${String(seq).padStart(5, '0')}`,
    invoiceNumber: `${year}/${String(invSeq).padStart(6, '0')}`,
    channel: pos ? 'pos' : 'online',
    ...(pos ? { cashier: opts.cashier ?? 'Giulia Russo', tenderedCents: tendered } : {}),
    ...(discount ? { discount } : {}),
    pocId: user.pocId ?? null,
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
    paymentMethodId: pos ? `pos-${kind}` : pm.id,
    paymentMethodName: pos ? (kind === 'cash' ? L('Cash', 'Contanti') : L('Card', 'Carta')) : pm.name,
    paymentInstructions: pos ? L('Paid at the counter.', 'Pagato al banco.') : pm.instructions,
    paymentStatus: paid ? 'paid' : 'awaiting',
    payments: paid
      ? [(() => {
          const at = pos ? placedAt : new Date(placedAt.getTime() + 86400000);
          const reference = pos ? (kind === 'cash' ? 'Cash' : `AUTH ${String(100000 + seq * 37).slice(-6)}`) : kind === 'bank' ? `CRO ${40000 + seq * 7}` : `8XY${seq}AB67890`;
          return { id: `pay${seq}`, receiptNumber: `RC-${romeDateKey(at).slice(0, 4)}-${String(rcSeq()).padStart(6, '0')}`, kind, receivedOn: romeDateKey(at), amountCents: t.totalCents, reference, note: '', recordedAt: at.toISOString(), recordedBy: opts.cashier ?? 'Giulia Russo', emailedAt: at.toISOString() };
        })()]
      : [],
    status,
    history: flow.slice(0, upto + 1).map((s, i) => ({ status: s, at: new Date(placedAt.getTime() + (pos ? i * 1000 : i * 5 * 3600000)).toISOString() })),
    placedAt: placedAt.toISOString(),
    romeDate: romeDateKey(placedAt),
    lang: user.lang,
    emailSentAt: placedAt.toISOString(),
  };
}

/** Walk-in counter customers have no account; the order keeps their name for the till receipt. */
export const WALK_IN = (name: string, store: { cityId: string; zoneId: string; address: string }): User => ({
  id: '', role: 'reseller', state: 'approved', fullName: name, email: '', mobile: '', password: '', businessName: name, address: store.address,
  cityId: store.cityId, zoneId: store.zoneId, vatNumber: '', fiscalCode: '', sdiOrPec: '', lang: 'it', createdAt: '', pocId: null,
});

export function createSeed(now = new Date()): Db {
  const today = romeDateKey(now);
  const products: Product[] = seedProducts.map((p) => {
    const d = details[p.id];
    return { ...p, description: { en: d.en, it: d.it }, image: null, expiryDate: addDays(today, d.bestBeforeDays), brand: d.brand, origin: d.origin, ean: d.ean };
  });
  const base = { products, cities: structuredClone(seedCities), settings: structuredClone(seedSettings) };
  const users = structuredClone(seedUsers).map((u, i) => (u.createdAt ? u : { ...u, createdAt: new Date(now.getTime() - (i - 7) * 7 * 3600000).toISOString() }));
  const buyers = users.filter((u) => u.role === 'reseller' && u.state === 'approved');
  const rnd = prng(42);
  const rndPos = prng(7);
  const orders: Order[] = [];
  let seq = 1400;
  let inv = 0;
  let rc = 0;
  const nextRc = () => ++rc;
  const year = today.slice(0, 4);
  const store = { cityId: 'roma', zoneId: 'roma-cen', address: 'Via Prenestina 410, 00171 Roma' };
  const walkIns = ['Cliente al banco', 'Ristorante Il Glicine', 'Pizzeria Da Enzo', 'Kebab Istanbul', 'Bar Centrale'];
  const cashiers = ['Giulia Russo', 'Davide Marino', 'Nusrat Jahan'];
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
        if (!items.some((it) => it[0] === p.id)) items.push([p.id, 3 + Math.floor(rnd() * (user.cityId === 'roma' ? 10 : 30))]);
      }
      const age = day;
      const status: OrderStatus = age > 4 ? 'delivered' : age > 2 ? 'shipped' : 'confirmed';
      seq += 1;
      if (placedAt.toISOString().slice(0, 4) === year) inv += 1;
      orders.push(buildOrder(base, seq, inv, nextRc, user, placedAt, items, status, age > 3 || rnd() > 0.5));
    }
    // Counter sales on about a third of days (POS), paid on the spot.
    if (rndPos() < 0.34) {
      const pool = base.products.filter((p) => p.stock > 0);
      const items: [string, number][] = [];
      for (let j = 0, n = 1 + Math.floor(rndPos() * 3); j < n; j++) {
        const p = pool[Math.floor(rndPos() * pool.length)];
        if (!items.some((it) => it[0] === p.id)) items.push([p.id, 1 + Math.floor(rndPos() * 6)]);
      }
      const reseller = rndPos() < 0.3 ? buyers.find((b) => b.cityId === 'roma') : undefined;
      const who = reseller ?? WALK_IN(walkIns[Math.floor(rndPos() * walkIns.length)], store);
      const disc = rndPos() < 0.35 ? (rndPos() < 0.5 ? { kind: 'percent' as const, value: 5, reason: 'Regular customer' } : { kind: 'fixed' as const, value: 500, reason: 'Rounded down' }) : undefined;
      seq += 1;
      inv += 1;
      const placedAt = romeWallTimeToUtc(addDays(today, -day), `${10 + Math.floor(rndPos() * 8)}:${String(Math.floor(rndPos() * 60)).padStart(2, '0')}:00`);
      orders.push(buildOrder(base, seq, inv, nextRc, who, placedAt, items, 'delivered', true, { channel: 'pos', discount: disc, payKind: rndPos() < 0.55 ? 'cash' : 'card', cashier: cashiers[Math.floor(rndPos() * cashiers.length)] }));
    }
  }
  // Two fresh orders today so the admin has something new to act on.
  for (const [uid, items] of [['u-esq', [['p2', 6], ['p1', 8], ['p3', 4]]], ['u-riso', [['p1', 14], ['p4', 6]]]] as const) {
    seq += 1;
    inv += 1;
    const u = users.find((x) => x.id === uid)!;
    orders.push(buildOrder(base, seq, inv, nextRc, u, new Date(now.getTime() - (seq % 3 + 1) * 1500000), items.map((x) => [x[0], x[1]] as [string, number]), 'received', false));
  }

  // Commission: one line per order with a point of contact; last month's payable lines were paid out on the 5th.
  const commissions: CommissionEntry[] = [];
  let cseq = 0;
  for (const o of orders) {
    const pct = users.find((u) => u.id === o.pocId)?.commissionPct ?? base.settings.commission.defaultPct;
    const r = syncOrderCommission(o, commissions, pct, base.settings.commission, () => `c${++cseq}`, o.placedAt);
    commissions.push(...r.add);
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  const payDay = addDays(monthStart, 4) <= today ? addDays(monthStart, 4) : monthStart;
  const payouts: Payout[] = [];
  const payoutSeq: Record<string, number> = {};
  for (const rep of users.filter((u) => u.roleId === 'sales')) {
    const due = commissions.filter((c) => c.staffId === rep.id && c.status === 'payable' && c.romeDate < monthStart);
    if (!due.length) continue;
    const y = payDay.slice(0, 4);
    payoutSeq[y] = (payoutSeq[y] ?? 0) + 1;
    const id = `po${payoutSeq[y]}`;
    const amount = due.reduce((a, c) => a + c.amountCents, 0);
    due.forEach((c) => { c.status = 'paid'; c.payoutId = id; });
    payouts.push({
      id, number: `PO-${y}-${String(payoutSeq[y]).padStart(4, '0')}`, staffId: rep.id, staffName: rep.fullName, entryIds: due.map((c) => c.id), amountCents: amount,
      kind: 'bank', reference: `SEPA ${payDay.replace(/-/g, '')}-${payoutSeq[y]}`, paidOn: payDay, note: 'Monthly commission', recordedBy: 'Sara Conti', recordedAt: romeWallTimeToUtc(payDay, '11:00:00').toISOString(),
    });
  }

  // Templates start at version 1 with the default wording.
  const defaults = defaultTemplates();
  const templates: EmailTemplate[] = EMAIL_TRIGGERS.map((id) => ({
    id, enabled: true, content: structuredClone(defaults[id]),
    versions: [{ n: 1, savedAt: '2025-03-01T09:00:00Z', savedBy: 'System', note: 'Default template', content: structuredClone(defaults[id]) }],
  }));
  const tpl = (id: string) => templates.find((x) => x.id === id)!;

  // Email log for the last week, so the log and its filters have something to show.
  const mailDb = { settings: base.settings, templates };
  const emails: EmailLog[] = [];
  let eseq = 0;
  const weekAgo = addDays(today, -7);
  for (const o of orders.filter((x) => x.romeDate >= weekAgo && x.channel === 'online')) {
    const u = users.find((x) => x.id === o.userId)!;
    const vars = orderVars(mailDb, o, u, u.lang);
    let log = makeLog(mailDb, `e${++eseq}`, 'order_placed', u.email, u.fullName, compose(mailDb, tpl('order_placed').content[u.lang], u.lang, vars, o), new Date(o.placedAt), { orderId: o.id });
    if (eseq % 3 !== 0) log = markOpened(log, new Date(Date.parse(o.placedAt) + 3600000 * (1 + (eseq % 5))));
    emails.push(log);
    for (const p of o.payments) {
      const pv = { ...vars, amount: eur(p.amountCents, u.lang), receipt_number: p.receiptNumber, receipt_link: `${vars.order_link.replace('/orders/', '/receipt/')}/${p.id}`, balance: eur(0, u.lang) };
      emails.push(makeLog(mailDb, `e${++eseq}`, 'payment_received', u.email, u.fullName, compose(mailDb, tpl('payment_received').content[u.lang], u.lang, pv), new Date(p.recordedAt), { orderId: o.id }));
    }
    const shipped = o.history.find((h) => h.status === 'shipped');
    if (shipped) emails.push(makeLog(mailDb, `e${++eseq}`, 'order_shipped', u.email, u.fullName, compose(mailDb, tpl('order_shipped').content[u.lang], u.lang, vars, o), new Date(shipped.at), { orderId: o.id }));
  }
  // One application confirmation that bounced (typo in the address), to show a failed delivery.
  const pending = users.find((u) => u.id === 'u-p3')!;
  emails.push(makeLog(mailDb, `e${++eseq}`, 'application_received', 'bazar.tor@gmial.invalid', pending.fullName, compose(mailDb, tpl('application_received').content.en, 'en', baseVars(mailDb, pending, 'en')), new Date(now.getTime() - 3600000 * 30)));
  emails.sort((a, b) => b.at.localeCompare(a.at));

  orders.reverse();
  return {
    version: DB_VERSION,
    roles: structuredClone(seedRoles),
    categories: structuredClone(seedCategories),
    ...base,
    deals: seedDeals(today),
    users,
    orders,
    commissions,
    payouts,
    templates,
    emails,
    campaigns: [],
    audit: [
      { id: 'a2', at: new Date(now.getTime() - 3600000 * 5).toISOString(), actor: 'Giulia Russo', action: 'Napoli shipping fee €35.00 → €38.00' },
      { id: 'a1', at: new Date(now.getTime() - 3600000 * 22).toISOString(), actor: 'Giulia Russo', action: 'Approved reseller Casa del Riso (Latina)' },
    ],
    invoiceSeq: { [year]: inv },
    receiptSeq: { [year]: rc },
    payoutSeq,
    orderSeq: seq,
  };
}
