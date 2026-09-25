import { ArrowLeft, Ban, FileText, Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, useApi, useOrder, useResellers } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { FLOW, PaymentPill, StatusPill, TrackingBar } from '../../components/orderBits';
import { Button, Card, ErrorNote, EuroInput, Field, Input, Skeleton } from '../../components/ui';
import { eur, parseEuro } from '../../domain/money';
import { formatRome, romeDateKey } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';
import { OrderLines, OrderTotals } from '../shop/OrderPage';

export function AdminOrderPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { id = '' } = useParams();
  const order = useOrder(id);
  const resellers = useResellers();
  const setStatus = useApi(api.setOrderStatus);
  const markPaid = useApi(api.markPaid);
  const resend = useApi(api.resendInvoice);
  const [pay, setPay] = useState<{ receivedOn: string; amount: string; reference: string; note: string } | null>(null);
  useDocumentTitle(order.data?.number);

  if (order.isLoading) return <Skeleton className="h-96" />;
  if (!order.data) return <ErrorNote><ApiErrorMessage error={order.error} /></ErrorNote>;
  const o = order.data;
  const buyer = resellers.data?.find((u) => u.id === o.userId);
  const nextStatus = o.status === 'cancelled' ? null : FLOW[FLOW.indexOf(o.status) + 1] ?? null;
  const error = setStatus.error ?? markPaid.error ?? resend.error;

  return (
    <div className="grid gap-5">
      <Link to="/admin/orders" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('admin.nav.orders')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="num text-[26px] font-bold tracking-tight">{o.number}</h1>
          <StatusPill status={o.status} />
          <PaymentPill status={o.paymentStatus} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/invoice/${o.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"><FileText className="size-4" /> {t('order.invoice')} {o.invoiceNumber}</Link>
          <Button variant="ghost" loading={resend.isPending} onClick={async () => { await resend.mutateAsync([o.id]); toast({ title: t('admin.resent'), tone: 'ok' }); }}><Mail className="size-4" /> {t('admin.resend')}</Button>
        </div>
      </div>
      {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="grid gap-6 p-5">
          {o.status !== 'cancelled' && <TrackingBar order={o} />}
          <div className="flex flex-wrap gap-2">
            {nextStatus && <Button loading={setStatus.isPending} onClick={() => setStatus.mutate([o.id, nextStatus])}>{t('admin.moveTo', { status: t(`status.${nextStatus}`) })}</Button>}
            {o.status !== 'cancelled' && o.status !== 'delivered' && <Button variant="danger" onClick={() => setStatus.mutate([o.id, 'cancelled'])}><Ban className="size-4" /> {t('admin.cancelOrder')}</Button>}
          </div>
          <OrderLines order={o} />
          <OrderTotals order={o} />
        </Card>
        <div className="grid gap-5">
          <Card className="grid gap-2 p-5 text-sm">
            <h2 className="font-medium">{t('admin.reseller')}</h2>
            <p><b className="font-medium">{o.businessName}</b><br />{o.address}<br /><span className="text-muted">{o.cityName}{o.zoneName ? ` › ${o.zoneName}` : ''}</span></p>
            {buyer && <p className="text-muted">{buyer.fullName} · {buyer.email} · +39 {buyer.mobile}<br />P.IVA {buyer.vatNumber} · SDI/PEC {buyer.sdiOrPec}</p>}
            <p className="text-muted">{t('order.placed')}: {formatRome(o.placedAt, lang)}</p>
          </Card>
          <Card className="grid gap-3 p-5 text-sm">
            <div className="flex items-center justify-between"><h2 className="font-medium">{t('admin.payment')}</h2><PaymentPill status={o.paymentStatus} /></div>
            <p className="text-muted">{o.paymentMethodName[lang]} · {eur(o.totalCents, lang)}</p>
            {o.payment && <p>{t('invoice.paidOn', { date: o.payment.receivedOn, amount: eur(o.payment.amountCents, lang), ref: o.payment.reference || '—' })}{o.payment.note && <><br /><span className="text-muted">{o.payment.note}</span></>}</p>}
            {o.paymentStatus !== 'paid' && !pay && <Button variant="ghost" className="justify-self-start" onClick={() => setPay({ receivedOn: romeDateKey(), amount: (o.totalCents / 100).toFixed(2), reference: '', note: '' })}>{t('admin.markPaid')}</Button>}
            {pay && (
              <form
                className="grid gap-3 rounded-xl border border-line bg-canvas p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const cents = parseEuro(pay.amount);
                  if (cents === null) return;
                  await markPaid.mutateAsync([o.id, { receivedOn: pay.receivedOn, amountCents: cents, reference: pay.reference, note: pay.note }]);
                  setPay(null);
                  toast({ title: t('admin.paidSaved'), tone: 'ok' });
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('admin.receivedOn')} htmlFor="p-date"><Input id="p-date" type="date" value={pay.receivedOn} onChange={(e) => setPay({ ...pay, receivedOn: e.target.value })} /></Field>
                  <Field label={t('admin.amount')} htmlFor="p-amt"><EuroInput id="p-amt" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} invalid={parseEuro(pay.amount) === null} /></Field>
                </div>
                <Field label={t('admin.reference')} htmlFor="p-ref" hint={t('admin.referenceHint')}><Input id="p-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
                <Field label={t('admin.note')} htmlFor="p-note"><Input id="p-note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
                <div className="flex gap-2"><Button type="submit" size="sm" loading={markPaid.isPending}>{t('common.save')}</Button><Button type="button" size="sm" variant="quiet" onClick={() => setPay(null)}>{t('common.cancel')}</Button></div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
