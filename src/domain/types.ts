// Domain types shared by the UI and the (mock) API. Money is always integer cents, excluding VAT.

export type Lang = 'en' | 'it';
export type Localized = Record<Lang, string>;

/** Category ids are records now (Admin › Categories); the seed keeps the original ids like 'grain'. */
export type CategoryId = string;

export interface Category {
  id: string;
  name: Localized;
  /** Built-in line icon name (see ProductIcon), used when there is no uploaded image. */
  icon: string;
  /** Uploaded SVG/PNG as a data URL (CAT-02). */
  image: string | null;
  sort: number;
  active: boolean;
}

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
  /** Case price for each quantity band in Settings › Pricing, lowest quantity first. */
  tiers: number[];
  stock: number;
  vatRateId: string;
  icon: string;
  active: boolean;
  description: Localized;
  /** Product photo (data URL in the mock; a CDN URL in production). null = category icon. */
  image: string | null;
  /** Best-before date of the batch currently in stock, YYYY-MM-DD. */
  expiryDate: string | null;
  brand: string;
  origin: string; // country of origin
  ean: string; // barcode printed on the case
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
/** A user is either a reseller (buyer) or staff; staff get their permissions from a role (USR, ROLE). */
export type Role = 'reseller' | 'staff';

export const PERMISSIONS = [
  'orders.view', 'orders.edit', 'orders.status', 'orders.cancel', 'orders.export', 'payments.record',
  'resellers.view', 'resellers.create', 'resellers.edit', 'resellers.approve', 'resellers.delete', 'resellers.import',
  'products.view', 'products.edit', 'categories.edit', 'deals.edit', 'rules.edit',
  'settings.edit', 'users.manage', 'audit.view',
  'pos.use', 'pos.discount', 'reports.view', 'commissions.manage', 'email.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface StaffRole {
  id: string;
  name: string;
  builtIn: boolean;
  permissions: Permission[];
}

export interface UploadedDoc {
  name: string;
  size: number;
  type: string;
  /** Key of the file in the browser file store (mock); a storage key in production. Seed documents have none. */
  fileId?: string;
  uploadedBy?: 'applicant' | 'admin';
  uploadedAt?: string;
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
  /** Extra files, e.g. a licence the admin received by email (APR-03). */
  extraDocs?: UploadedDoc[];
  lang: Lang;
  createdAt: string;
  reviewNote?: string;
  /** Resellers: the staff member who looks after this account and earns commission on its sales (TEAM-01). */
  pocId?: string | null;
  /** Resellers: opted out of announcements (bulk email). Order and payment emails are always sent. */
  marketingOptOut?: boolean;
  /** Staff only. */
  roleId?: string;
  /** Staff only: commission on the net sales of assigned resellers, in percent (e.g. 3.5). */
  commissionPct?: number;
  /** Filled by the API on `me()`: what this user may do. */
  permissions?: Permission[];
}

/** All payments are manual (PAY). The kind picks the icon and what the reference field means. */
export type PaymentKind = 'bank' | 'paypal' | 'stripe' | 'bkash' | 'cash' | 'card' | 'other';
export const PAYMENT_KINDS: PaymentKind[] = ['bank', 'paypal', 'stripe', 'bkash', 'cash', 'card', 'other'];

/** What the admin enters when money arrives. */
export interface PaymentInput {
  kind: PaymentKind;
  receivedOn: string;
  amountCents: number;
  reference: string; // transaction / reference number
  note: string;
}

/** A recorded payment. Each one has its own numbered receipt, visible to the admin and the buyer. */
export interface PaymentRecord extends PaymentInput {
  id: string;
  receiptNumber: string; // RC-2026-000031, sequential per Rome year
  recordedAt: string;
  recordedBy: string;
  emailedAt: string | null;
}

export interface PaymentMethod {
  id: string;
  kind: PaymentKind;
  name: Localized;
  instructions: Localized;
  enabled: boolean;
  shipOnlyAfterPayment: boolean;
  sort: number;
}

/** Received → Confirmed → Shipped → Completed (key 'delivered'), or Cancelled. */
export type OrderStatus = 'received' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'awaiting' | 'paid' | 'partial' | 'refunded';
export type PriceSource = `tier_${number}` | 'manual' | `deal:${string}`;

/**
 * Price bands by quantity, e.g. starts [3, 21, 41] = 3–20, 21–40, 41+ (Settings › Pricing).
 * starts[0] is the minimum quantity per product line.
 */
export interface QtyBands {
  starts: number[];
}

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

/** Whole-order discount (POS-03). Lines keep list prices; the discount is split across them by value for VAT. */
export interface OrderDiscount {
  kind: 'percent' | 'fixed';
  /** Percent (e.g. 5 = 5%) or cents, as entered. */
  value: number;
  /** What it came to, in cents excl. VAT. */
  cents: number;
  reason: string;
}

export type OrderChannel = 'online' | 'pos';

