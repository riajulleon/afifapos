import { ArrowLeft, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { usePayout, useSellerDetails } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Brand } from '../../components/Brand';
import { Button, ErrorNote, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { PAPER } from '../InvoicePage';

/** Printable commission statement for one payout: every order it covers, so the payee can check it line by line. */
export function PayoutPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = usePayout(id);
  const seller = useSellerDetails();
  useDocumentTitle(q.data ? `${t('com.statement')} ${q.data.payout.number}` : undefined);
  if (q.isLoading || seller.isLoading) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-[600px]" /></div>;
  if (q.error || !q.data || !seller.data) return <div className="mx-auto max-w-3xl p-6"><ErrorNote><ApiErrorMessage error={q.error} /></ErrorNote></div>;
  const { payout: p, entries } = q.data;
  const b = seller.data.business;
  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-4">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('common.back')}</button>
        <Button onClick={() => window.print()}><Printer className="size-4" /> {t('invoice.print')}</Button>
      </div>
      <article className="mx-auto grid max-w-[210mm] gap-7 bg-white p-[14mm] text-[13px] text-[#1a1a1a] shadow-3 print:shadow-none" style={PAPER}>
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="grid gap-3"><Brand /><p className="leading-relaxed"><b className="font-medium">{b.legalName}</b><br />{b.address}<br />P.IVA {b.vatNumber}</p></div>
          <div className="grid justify-items-end gap-1 text-right">
            <h1 className="text-2xl font-bold tracking-tight">{t('com.statement')}</h1>
            <p className="num text-base font-medium">{p.number}</p>
            <p className="text-[#666]">{t('com.paidOn')}: {p.paidOn}</p>
          </div>
        </header>
        <section className="grid gap-1 rounded-xl border border-[#eaeaea] p-6 text-center">
          <span className="text-[11px] font-medium uppercase tracking-[.1em] text-[#666]">{t('com.paidTo', { name: p.staffName })}</span>
          <b className="num text-[40px] font-bold leading-tight tracking-tight">{eur(p.amountCents, lang)}</b>
          <span className="text-[#666]">{t(`admin.pay.kind.${p.kind}`)} · {p.reference}</span>
        </section>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[#eaeaea] text-left text-[11px] uppercase tracking-[.06em] text-[#666]">
              <th className="py-2 pr-3 font-medium">{t('rep.col.date')}</th><th className="py-2 pr-3 font-medium">{t('rep.col.order')}</th><th className="py-2 pr-3 font-medium">{t('rep.col.customer')}</th>
              <th className="py-2 pr-3 text-right font-medium">{t('rep.col.base')}</th><th className="py-2 pr-3 text-right font-medium">{t('rep.col.rate')}</th><th className="py-2 text-right font-medium">{t('rep.col.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.sort((a, b2) => a.romeDate.localeCompare(b2.romeDate)).map((e) => (
              <tr key={e.id} className="border-b border-[#eaeaea]">
                <td className="num py-2 pr-3">{e.romeDate}</td>
                <td className="num py-2 pr-3">{e.orderNumber}{e.adjustment ? ` (${t('com.adjustment')})` : ''}</td>
                <td className="py-2 pr-3">{e.businessName}</td>
                <td className="num py-2 pr-3 text-right">{eur(e.baseCents, lang)}</td>
                <td className="num py-2 pr-3 text-right">{e.pct}%</td>
                <td className="num py-2 text-right">{eur(e.amountCents, lang)}</td>
              </tr>
            ))}
            <tr><td colSpan={5} className="pt-3 text-base font-bold">{t('cart.total')}</td><td className="num pt-3 text-right text-base font-bold">{eur(p.amountCents, lang)}</td></tr>
          </tbody>
        </table>
        {p.note && <p className="text-[#666]">{t('admin.note')}: {p.note}</p>}
        <footer className="border-t border-[#eaeaea] pt-4 text-[11.5px] text-[#666]">{t('com.recordedBy', { name: p.recordedBy, when: formatRome(p.recordedAt, lang) })} {t('com.statementNote')}</footer>
      </article>
    </div>
  );
}
