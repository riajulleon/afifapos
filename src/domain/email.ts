// Email rendering (MAIL). Blocks → table-based HTML with inline styles, which is what mail clients render reliably.
import type { EmailBlock, EmailContent, EmailTheme, EmailTrigger, Lang } from './types';

/** Variables each email can use; the editor offers these and warns about anything else (MAIL-04). */
const COMMON = ['brand_name', 'customer_name', 'business_name', 'date'] as const;
const ORDER = ['order_number', 'order_total', 'order_link', 'invoice_number', 'payment_instructions'] as const;

export const TEMPLATE_VARIABLES: Record<EmailTrigger | 'campaign', string[]> = {
  order_placed: [...COMMON, ...ORDER],
  order_cancelled: [...COMMON, ...ORDER, 'reason'],
  order_shipped: [...COMMON, ...ORDER],
  order_completed: [...COMMON, ...ORDER],
  payment_received: [...COMMON, ...ORDER, 'amount', 'receipt_number', 'receipt_link', 'balance'],
  application_received: [...COMMON],
  application_rejected: [...COMMON, 'reason'],
  campaign: [...COMMON, 'unsubscribe_link'],
};

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function usedVariables(c: EmailContent): string[] {
  const text = [c.subject, ...c.blocks.map(blockText)].join(' ');
  return [...new Set([...text.matchAll(VAR_RE)].map((m) => m[1]))];
}

export function unknownVariables(c: EmailContent, kind: EmailTrigger | 'campaign'): string[] {
  const allowed = new Set(TEMPLATE_VARIABLES[kind]);
  return usedVariables(c).filter((v) => !allowed.has(v));
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case 'heading': return b.text;
    case 'text': return b.html;
    case 'button': return `${b.label} ${b.url}`;
    case 'image': return `${b.src} ${b.alt}`;
    default: return '';
  }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Replaces {{var}}. Values are escaped for HTML unless `raw`; unknown variables are left visible so they get noticed. */
export function fill(text: string, vars: Record<string, string>, raw = false): string {
  return text.replace(VAR_RE, (m, k: string) => (k in vars ? (raw ? vars[k] : escapeHtml(vars[k])) : m));
}

export interface OrderSummaryRow { name: string; qty: number; amount: string }
export interface OrderSummary { rows: OrderSummaryRow[]; totals: { label: string; amount: string; bold?: boolean }[] }

export interface RenderInput {
  content: EmailContent;
  theme: EmailTheme;
  brandName: string;
  logo: string | null;
  lang: Lang;
  vars: Record<string, string>;
  order?: OrderSummary;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Readable text colour on a background: black or white by luminance. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}

function renderBlock(b: EmailBlock, i: RenderInput): string {
  const accent = i.theme.accent;
  switch (b.type) {
    case 'heading':
      return `<tr><td style="padding:8px 32px 4px;font:700 22px/1.3 ${FONT};color:#111111">${fill(escapeHtml(b.text), i.vars)}</td></tr>`;
    case 'text':
      // Text blocks are sanitised on save; variables inside them are escaped here.
      return `<tr><td style="padding:6px 32px;font:400 15px/1.6 ${FONT};color:#333333">${fill(b.html, i.vars)}</td></tr>`;
    case 'button': {
      const href = fill(b.url, i.vars, true);
      const safe = /^(https?:|mailto:)/i.test(href) ? escapeHtml(href) : '#';
      return `<tr><td style="padding:14px 32px"><a href="${safe}" style="display:inline-block;background:${accent};color:${inkOn(accent)};font:600 15px/1 ${FONT};text-decoration:none;padding:13px 22px;border-radius:8px">${fill(escapeHtml(b.label), i.vars)}</a></td></tr>`;
    }
    case 'image':
      return b.src ? `<tr><td style="padding:10px 32px"><img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}" width="${Math.min(536, b.width)}" style="display:block;max-width:100%;height:auto;border:0;border-radius:6px"></td></tr>` : '';
    case 'divider':
      return `<tr><td style="padding:12px 32px"><div style="border-top:1px solid #e6e6e6;height:0;line-height:0">&nbsp;</div></td></tr>`;
    case 'spacer':
      return `<tr><td style="height:${Math.max(4, Math.min(80, b.size))}px;line-height:0">&nbsp;</td></tr>`;
    case 'order': {
      if (!i.order) return '';
      const rows = i.order.rows.map((r) => `<tr><td style="padding:7px 0;border-bottom:1px solid #eeeeee;font:400 14px/1.4 ${FONT};color:#333333">${escapeHtml(r.name)} <span style="color:#888888">× ${r.qty}</span></td><td align="right" style="padding:7px 0;border-bottom:1px solid #eeeeee;font:400 14px/1.4 ${FONT};color:#333333;white-space:nowrap">${escapeHtml(r.amount)}</td></tr>`).join('');
      const totals = i.order.totals.map((r) => `<tr><td style="padding:5px 0;font:${r.bold ? 700 : 400} 14px/1.4 ${FONT};color:#111111">${escapeHtml(r.label)}</td><td align="right" style="padding:5px 0;font:${r.bold ? 700 : 400} 14px/1.4 ${FONT};color:#111111;white-space:nowrap">${escapeHtml(r.amount)}</td></tr>`).join('');
      return `<tr><td style="padding:10px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${totals}</table></td></tr>`;
    }
  }
}

