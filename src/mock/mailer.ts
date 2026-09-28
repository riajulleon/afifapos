// Builds and "sends" emails for the mock API. Phase 3 hands the same subject/html to an SMTP queue worker;
// here delivery is simulated so the log, statuses and retries can be tried end to end.
import { renderEmail, type OrderSummary } from '../domain/email';
import { eur } from '../domain/money';
import { formatRome } from '../domain/romeTime';
import type { EmailContent, EmailLog, EmailStatus, EmailTemplate, EmailTrigger, Lang, Order, Settings, User } from '../domain/types';

export const appOrigin = () => (typeof location !== 'undefined' && location.origin.startsWith('http') ? location.origin : 'https://afifapos.vercel.app');

interface MailDb { settings: Settings; templates: EmailTemplate[] }

export function orderSummary(o: Order, lang: Lang): OrderSummary {
  const L = (en: string, it: string) => (lang === 'it' ? it : en);
  const totals = [
    ...(o.discount ? [{ label: L('Discount', 'Sconto'), amount: `− ${eur(o.discount.cents, lang)}` }] : []),
    { label: L('Subtotal', 'Imponibile'), amount: eur(o.subtotalCents, lang) },
    ...(o.shippingCents ? [{ label: L('Shipping', 'Spedizione'), amount: eur(o.shippingCents, lang) }] : []),
    { label: L('VAT', 'IVA'), amount: eur(o.vat.reduce((a, r) => a + r.vatCents, 0), lang) },
    { label: L('Total', 'Totale'), amount: eur(o.totalCents, lang), bold: true },
  ];
  return { rows: o.lines.map((l) => ({ name: l.name[lang], qty: l.qty, amount: eur(l.lineCents, lang) })), totals };
}

export function baseVars(db: MailDb, user: Pick<User, 'fullName' | 'businessName'>, lang: Lang): Record<string, string> {
  return {
    brand_name: db.settings.branding.brandName,
    customer_name: user.fullName.split(' ')[0] || user.fullName,
    business_name: user.businessName,
    date: formatRome(new Date().toISOString(), lang, false),
  };
}

export function orderVars(db: MailDb, o: Order, user: Pick<User, 'fullName' | 'businessName'>, lang: Lang): Record<string, string> {
  return {
    ...baseVars(db, user, lang),
    order_number: o.number,
    order_total: eur(o.totalCents, lang),
    order_link: `${appOrigin()}/orders/${o.id}`,
    invoice_number: o.invoiceNumber,
    payment_instructions: o.paymentInstructions[lang],
  };
}

export function compose(db: MailDb, content: EmailContent, lang: Lang, vars: Record<string, string>, order?: Order) {
  return renderEmail({
    content, theme: db.settings.emailTheme, brandName: db.settings.branding.brandName, logo: db.settings.branding.logoLight, lang, vars,
    order: order ? orderSummary(order, lang) : undefined,
  });
}

/** Simulated SMTP hand-off. Real delivery reports (bounces, opens) arrive later by webhook in Phase 3. */
export function simulateDelivery(settings: Settings, to: string, at: Date): Pick<EmailLog, 'status' | 'events' | 'error'> {
  const t = (ms: number) => new Date(at.getTime() + ms).toISOString();
  const smtp = settings.smtp;
  if (!smtp.enabled || !smtp.host.trim() || !smtp.fromEmail.trim()) {
    return { status: 'failed', error: !smtp.enabled ? 'SMTP is switched off (Settings › Email)' : 'SMTP host or sender missing', events: [{ status: 'queued', at: t(0) }, { status: 'failed', at: t(400), detail: 'Not sent' }] };
  }
  if (/\.(invalid|test)$/i.test(to) || /bounce/i.test(to)) {
    return { status: 'bounced', error: '550 5.1.1 Recipient address rejected: mailbox unavailable', events: [{ status: 'queued', at: t(0) }, { status: 'sent', at: t(900), detail: `${smtp.host}:${smtp.port}` }, { status: 'bounced', at: t(4200), detail: '550 5.1.1' }] };
  }
  return { status: 'delivered', events: [{ status: 'queued', at: t(0) }, { status: 'sent', at: t(900), detail: `${smtp.host}:${smtp.port} (simulated)` }, { status: 'delivered', at: t(2600), detail: 'simulated, demo does not send email' }] };
}

export function makeLog(
  db: MailDb, id: string, kind: EmailLog['kind'], to: string, toName: string, rendered: { subject: string; html: string }, at: Date,
  extra: Partial<EmailLog> = {},
): EmailLog {
  return { id, at: at.toISOString(), to, toName, subject: rendered.subject, kind, html: rendered.html, ...simulateDelivery(db.settings, to, at), ...extra };
}

export function templateFor(db: MailDb, trigger: EmailTrigger) {
  return db.templates.find((x) => x.id === trigger);
}

export function markOpened(log: EmailLog, at: Date): EmailLog {
  if (log.status !== 'delivered') return log;
  return { ...log, status: 'opened' as EmailStatus, events: [...log.events, { status: 'opened', at: at.toISOString() }] };
}
