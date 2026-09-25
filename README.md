# Afifa Wholesale — web app (Phase 2)

B2B ordering platform for approved resellers in Italy: reseller shop with Today's Sale, cart with city/zone minimums and VAT by rate, manual payments, invoices, and an admin console.

- Design spec (Phase 1): https://claude.ai/artifact/LUPpiX3StZZaGDMoK1nZ8h
- Business rules spec: https://claude.ai/code/artifact/6cf10e8f-89e6-4179-8358-bf30b670c688 — requirement IDs such as `MIN-03` or `PRICE-02` in code comments refer to it.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # business-rule unit tests (pricing, VAT, Rome time)
npm run build      # type-check + production build
```

### Demo accounts (sample data, stored in your browser)

| Role | Sign in with | Password |
| --- | --- | --- |
| Reseller (Roma › Tor Pignattara) | `ordini@bottegasapori.it` or `347 812 4590` | `wholesale1` |
| Admin (Owner) | `admin@afifa.it` | `admin12345` |
| Pending applicant | `minimarket.pigneto@gmail.com` | `wholesale1` |

Admin › Settings › Demo data resets everything. Open the shop and the admin console in two tabs: a new order shows up in the admin tab as a toast, on the bell, and as a browser notification if you allow it.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Motion (animation) · TanStack Query (server data) · Zustand (cart, preferences, toasts) · react-i18next (EN/IT) · React Router · Lucide icons · Vitest.

## Layout

```
src/
  domain/        Pure business rules: pricing.ts (MIN, ZONE, PRICE, VAT), romeTime.ts, money.ts, types.ts
  api/           mockServer.ts (stand-in for the Phase 3 API) + queries.ts (TanStack Query hooks)
  mock/seed.ts   Sample products, cities, deals, users and 12 weeks of orders
  store/         cart, prefs (theme + language), toasts
  components/    UI primitives, cards, controls (theme button, EN/IT switch, countdown, stepper)
  layouts/       ShopLayout (sale bar, top bar, phone tab bar), AdminLayout, AuthLayout
  pages/         auth/, shop/, admin/, InvoicePage
  i18n/          en.ts, it.ts (it.ts is type-checked against en.ts, so no key can be missing)
```

## Moving to the real backend (Phase 3)

`src/api/mockServer.ts` exposes the same functions the HTTP client will (`login`, `placeOrder`, `markPaid`, `saveDeal` …). Replace its body with `fetch` calls and keep the signatures; pages and hooks don't change. The mock already re-checks every rule the server must own: re-pricing, the city/zone minimum, per-reseller deal limits, stock, "ship only after payment", and gapless invoice numbers.

Things the mock only simulates:

- **Sessions:** a localStorage key instead of an httpOnly cookie. Passwords are plain text in the mock only.
- **Uploads:** trade licence and VAT document keep their name, size and type only. Production stores them encrypted in EU storage (spec §AUTH-03).
- **Emails:** the invoice email is recorded as sent. Password reset and SMS are not built.
- **PDF invoices:** "Download PDF" uses the browser's Save as PDF. Production serves a stored PDF, plus FatturaPA XML through SDI once the accountant confirms the route (INV-09).
- **Deal times:** computed in `Europe/Rome` from the server clock, with a client clock-offset correction (DEAL-06), and unit-tested across the DST change.
