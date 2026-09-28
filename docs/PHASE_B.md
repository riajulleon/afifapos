# Phase B — POS, team & commission, reports, email

Design and build notes for the four modules added in Phase B. Everything below runs today in the demo (mock API in
`src/api/mockServer.ts`, data in the browser). The **Schema** and **API** sections describe the production shape for
Phase 3; each mock function maps 1:1 to an endpoint, so pages and hooks don't change when the real backend lands.

Requirement IDs (`POS-03`, `COM-03` …) are used in code comments.

## Stack and conventions this follows

- Money is integer cents, excl. VAT unless named otherwise. Dates for business rules are Rome dates (`romeDate`).
- Every admin endpoint checks one permission on the server (`requirePerm`); hiding UI is only a convenience.
- Every write is audited (`audit_log`) with who, when and a before → after sentence.
- Pure rules live in `src/domain/` and are unit-tested; the API only adds permissions, storage and side effects.

## Permissions added

| Permission | Owner | Manager | Accountant | Sales rep | Warehouse |
| --- | :-: | :-: | :-: | :-: | :-: |
| `pos.use` — use the till, take counter payments | ✓ | ✓ | | ✓ | |
| `pos.discount` — discounts above the POS limit | ✓ | ✓ | | | |
| `reports.view` — reports hub, whole-team figures | ✓ | ✓ | ✓ | | |
| `commissions.manage` — rules, payouts | ✓ | | ✓ | | |
| `email.manage` — SMTP, templates, log, announcements | ✓ | | | | |

"Sales rep" is a new built-in role (orders.view, resellers.view, products.view, pos.use, payments.record).
Every staff member can open **Team › My performance** and see their own sales and commission only.

---

## 1. Point of sale (POS)

**Where:** Admin › Sales › POS (`/admin/pos`), till receipt `/admin/pos/receipt/:orderId`, Settings › POS.

**Flow:** scan an EAN or type a SKU/name (Enter adds an exact match) → tap products → pick *Walk-in* or a *Reseller* →
optional discount (% or €, reason required) → pay: Cash (tendered + change), Card (terminal auth code), Bank / PayPal /
bKash (reference), or *On account* (resellers only) → *Charge* → success sheet with change due, print receipt, open order.
The sale in progress survives a reload (sessionStorage). On phones a bottom bar keeps the total in reach.

**Rules (server-side, `posCheckout`):**
- Prices are recomputed: live Today's Sale price within the reseller's allowance, else the quantity band. No minimum
  quantity or minimum order at the counter.
- Stock is checked and taken in the same step as the order, invoice and receipt numbers (gapless sequences).
- Discount (POS-03): percent 0–100 or fixed cents; capped at the goods value; reason required; above
  Settings › POS › *max discount %* only with `pos.discount`. The discount is split across lines by value
  (largest remainder), so VAT is charged per rate on the discounted base (`orderTotals(lines, shipping, discount)`).
- Walk-ins must take the goods and pay now. Resellers may take delivery (zone fee applies, status *Confirmed*) or
  take the goods (status *Completed*).
- Cash must cover the total; non-cash needs a reference. A payment record + numbered receipt is created immediately.
- The order is a normal order with `channel = 'pos'`, so invoices, receipts, reports, commission and emails all work.

**Payment processing:** the platform today records payments made outside it (bank, PayPal, Stripe link, bKash). The
POS keeps that model: card payments are taken on a standalone terminal and the auth code is recorded. For an integrated
terminal in Phase 3 we recommend **Stripe Terminal** (EU readers, same Stripe account as the payment links); the
`payment` object in `posCheckout` then carries the PaymentIntent id instead of a typed reference.

> **Italy — fiscal receipts.** Sales to consumers without a VAT number need a *documento commerciale* from a
> *registratore telematico* (RT). The till receipt here is marked *not a fiscal receipt*. Before using the POS for
> walk-in consumers, connect an RT (most expose an HTTP/XML API) or issue an invoice for every sale. B2B sales to
> resellers are covered by the invoice.

