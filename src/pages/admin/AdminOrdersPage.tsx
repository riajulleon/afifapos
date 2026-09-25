import { Download, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAdminCities, useAdminOrders } from '../../api/queries';
import { FLOW, PaymentPill, StatusPill } from '../../components/orderBits';
import { Button, EmptyState, PageHeader, Select, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import { downloadCsv } from '../../lib/csv';
import { useDocumentTitle, useLang } from '../../lib/hooks';

export function AdminOrdersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.orders'));
  const orders = useAdminOrders();
  const cities = useAdminCities();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const pay = params.get('pay') ?? '';
  const city = params.get('city') ?? '';
  const q = params.get('q') ?? '';
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const list = useMemo(
    () =>
      (orders.data ?? []).filter(
        (o) =>
          (!status || o.status === status) &&
          (!pay || o.paymentStatus === pay) &&
          (!city || o.cityId === city) &&
          (!q || `${o.number} ${o.businessName} ${o.invoiceNumber}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [orders.data, status, pay, city, q],
  );

  const exportCsv = () =>
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Order', 'Invoice', 'Date (Rome)', 'Reseller', 'City', 'Zone', 'Status', 'Payment', 'Method', 'Subtotal', 'Shipping', 'VAT', 'Total'],
      ...list.map((o) => [
        o.number, o.invoiceNumber, formatRome(o.placedAt, 'en'), o.businessName, o.cityName, o.zoneName, o.status, o.paymentStatus, o.paymentMethodName.en,
        (o.subtotalCents / 100).toFixed(2), (o.shippingCents / 100).toFixed(2), (o.vat.reduce((a, r) => a + r.vatCents, 0) / 100).toFixed(2), (o.totalCents / 100).toFixed(2),
      ]),
    ]);

  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.orders')} sub={t('admin.ordersSub', { count: list.length })} actions={<Button variant="ghost" onClick={exportCsv}><Download className="size-4" /> {t('admin.exportCsv')}</Button>} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-fg">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => set('q', e.target.value)} placeholder={t('admin.searchOrders')} aria-label={t('admin.searchOrders')} className="w-full bg-transparent text-sm outline-none" />
        </label>
        <Select value={status} onChange={(e) => set('status', e.target.value)} aria-label={t('order.status')}>
          <option value="">{t('admin.anyStatus')}</option>
          {[...FLOW, 'cancelled'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
        <Select value={pay} onChange={(e) => set('pay', e.target.value)} aria-label={t('admin.payment')}>
          <option value="">{t('admin.anyPayment')}</option>
          {['awaiting', 'paid', 'partial', 'refunded'].map((s) => <option key={s} value={s}>{t(`pay.${s}`)}</option>)}
        </Select>
        <Select value={city} onChange={(e) => set('city', e.target.value)} aria-label={t('apply.city')}>
          <option value="">{t('admin.anyCity')}</option>
          {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {orders.isLoading ? (
        <Skeleton className="h-96" />
      ) : list.length === 0 ? (
        <EmptyState title={t('admin.noOrders')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
                {[t('order.number'), t('order.placed'), t('admin.reseller'), t('apply.city'), t('order.status'), t('admin.payment'), t('cart.total')].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 font-medium ${i === 6 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 200).map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-canvas">
                  <td className="num px-4 py-2.5"><Link to={`/admin/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link></td>
                  <td className="px-4 py-2.5 text-muted">{formatRome(o.placedAt, lang)}</td>
                  <td className="px-4 py-2.5">{o.businessName}</td>
                  <td className="px-4 py-2.5 text-muted">{o.cityName}{o.zoneName ? ` › ${o.zoneName}` : ''}</td>
                  <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-2.5"><PaymentPill status={o.paymentStatus} /></td>
                  <td className="num px-4 py-2.5 text-right font-medium">{eur(o.totalCents, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
