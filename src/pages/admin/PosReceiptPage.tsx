import { ArrowLeft, Printer, Store } from 'lucide-react';
import { Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAdminSettings, useOrder, useSellerDetails } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Barcode } from '../../components/Barcode';
import { Button, ErrorNote, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle } from '../../lib/hooks';

/**
 * Till receipt for a counter sale (POS-05), laid out for an 80 mm thermal roll; it also prints fine on A4.
 * Language follows the cashier's screen, since walk-in customers have no account language.
 */
export function PosReceiptPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const order = useOrder(id);
  const seller = useSellerDetails();
  const settings = useAdminSettings();
  useDocumentTitle(order.data ? `${t('pos.receipt')} ${order.data.number}` : undefined);
  const lang = i18n.language === 'it' ? 'it' : 'en';

  useEffect(() => {
    if (params.get('print') === '1' && order.data && seller.data) setTimeout(() => window.print(), 300);
  }, [params, order.data, seller.data]);

  if (order.isLoading || seller.isLoading) return <div className="mx-auto max-w-sm p-6"><Skeleton className="h-[600px]" /></div>;
  if (order.error || !order.data || !seller.data) return <div className="mx-auto max-w-sm p-6"><ErrorNote><ApiErrorMessage error={order.error} /></ErrorNote></div>;
  const o = order.data;
  const b = seller.data.business;
  const pay = o.payments[0];
  const goods = o.lines.reduce((a, l) => a + l.lineCents, 0);
  const vat = o.vat.reduce((a, r) => a + r.vatCents, 0);

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <style>{'@media print { @page { size: 80mm auto; margin: 4mm; } }'}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[80mm] items-center justify-between gap-2 px-1">
        <Link to="/admin/pos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('pos.backToTill')}</Link>
        <Button size="sm" onClick={() => window.print()}><Printer className="size-4" /> {t('invoice.print')}</Button>
      </div>
      <article className="mx-auto grid w-[80mm] gap-3 bg-white p-4 font-mono text-[11.5px] leading-snug text-black shadow-3 print:w-full print:p-0 print:shadow-none">
        <header className="grid justify-items-center gap-0.5 text-center">
          <Store className="size-5" aria-hidden />
          <b className="text-[13px]">{seller.data.branding.brandName}</b>
          <span>{b.legalName}</span>
          <span>{b.address}</span>
          <span>P.IVA {b.vatNumber}</span>
        </header>
        <div className="border-y border-dashed border-black py-1.5 text-center font-bold uppercase tracking-wider">{t('pos.receipt')}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2">
          <dt>{t('pos.rNo')}</dt><dd className="text-right">{o.number}</dd>
          <dt>{t('invoice.title')}</dt><dd className="text-right">{o.invoiceNumber}</dd>
          <dt>{t('invoice.date')}</dt><dd className="text-right">{formatRome(o.placedAt, lang)}</dd>
          <dt>{t('pos.cashier')}</dt><dd className="text-right">{o.cashier ?? '—'}</dd>
          <dt>{t('pos.customer')}</dt><dd className="truncate text-right">{o.businessName}</dd>
        </dl>
        <table className="w-full border-t border-dashed border-black">
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.productId} className="align-top">
                <td className="pt-1.5">{l.name[lang]}<br /><span className="text-[10.5px]">{l.qty} × {eur(l.unitCents, lang)} · IVA {l.vatPercent}%</span></td>
                <td className="whitespace-nowrap pt-1.5 text-right">{eur(l.lineCents, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="grid grid-cols-[1fr_auto] gap-x-2 border-t border-dashed border-black pt-1.5">
          <dt>{t('pos.items')}</dt><dd className="text-right">{eur(goods, lang)}</dd>
          {o.discount && <><dt>{t('pos.discount')} {o.discount.kind === 'percent' ? `${o.discount.value}%` : ''}<br /><span className="text-[10.5px]">{o.discount.reason}</span></dt><dd className="text-right">− {eur(o.discount.cents, lang)}</dd></>}
          {o.shippingCents > 0 && <><dt>{t('pos.delivery')}</dt><dd className="text-right">{eur(o.shippingCents, lang)}</dd></>}
          {o.vat.map((r) => <Fragment key={r.percent}><dt>IVA {r.percent}% {t('pos.on')} {eur(r.baseCents, lang)}</dt><dd className="text-right">{eur(r.vatCents, lang)}</dd></Fragment>)}
          <dt className="pt-1 text-[14px] font-bold">{t('cart.total')}</dt><dd className="pt-1 text-right text-[14px] font-bold">{eur(o.totalCents, lang)}</dd>
          <dt className="text-[10.5px]">{t('pos.ofWhichVat')}</dt><dd className="text-right text-[10.5px]">{eur(vat, lang)}</dd>
        </dl>
        <dl className="grid grid-cols-[1fr_auto] gap-x-2 border-t border-dashed border-black pt-1.5">
          {pay ? (
            <>
              <dt>{t(`admin.pay.kind.${pay.kind}`)}</dt><dd className="text-right">{eur(o.tenderedCents ?? pay.amountCents, lang)}</dd>
              {o.tenderedCents !== undefined && <><dt>{t('pos.change')}</dt><dd className="text-right">{eur(o.tenderedCents - o.totalCents, lang)}</dd></>}
              {pay.kind !== 'cash' && <><dt>{t('admin.pay.reference')}</dt><dd className="text-right">{pay.reference}</dd></>}
              <dt>{t('receipt.short')}</dt><dd className="text-right">{pay.receiptNumber}</dd>
            </>
          ) : (
            <><dt className="font-bold">{t('pos.onAccount')}</dt><dd className="text-right font-bold">{t('pay.awaiting')}</dd></>
          )}
        </dl>
        <div className="grid justify-items-center gap-1 border-t border-dashed border-black pt-2 text-center">
          <Barcode value={o.number} className="h-12 w-auto" />
          <span>{settings.data?.pos.receiptFooter[lang] ?? ''}</span>
          <span className="text-[10px]">{t('pos.notFiscal')}</span>
        </div>
      </article>
    </div>
  );
}
