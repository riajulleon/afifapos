import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe, useOrder, useSellerDetails } from '../api/queries';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import { Brand } from '../components/Brand';
import { PaymentIcon } from '../components/PaymentIcon';
import { Button, ErrorNote, Skeleton } from '../components/ui';
import { eur } from '../domain/money';
import { formatRome } from '../domain/romeTime';
import { useDocumentTitle } from '../lib/hooks';
import { PAPER } from './InvoicePage';

/**
 * Printable payment receipt for one recorded payment. Open to the admin and to the buyer of the order
 * (the API only returns a reseller's own orders). Language follows the buyer, like the invoice.
 */
export function ReceiptPage() {
  const { t } = useTranslation();
  const { orderId = '', paymentId = '' } = useParams();
  const navigate = useNavigate();
  const order = useOrder(orderId);
  const seller = useSellerDetails();
  const me = useMe();
  const payment = order.data?.payments.find((p) => p.id === paymentId);
  useDocumentTitle(payment ? `${t('receipt.title')} ${payment.receiptNumber}` : undefined);

  if (order.isLoading || seller.isLoading) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-[700px]" /></div>;
  if (order.error || !order.data || !seller.data) return <div className="mx-auto max-w-3xl p-6"><ErrorNote><ApiErrorMessage error={order.error} /></ErrorNote></div>;
  if (!payment) return <div className="mx-auto max-w-3xl p-6"><ErrorNote>{t('receipt.notFound')}</ErrorNote></div>;

  const o = order.data;
  const b = seller.data.business;
  const lang = o.lang;
  const L = (key: string, opts: Record<string, unknown> = {}) => t(key, { lng: lang, ...opts });
  // Totals as of this receipt: payments recorded up to and including it.
  const upTo = o.payments.slice(0, o.payments.findIndex((p) => p.id === payment.id) + 1);
  const paidToDate = upTo.reduce((a, p) => a + p.amountCents, 0);
  const balance = Math.max(0, o.totalCents - paidToDate);
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

      <article className="mx-auto grid max-w-[210mm] gap-8 bg-white p-[14mm] text-[13px] text-[#1a1a1a] shadow-3 print:shadow-none" style={PAPER}>
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="grid gap-3">
            <Brand />
            <div className="leading-relaxed">
              <b className="font-medium">{b.legalName}</b>
              <br />{b.address}
              <br />P.IVA {b.vatNumber} · C.F. {b.fiscalCode}
            </div>
          </div>
          <div className="grid justify-items-end gap-1 text-right">
            <h1 className="text-2xl font-bold tracking-tight">{L('receipt.title')}</h1>
            <p className="num text-base font-medium">{payment.receiptNumber}</p>
            <p className="text-[#666]">{L('receipt.issued')}: {formatRome(payment.recordedAt, lang, false)}</p>
          </div>
        </header>

        {/* The amount is the point of the document, so it leads. */}
        <section className="grid gap-1 rounded-xl border border-[#eaeaea] p-6 text-center">
          <span className="text-[11px] font-medium uppercase tracking-[.1em] text-[#666]">{L('receipt.amountReceived')}</span>
          <b className="num text-[40px] font-bold leading-tight tracking-tight">{eur(payment.amountCents, lang)}</b>
          <span className="text-[#666]">{L('receipt.receivedOn', { date: new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${payment.receivedOn}T12:00:00Z`)) })}</span>
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-[.08em] text-[#666]">{L('receipt.from')}</h2>
            <p className="leading-relaxed"><b className="font-medium">{o.businessName}</b><br />{o.address}<br />{o.cityName}{o.zoneName ? ` · ${o.zoneName}` : ''}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1.5">
            <dt className="text-[#666]">{L('admin.pay.method')}</dt>
            <dd className="flex items-center gap-1.5 font-medium"><PaymentIcon kind={payment.kind} className="size-3.5" /> {L(`admin.pay.kind.${payment.kind}`)}</dd>
            <dt className="text-[#666]">{L('admin.pay.reference')}</dt>
            <dd className="num font-medium">{payment.reference}</dd>
            <dt className="text-[#666]">{L('receipt.forOrder')}</dt>
            <dd className="num">{o.number}</dd>
            <dt className="text-[#666]">{L('receipt.invoice')}</dt>
            <dd className="num">{o.invoiceNumber}</dd>
          </dl>
        </section>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-[#eaeaea]"><td className="py-2">{L('receipt.orderTotal')}</td><td className="num py-2 text-right">{eur(o.totalCents, lang)}</td></tr>
            {upTo.map((p) => (
              <tr key={p.id} className="border-b border-[#eaeaea]">
                <td className="py-2">{L('receipt.paymentLine', { n: p.receiptNumber, date: p.receivedOn })}{p.id === payment.id && <b className="font-medium"> · {L('receipt.thisOne')}</b>}</td>
                <td className="num py-2 text-right">− {eur(p.amountCents, lang)}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 text-base font-bold">{balance === 0 ? L('receipt.paidInFull') : L('receipt.balance')}</td>
              <td className="num pt-3 text-right text-base font-bold">{eur(balance, lang)}</td>
            </tr>
          </tbody>
        </table>

        {payment.note && <p className="text-[#666]">{L('admin.note')}: {payment.note}</p>}

        <footer className="grid gap-1 border-t border-[#eaeaea] pt-4 text-[11.5px] text-[#666]">
          <p>{L('receipt.recordedBy', { name: payment.recordedBy, when: formatRome(payment.recordedAt, lang) })}</p>
          <p>{L('receipt.legal')}</p>
        </footer>
      </article>
    </div>
  );
}