## 2. Team: points of contact and commission

**Where:** Reseller page › *Point of contact*; Admin › Team (`/admin/team`, `/admin/team/:id`);
Team › Commission & payouts (`/admin/commissions`); printable statement `/admin/payouts/:id`;
Users & roles › user › *Commission rate*.

**Rules (`src/domain/commission.ts`, unit-tested):**
- Each reseller has at most one point of contact (a staff user). The order stores `poc_id` when it is placed, so
  reassigning a reseller only affects new orders (TEAM-02).
- Base = goods after discount, excl. VAT and shipping. Rate = the staff member's own rate, else the default; fixed on
  the order's first commission line.
- Status: `pending` → `payable` when the order is fully paid (or completed — setting) → `paid` when included in a payout.
  Cancelled → `void`.
- **Paid lines never change.** Later edits become *adjustment* lines; cancelling a paid-out order books a negative
  line that the next payout deducts. Sync is idempotent and runs after every order change (place, edit, status, payment).
- Payout (COM-06): pick payable lines for one person → method, reference, date → numbered `PO-YYYY-NNNN`; lines lock.
  Refused if any line changed meanwhile (`payout_stale`) or the total isn't positive.

## 3. Reports hub

**Where:** Admin › Sales › Reports (`/admin/reports`, `/admin/reports/:type`). Date range presets + custom, kept in
the URL so a link reopens the same view.

| Report | KPIs | Charts | Table |
| --- | --- | --- | --- |
| Sales | net sales, orders, avg order, cases, discounts, POS share | stacked columns online/POS by day·week·month; donut by city | one row per period |
| Revenue & VAT | invoiced, net, VAT, shipping, collected, outstanding | grouped columns invoiced vs collected; donut by payment method; bars VAT by rate | per period |
| Orders | orders, cancelled, rate, lines/order, order→delivery hours, not fully paid | stacked columns by channel; donut by status | every order (links) |
| Reseller performance | active, new, sales per reseller, top share, outstanding | top 10 bars | per reseller incl. contact, last order, open balance |
| Team performance | sales with a contact, share, orders, commission earned/paid | stacked columns by person; bars | per person |
| Commission | earned, payable, pending, paid | stacked columns paid/payable/pending per person | every line |
| Product analytics | cases, goods, products sold, share at sale price | top 10 bars; donut by category | per product incl. stock |

Grain is automatic: ≤ 45 days per day, ≤ 190 per week, else per month. Exports: **CSV** (semicolon, UTF-8 BOM for
Italian Excel), **Excel** (real .xlsx with euro/percent formats, bold header, frozen header row — no library,
`src/lib/xlsx.ts`), **PDF** and **Print** via a print stylesheet (admin chrome hidden, charts kept). Chart colours
come from a colour-blind-validated palette; every chart has a legend or labels and every report has the data table.

## 4. Email notifications

**Where:** Admin › System › Emails (`/admin/emails`): *Delivery log*, *Templates*, *Announcements*, *Setup*;
editor `/admin/emails/templates/:id`; composer `/admin/emails/campaigns/new`; reseller Account › Emails (opt-out).

- **Triggers:** order placed (online and POS), cancelled (with reason), shipped, completed, payment received (with
  receipt link and balance), application received, application rejected (with reason). Each can be switched off.
- **Builder:** blocks (heading, rich text, button, image, divider, space, order summary), drag in from the palette or
  reorder by drag / arrows, duplicate, delete. EN and IT versions, *copy from* the other language. Variables are
  inserted at the cursor; only the variables valid for that email are offered and accepted.
- **Preview:** live, desktop/mobile width, with a real recent order — rendered by the same code that sends.
- **Versioning:** every save is a new version with an optional note (last 30 kept). Restore copies an old version
  into a new one, so history is never lost. Unsaved-changes guard on leave.
