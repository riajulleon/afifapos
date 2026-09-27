import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe, useOrder, useSellerDetails } from '../api/queries';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import { Barcode } from '../components/Barcode';
import { Brand } from '../components/Brand';
import { PaymentPill } from '../components/orderBits';
import { Button, ErrorNote, Skeleton } from '../components/ui';
import { eur } from '../domain/money';
import { formatRome } from '../domain/romeTime';
import { useDocumentTitle } from '../lib/hooks';
import { OrderLines, OrderTotals } from './shop/OrderPage';

/** Invoices are always a white page, whatever the app theme (emails and printouts stay light). */
export const PAPER = {
  colorScheme: 'light',
  '--text': '#1a1a1a', '--muted': '#666666', '--line': '#eaeaea', '--line-strong': '#d4d4d4',
  '--surface': '#ffffff', '--surface-2': '#f5f5f5', '--canvas': '#fafafa',
  '--primary': '#1a1a1a', '--primary-ink': '#ffffff', '--inv-bg': '#000000', '--inv-fg': '#ffffff',
  '--ok': '#1b7a45', '--ok-soft': '#e5f3eb', '--warn': '#8a5a00', '--warn-soft': '#faf0dc',
  '--bad': '#b3261e', '--bad-soft': '#fbe6e5', '--info': '#1f5fa0', '--info-soft': '#e4edf7',
} as React.CSSProperties;

/**
 * Printable A4 invoice (INV-03/04/05). Rendered from the order snapshot, in the buyer's language.
 * Phase 3 replaces "Download PDF" with the stored server PDF; until then it uses the browser's Save as PDF.
 */
export function InvoicePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const order = useOrder(id);
  const seller = useSellerDetails();
  const me = useMe();
  useDocumentTitle(order.data ? `${t('invoice.title')} ${order.data.invoiceNumber}` : undefined);

  if (order.isLoading || seller.isLoading) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-[800px]" /></div>;
  if (order.error || !order.data || !seller.data) return <div className="mx-auto max-w-3xl p-6"><ErrorNote><ApiErrorMessage error={order.error} /></ErrorNote></div>;
  const o = order.data;
  const b = seller.data.business;
  const lang = o.lang;
  const back = me.data?.role === 'reseller' ? `/orders/${o.id}` : `/admin/orders/${o.id}`;

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <Link to={back} onClick={(e) => { if (history.length > 1) { e.preventDefault(); navigate(-1); } }} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {t('common.back')}
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => window.print()}><Printer className="size-4" /> {t('invoice.print')}</Button>
          <Button onClick={() => window.print()} title={t('invoice.pdfHint')}><Download className="size-4" /> {t('invoice.pdf')}</Button>
        </div>
      </div>

      <article className="mx-auto grid max-w-[210mm] gap-7 bg-white p-[14mm] text-[13px] text-[#1a1a1a] shadow-3 print:shadow-none" style={PAPER}>
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="grid gap-3">
            <Brand />
            <div className="leading-relaxed">
              <b className="font-medium">{b.legalName}</b>
              <br />{b.address}
              <br />P.IVA {b.vatNumber} · C.F. {b.fiscalCode}
              <br />REA {b.rea}
            </div>
          </div>
          <div className="grid justify-items-end gap-1 text-right">
            <h1 className="text-2xl font-bold tracking-tight">{t('invoice.title', { lng: lang })}</h1>
            <p className="num text-base font-medium">{o.invoiceNumber}</p>
            <p className="text-[#666]">{t('invoice.date', { lng: lang })}: {formatRome(o.placedAt, lang, false)}</p>
            <p className="text-[#666]">{t('order.number', { lng: lang })}: <span className="num">{o.number}</span></p>
            <Barcode value={o.number} className="mt-1 h-[15mm] w-auto" />
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-[.08em] text-[#666]">{t('invoice.billTo', { lng: lang })}</h2>
            <p className="leading-relaxed"><b className="font-medium">{o.businessName}</b><br />{o.address}</p>
          </div>
          <div>
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-[.08em] text-[#666]">{t('invoice.shipTo', { lng: lang })}</h2>
            <p className="leading-relaxed">{o.address}<br />{o.cityName}{o.zoneName ? ` · ${o.zoneName}` : ''}</p>
          </div>
        </section>

        <OrderLines order={o} />
        <OrderTotals order={o} />

        <section className="grid gap-1.5 rounded-lg border border-[#eaeaea] p-4">
          <div className="flex items-center justify-between">
            <b className="font-medium">{t('invoice.payment', { lng: lang })}: {o.paymentMethodName[lang]}</b>
            <PaymentPill status={o.paymentStatus} />
          </div>
          {o.paymentStatus !== 'paid' && <p className="text-[#666]">{o.paymentInstructions[lang]} {t('order.reference', { lng: lang })} {o.number}.</p>}
          {o.payments.map((p) => <p key={p.id} className="text-[#666]">{t('invoice.paidOn', { lng: lang, date: p.receivedOn, amount: eur(p.amountCents, lang), ref: p.reference })} {t('receipt.short', { lng: lang })} {p.receiptNumber}.</p>)}
        </section>

        <footer className="border-t border-[#eaeaea] pt-4 text-[11.5px] text-[#666]">
          {b.footer[lang]} {t('invoice.courtesy', { lng: lang })}
        </footer>
      </article>
    </div>
  );
}
