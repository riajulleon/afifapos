// Domain types shared by the UI and the (mock) API. Money is always integer cents, excluding VAT.

export type Lang = 'en' | 'it';
export type Localized = Record<Lang, string>;

export type CategoryId = 'grain' | 'oil' | 'spice' | 'flour' | 'canned' | 'drink';

export interface VatRate {
  id: string;
  percent: number; // 22, 10, 4 …
  label: Localized;
}

export interface Product {
  id: string;
  sku: string;
  category: CategoryId;
  name: Localized;
  pack: Localized;
  /** Case price per tier: [1–9, 10–49, 50+] cases. */
  tiers: [number, number, number];
  stock: number;
  vatRateId: string;
  icon: string;
  active: boolean;
}

export interface Zone {
  id: string;
  name: string;
  /** null = inherit from city (MIN-03). */
  minOrderCents: number | null;
  /** null = inherit from city (ZONE-03). 0 = free delivery. */
  shippingCents: number | null;
  active: boolean;
}

export interface City {
  id: string;
  name: string;
  /** null = use the global default (MIN-02). */
  minOrderCents: number | null;
  shippingCents: number;
  zones: Zone[];
  active: boolean;
}

export interface Deal {
  id: string;
  productId: string;
  /** Rome calendar date, YYYY-MM-DD. Live 08:00–23:59:59 Rome time (DEAL-02). */
  date: string;
  priceCents: number;
  perResellerLimit: number;
  stockCap: number | null;
  sold: number;
  featured: boolean;
  sort: number;
  cancelled: boolean;
}

export type AccountState = 'pending' | 'info_requested' | 'approved' | 'rejected' | 'suspended';
export type Role = 'reseller' | 'owner' | 'manager';

export interface UploadedDoc {
  name: string;
  size: number;
  type: string;
}

export interface User {
  id: string;
  role: Role;
  state: AccountState;
  fullName: string;
  email: string;
  mobile: string; // digits only, without +39
  password: string; // mock only — the real API stores an Argon2id hash (AUTH-05)
  businessName: string;
  address: string;
  cityId: string;
  zoneId: string;
  vatNumber: string; // Partita IVA
  fiscalCode: string; // Codice Fiscale
  sdiOrPec: string; // SDI recipient code or PEC (AUTH-03)
  licenceDoc?: UploadedDoc;
  vatDoc?: UploadedDoc;
  lang: Lang;
  createdAt: string;
  reviewNote?: string;
}

export interface PaymentMethod {
  id: string;
  kind: 'bank' | 'paypal' | 'cod' | 'custom';
  name: Localized;
  instructions: Localized;
  enabled: boolean;
  shipOnlyAfterPayment: boolean;
  sort: number;
}

export type OrderStatus = 'received' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'awaiting' | 'paid' | 'partial' | 'refunded';
export type PriceSource = 'tier_1' | 'tier_2' | 'tier_3' | `deal:${string}`;

export interface OrderLine {
  productId: string;
  sku: string;
  name: Localized;
  pack: Localized;
  qty: number;
  unitCents: number;
  source: PriceSource;
  vatPercent: number;
  lineCents: number;
}

export interface VatSummaryRow {
  percent: number;
  baseCents: number;
  vatCents: number;
}

export interface Order {
  id: string;
  number: string; // AF-2026-01482
  invoiceNumber: string; // 2026/000123
  userId: string;
  businessName: string;
  cityId: string;
  cityName: string;
  zoneName: string;
  address: string;
  lines: OrderLine[];
  subtotalCents: number;
  shippingCents: number;
  vat: VatSummaryRow[];
  totalCents: number;
  paymentMethodId: string;
  paymentMethodName: Localized;
  paymentInstructions: Localized;
  paymentStatus: PaymentStatus;
  payment?: { receivedOn: string; amountCents: number; reference: string; note: string };
  status: OrderStatus;
  history: { status: OrderStatus; at: string }[];
  placedAt: string;
  romeDate: string;
  lang: Lang;
  emailSentAt: string | null;
}

export interface Branding {
  brandName: string;
  siteTitle: string;
  logoLight: string | null; // data URL in the mock; a versioned asset URL in production
  logoDark: string | null;
  senderName: string;
}

export interface BusinessDetails {
  legalName: string;
  address: string;
  vatNumber: string;
  fiscalCode: string;
  rea: string;
  iban: string;
  invoicePrefix: string;
  footer: Localized;
}

export interface Settings {
  globalMinOrderCents: number;
  branding: Branding;
  business: BusinessDetails;
  vatRates: VatRate[];
  paymentMethods: PaymentMethod[];
  invoiceCopyToAdmin: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
}