- **Branding:** logo on/off (uses Settings › Appearance logo), button and background colour, footer EN/IT.
- **Log:** every email with recipient, subject, kind, status (queued → sent → delivered → opened, or bounced/failed),
  event timeline with SMTP responses, the exact HTML sent, search and filters, *Send again* for failures.
- **Announcements:** audience = all approved resellers, by city, by point of contact, or chosen ones; live recipient
  count; resellers who opted out are skipped and counted; an unsubscribe link is always present; confirm step.
- **SMTP:** host, port, STARTTLS/SSL/none (warned), username, write-only password, sender, reply-to, test send.

---

## Schema (PostgreSQL, Phase 3)

New and changed tables. `id` columns are UUIDs; money `bigint` cents; timestamps `timestamptz`.

```sql
-- existing tables, new columns
alter table users  add column poc_id uuid references users(id),          -- resellers only
                   add column commission_pct numeric(5,2),                 -- staff only; null = default
                   add column marketing_opt_out boolean not null default false;
alter table orders add column channel text not null default 'online' check (channel in ('online','pos')),
                   add column cashier_id uuid references users(id),
                   add column tendered_cents bigint,
                   add column discount_kind text check (discount_kind in ('percent','fixed')),
                   add column discount_value numeric(10,2),
                   add column discount_cents bigint not null default 0,
                   add column discount_reason text,
                   add column poc_id uuid references users(id);            -- snapshot at placement
create index on users (poc_id) where poc_id is not null;
create index on orders (rome_date, channel);
create index on orders (poc_id, rome_date);

create table commission_lines (
  id uuid primary key, order_id uuid not null references orders(id), staff_id uuid not null references users(id),
  reseller_id uuid references users(id), rome_date date not null,
  base_cents bigint not null, pct numeric(5,2) not null, amount_cents bigint not null,
  status text not null check (status in ('pending','payable','paid','void')),
  adjustment boolean not null default false, payout_id uuid references payouts(id), created_at timestamptz not null
);
create index on commission_lines (staff_id, status);
create index on commission_lines (order_id);
create index on commission_lines (rome_date);

create table payouts (
  id uuid primary key, number text unique not null, staff_id uuid not null references users(id),
  amount_cents bigint not null check (amount_cents > 0), kind text not null, reference text not null,
  paid_on date not null, note text, recorded_by uuid not null references users(id), recorded_at timestamptz not null
);

create table email_templates (id text primary key, enabled boolean not null default true, current_version int not null);
create table email_template_versions (
  template_id text references email_templates(id), n int, content jsonb not null,   -- {en:{subject,blocks},it:{…}}
  note text, saved_by uuid references users(id), saved_at timestamptz not null, primary key (template_id, n)
);
create table email_theme (id int primary key default 1, show_logo boolean, accent text, background text, footer jsonb);
create table smtp_settings (id int primary key default 1, enabled boolean, host text, port int, security text,
  username text, password_enc bytea, from_name text, from_email text, reply_to text);   -- password encrypted (KMS)

create table campaigns (id uuid primary key, name text, content jsonb, audience jsonb, sent_at timestamptz,
  sent_by uuid references users(id), recipients int, skipped_opt_out int);
create table email_log (
  id uuid primary key, at timestamptz not null, to_email text not null, to_name text, subject text not null,
  kind text not null, status text not null, error text, order_id uuid references orders(id),
  campaign_id uuid references campaigns(id), html_key text               -- rendered HTML in object storage
);
create table email_events (log_id uuid references email_log(id), status text, at timestamptz, detail text);
create index on email_log (at desc);
create index on email_log (status, at desc);
create index on email_log (order_id);
create index on email_log using gin (to_tsvector('simple', to_email || ' ' || subject));

create sequence payout_seq;   -- per year via a (year, value) table, like invoice numbers
```