export interface Order {
  id: string;
  number: string; // AF-2026-01482
  invoiceNumber: string; // 2026/000123
  /** 'online' = placed by the reseller in the shop; 'pos' = rung up at the counter by staff. */
  channel: OrderChannel;
  /** POS: who rang it up. */
  cashier?: string;
  /** POS: cash handed over and change given, for the till receipt. */
  tenderedCents?: number;
  discount?: OrderDiscount;
  /** Staff id of the reseller's point of contact when the order was placed (commission goes to them). */
  pocId?: string | null;
  /** Reseller id, or '' for a walk-in POS customer. */
  userId: string;
  businessName: string;
  cityId: string;
  cityName: string;
  zoneName: string;
  address: string;
  lines: OrderLine[];
  /** Goods net of any discount, excl. VAT and shipping. Sales reports and commission use this. */
  subtotalCents: number;
  shippingCents: number;
  vat: VatSummaryRow[];
  totalCents: number;
  paymentMethodId: string;
  paymentMethodName: Localized;
  paymentInstructions: Localized;
  paymentStatus: PaymentStatus;
  payments: PaymentRecord[];
  editedAt?: string;
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

export interface FooterLink {
  label: Localized;
  /** /internal-path, https://…, mailto: or tel: */
  href: string;
}

/** Global footer shown on the shop and the admin console (Settings › Footer). */
export interface FooterSettings {
  showOnShop: boolean;
  showOnAdmin: boolean;
  about: Localized;
  email: string;
  phone: string;
  address: string;
  hours: Localized;
  links: FooterLink[];
  /** Bottom line. {year} is replaced with the current year. */
  copyright: Localized;
}

/** Background photo behind the Today's Sale banner (Admin › Today's Sale). */
export interface SaleBanner {
  image: string | null;
  /** How visible the photo is behind the fade, 0.15–0.9. */
  strength: number;
}

/** POS rules (Settings › POS). */
export interface PosSettings {
  /** Largest discount a cashier may give without the pos.discount permission, in percent of the goods. */
  maxDiscountPct: number;
  /** Walk-in sales use this city's VAT context and appear under it in reports. */
  storeCityId: string;
  /** Printed at the bottom of the till receipt. */
  receiptFooter: Localized;
}

/** Commission rules (Settings › Commission). */
export interface CommissionSettings {
  /** Used for staff without their own rate. */
  defaultPct: number;
  /** Commission becomes payable when the order is fully paid, or when it is completed (delivered). */
  payableWhen: 'paid' | 'delivered';
}

/* ---------- Email (MAIL) ---------- */

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  security: 'tls' | 'ssl' | 'none';
  username: string;
  /** Write-only: the API never returns it, only whether one is stored. */
  password?: string;
  passwordSet: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

/** Look of every email (logo, colours, footer). Templates only hold the content blocks. */
export interface EmailTheme {
  showLogo: boolean;
  accent: string; // #rrggbb
  background: string;
  footer: Localized;
}

export const EMAIL_TRIGGERS = [
  'order_placed', 'order_cancelled', 'order_shipped', 'order_completed', 'payment_received', 'application_received', 'application_rejected',
] as const;
export type EmailTrigger = (typeof EMAIL_TRIGGERS)[number];

export type EmailBlock =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; html: string }
  | { id: string; type: 'button'; label: string; url: string }
  | { id: string; type: 'image'; src: string; alt: string; width: number }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; size: number }
  | { id: string; type: 'order' };

export interface EmailContent {
  subject: string;
  blocks: EmailBlock[];
}

export interface EmailTemplateVersion {
  n: number;
  savedAt: string;
  savedBy: string;
  note: string;
  content: Record<Lang, EmailContent>;
}

export interface EmailTemplate {
  id: EmailTrigger;
  enabled: boolean;
  content: Record<Lang, EmailContent>;
  /** Newest first. The current content is always versions[0]. */
  versions: EmailTemplateVersion[];
}

export type EmailStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';

export interface EmailLog {
  id: string;
  at: string;
  to: string;
  toName: string;
  subject: string;
  /** Trigger, 'campaign' for announcements, or 'test'. */
  kind: EmailTrigger | 'campaign' | 'test';
  status: EmailStatus;
  events: { status: EmailStatus; at: string; detail?: string }[];
  error?: string;
  orderId?: string;
  campaignId?: string;
  /** Rendered HTML as sent, so the log shows exactly what the recipient got. */
  html: string;
}

export type Audience = { kind: 'all' } | { kind: 'city'; cityIds: string[] } | { kind: 'poc'; staffIds: string[] } | { kind: 'selected'; userIds: string[] };

export interface Campaign {
  id: string;
  name: string;
  content: Record<Lang, EmailContent>;
  audience: Audience;
  sentAt: string;
  sentBy: string;
  recipients: number;
  skippedOptOut: number;
}

/* ---------- Commission (COM) ---------- */

/**
 * One commission line per order with a point of contact. `pending` until the order is paid (or completed,
 * per settings); `payable` then; `paid` once included in a payout; `void` if the order was cancelled.
 * Changes after payout are booked as separate adjustment lines, so a paid statement never changes.
 */
export interface CommissionEntry {
  id: string;
  orderId: string;
  orderNumber: string;
  staffId: string;
  resellerId: string;
  businessName: string;
  romeDate: string;
  baseCents: number;
  pct: number;
  amountCents: number;
  status: 'pending' | 'payable' | 'paid' | 'void';
  adjustment: boolean;
  payoutId?: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  number: string; // PO-2026-0007
  staffId: string;
  staffName: string;
  entryIds: string[];
  amountCents: number;
  kind: PaymentKind;
  reference: string;
  paidOn: string;
  note: string;
  recordedBy: string;
  recordedAt: string;
}

export interface Settings {
  globalMinOrderCents: number;
  pos: PosSettings;
  commission: CommissionSettings;
  smtp: SmtpSettings;
  emailTheme: EmailTheme;
  saleBanner: SaleBanner;
  pricing: QtyBands;
  footer: FooterSettings;
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