/** Full email: subject plus HTML document. */
export function renderEmail(i: RenderInput): { subject: string; html: string } {
  const subject = fill(i.content.subject, i.vars, true);
  const head = i.theme.showLogo
    ? i.logo
      ? `<img src="${escapeHtml(i.logo)}" alt="${escapeHtml(i.brandName)}" height="32" style="display:block;height:32px;width:auto;border:0">`
      : `<span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${i.theme.accent};color:${inkOn(i.theme.accent)};font:700 16px/32px ${FONT};text-align:center">${escapeHtml(i.brandName.charAt(0))}</span> <span style="font:700 16px/32px ${FONT};color:#111111;vertical-align:top;padding-left:6px">${escapeHtml(i.brandName)}</span>`
    : '';
  const body = i.content.blocks.map((b) => renderBlock(b, i)).join('');
  const footer = fill(escapeHtml(i.theme.footer[i.lang]), i.vars);
  const html = `<!doctype html><html lang="${i.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${i.theme.background}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${i.theme.background}"><tr><td align="center" style="padding:28px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e6e6e6">` +
    (head ? `<tr><td style="padding:24px 32px 8px">${head}</td></tr>` : '') +
    body +
    `<tr><td style="padding:20px 32px 26px;font:400 12px/1.6 ${FONT};color:#888888;border-top:1px solid #f0f0f0">${footer.replace(/\n/g, '<br>')}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject, html };
}

/* ---------- default templates ---------- */

let seq = 0;
const id = () => `b${++seq}`;
const H = (text: string): EmailBlock => ({ id: id(), type: 'heading', text });
const T = (html: string): EmailBlock => ({ id: id(), type: 'text', html });
const B = (label: string, url: string): EmailBlock => ({ id: id(), type: 'button', label, url });
const O = (): EmailBlock => ({ id: id(), type: 'order' });
const D = (): EmailBlock => ({ id: id(), type: 'divider' });

type Pair = Record<Lang, EmailContent>;

export function defaultTemplates(): Record<EmailTrigger, Pair> {
  return {
    order_placed: {
      en: { subject: 'Order {{order_number}} received', blocks: [H('Thank you for your order'), T('Hello {{customer_name}}, we have received order <b>{{order_number}}</b> for {{business_name}}. Invoice {{invoice_number}} is attached.'), O(), T('<b>How to pay:</b> {{payment_instructions}}'), B('View your order', '{{order_link}}')] },
      it: { subject: 'Ordine {{order_number}} ricevuto', blocks: [H('Grazie per il tuo ordine'), T('Ciao {{customer_name}}, abbiamo ricevuto l’ordine <b>{{order_number}}</b> per {{business_name}}. In allegato la fattura {{invoice_number}}.'), O(), T('<b>Come pagare:</b> {{payment_instructions}}'), B('Vedi l’ordine', '{{order_link}}')] },
    },
    order_cancelled: {
      en: { subject: 'Order {{order_number}} cancelled', blocks: [H('Your order was cancelled'), T('Hello {{customer_name}}, order <b>{{order_number}}</b> has been cancelled.'), T('Reason: {{reason}}'), T('If you already paid, we will refund you within 5 working days. Questions? Just reply to this email.')] },
      it: { subject: 'Ordine {{order_number}} annullato', blocks: [H('Il tuo ordine è stato annullato'), T('Ciao {{customer_name}}, l’ordine <b>{{order_number}}</b> è stato annullato.'), T('Motivo: {{reason}}'), T('Se hai già pagato, ti rimborseremo entro 5 giorni lavorativi. Domande? Rispondi a questa email.')] },
    },
    order_shipped: {
      en: { subject: 'Order {{order_number}} is on its way', blocks: [H('Your order has shipped'), T('Hello {{customer_name}}, order <b>{{order_number}}</b> left our warehouse today and will reach {{business_name}} soon.'), O(), B('Track your order', '{{order_link}}')] },
      it: { subject: 'L’ordine {{order_number}} è in viaggio', blocks: [H('Il tuo ordine è stato spedito'), T('Ciao {{customer_name}}, l’ordine <b>{{order_number}}</b> è partito oggi dal magazzino e arriverà presto a {{business_name}}.'), O(), B('Segui l’ordine', '{{order_link}}')] },
    },
    order_completed: {
      en: { subject: 'Order {{order_number}} delivered', blocks: [H('Delivered'), T('Hello {{customer_name}}, order <b>{{order_number}}</b> has been delivered. Thank you for buying from {{brand_name}}.'), B('Order again', '{{order_link}}')] },
      it: { subject: 'Ordine {{order_number}} consegnato', blocks: [H('Consegnato'), T('Ciao {{customer_name}}, l’ordine <b>{{order_number}}</b> è stato consegnato. Grazie per aver scelto {{brand_name}}.'), B('Ordina di nuovo', '{{order_link}}')] },
    },
    payment_received: {
      en: { subject: 'Payment received for {{order_number}}', blocks: [H('Payment received'), T('Hello {{customer_name}}, we received <b>{{amount}}</b> for order {{order_number}}. Receipt {{receipt_number}}.'), T('Balance still due: {{balance}}'), B('View receipt', '{{receipt_link}}')] },
      it: { subject: 'Pagamento ricevuto per {{order_number}}', blocks: [H('Pagamento ricevuto'), T('Ciao {{customer_name}}, abbiamo ricevuto <b>{{amount}}</b> per l’ordine {{order_number}}. Ricevuta {{receipt_number}}.'), T('Saldo ancora dovuto: {{balance}}'), B('Vedi la ricevuta', '{{receipt_link}}')] },
    },
    application_received: {
      en: { subject: 'We received your application', blocks: [H('Thanks for applying'), T('Hello {{customer_name}}, we have your application for <b>{{business_name}}</b>. We check documents within 1 working day and email you as soon as your account is approved.')] },
      it: { subject: 'Abbiamo ricevuto la tua richiesta', blocks: [H('Grazie per la richiesta'), T('Ciao {{customer_name}}, abbiamo ricevuto la richiesta per <b>{{business_name}}</b>. Verifichiamo i documenti entro 1 giorno lavorativo e ti scriviamo appena l’account è approvato.')] },
    },
    application_rejected: {
      en: { subject: 'About your application', blocks: [H('We can’t approve your account'), T('Hello {{customer_name}}, we are sorry: we can’t approve the application for {{business_name}}.'), T('Reason: {{reason}}'), D(), T('If something has changed, reply to this email and we will look again.')] },
      it: { subject: 'La tua richiesta', blocks: [H('Non possiamo approvare l’account'), T('Ciao {{customer_name}}, ci dispiace: non possiamo approvare la richiesta per {{business_name}}.'), T('Motivo: {{reason}}'), D(), T('Se qualcosa è cambiato, rispondi a questa email e la rivedremo.')] },
    },
  };
}

export function defaultCampaign(): Pair {
  return {
    en: { subject: 'News from {{brand_name}}', blocks: [H('This week at {{brand_name}}'), T('Hello {{customer_name}}, here is what’s new for {{business_name}}.'), B('Open the shop', 'https://afifapos.vercel.app/')] },
    it: { subject: 'Novità da {{brand_name}}', blocks: [H('Questa settimana da {{brand_name}}'), T('Ciao {{customer_name}}, ecco le novità per {{business_name}}.'), B('Apri il negozio', 'https://afifapos.vercel.app/')] },
  };
}

export const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