## API (REST, Phase 3)

| Method & path | Mock function | Permission |
| --- | --- | --- |
| `GET /pos/catalog` | `posCatalog` | pos.use |
| `POST /pos/sales` | `posCheckout` | pos.use (+ pos.discount above limit) |
| `PUT /resellers/poc` `{resellerIds, staffId}` | `assignPoc` | resellers.edit |
| `GET /staff/poc-options` | `pocOptions` | staff |
| `GET /team/performance?from&to` | `teamPerformance` | staff (own) · reports.view / commissions.manage (all) |
| `GET /commissions?staffId` | `commissions` | staff (own) · commissions.manage (all) |
| `GET /payouts?staffId`, `GET /payouts/:id` | `payouts`, `payout` | staff (own) · commissions.manage |
| `POST /payouts` | `createPayout` | commissions.manage |
| `GET /reports/:type?from&to&lang` | `report` | reports.view |
| `GET /email/templates` | `emailTemplates` | email.manage |
| `PUT /email/templates/:id` | `saveTemplate` | email.manage |
| `POST /email/templates/:id/restore/:n` | `restoreTemplateVersion` | email.manage |
| `PATCH /email/templates/:id` `{enabled}` | `setTemplateEnabled` | email.manage |
| `POST /email/test` | `sendTestEmail` | email.manage |
| `GET /email/log`, `POST /email/log/:id/resend` | `emailLogs`, `resendEmail` | email.manage |
| `PUT /email/smtp`, `POST /email/smtp/test` | `saveSmtp`, `testSmtp` | email.manage |
| `POST /email/audience/size`, `GET/POST /email/campaigns` | `audienceSize`, `campaigns`, `sendCampaign` | email.manage |
| `PUT /me/marketing` | `setMarketingOptOut` | signed-in reseller |
| `PATCH /settings` (`pos`, `commission`, `emailTheme`) | `updateSettings` | settings.edit / commissions.manage / email.manage |

Changed: `POST /orders/:id/status` takes an optional `reason` (sent to the buyer on cancel; goods not yet shipped
return to stock). All order mutations re-sync commission and send the matching email.

## Integration points

- **Orders:** POS sales are orders (`channel='pos'`), numbered from the same sequences; invoices, receipts, order
  editing and the admin order list work unchanged. Order totals show the discount line.
- **Commission** hooks into place / edit / status / payment. **Emails** hook into the same events plus apply/reject.
- **Reports** read orders, payments, users, products, categories, commission lines and payouts.
- **Audit log** records every POS sale, discount, contact change, rate change, payout, template save/restore,
  SMTP change and announcement.

## Security and validation

- Server re-prices every POS line; client totals are a preview only. Discount limit and reason enforced server-side.
- Commission and payout visibility is scoped on the server (own figures only without the permission).
- Email: template text is sanitised with an allowlist (b/i/u/a/p/br/lists; `<script>`/`<style>`/`<iframe>` dropped
  with their content); links must be `https:`, `mailto:` or a variable; images uploaded or `https:`; variable
  values are HTML-escaped; unknown variables are rejected on save. Previews and log views render in a sandboxed iframe.
- SMTP password is write-only (never returned); production encrypts it at rest (KMS) and only the mail worker decrypts.
- Announcements honour opt-out and always include an unsubscribe link. Production sends through a queue with rate
  limiting, bounces/complaints via provider webhooks, and `List-Unsubscribe` headers.
- Reports cap the range at two years; exports include every row; nothing personal is put in URLs.

## What the demo simulates

- **Delivery:** emails are "delivered" instantly; addresses ending in `.invalid`/`.test` or containing `bounce` bounce;
  switching SMTP off makes sends fail. Opens are seeded for older emails only.
- **Card terminal:** the auth code is typed, not read from a terminal.
- **PDF:** reports, receipts and statements use the browser's *Save as PDF* from print-ready pages.
