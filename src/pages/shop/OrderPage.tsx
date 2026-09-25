import { ArrowLeft, FileText, Mail, Receipt, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { useOrder } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { PaymentPill, StatusPill, TrackingBar } from '../../components/orderBits';
import { Button, Card, ErrorNote, OffBadge, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import type { Order } from '../../domain/types';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { useCart } from '../../store/cart';
import { toast } from '../../store/toasts';

/** Circle then tick, drawn with stroke offsets (spec: success check). */
function SuccessMark() {
  return (
    <svg viewBox="0 0 64 64" className="size-16" aria-hidden>
      <motion.circle cx="32" cy="32" r="29" fill="var(--ok-soft)" stroke="var(--ok)" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      <motion.path d="M20 33l8 8 16-17" fill="none" stroke="var(--ok)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.35, ease: [0.16, 1, 0.3, 1] }} />
    </svg>
  );
}

export function OrderLines({ order }: { order: Order }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.06em] text-muted">
            <th className="py-2 pr-3 font-medium">{t('order.item')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('order.cases')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('order.unit')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('order.vat')}</th>
            <th className="py-2 text-right font-medium">{t('order.line')}</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.productId} className="border-b border-line last:border-0">
              <td className="py-2.5 pr-3">
                {l.name[lang]} <span className="text-muted">· {l.pack[lang]}</span> {l.source.startsWith('deal:') && <OffBadge className="ml-1 text-[10px]">{t('sale.tag')}</OffBadge>}
              </td>
              <td className="num py-2.5 pr-3 text-right">{l.qty}</td>
              <td className="num py-2.5 pr-3 text-right">{eur(l.unitCents, lang)}</td>
              <td className="num py-2.5 pr-3 text-right text-muted">{l.vatPercent}%</td>
              <td className="num py-2.5 text-right">{eur(l.lineCents, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <dl className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
      <div className="flex justify-between"><dt>{t('cart.subtotal')}</dt><dd className="num">{eur(order.subtotalCents, lang)}</dd></div>
      <div className="flex justify-between"><dt>{t('cart.shipping', { place: order.zoneName || order.cityName })}</dt><dd className="num">{eur(order.shippingCents, lang)}</dd></div>
      {order.vat.map((r) => (
        <div key={r.percent} className="flex justify-between text-muted"><dt>{t('cart.vatRow', { p: r.percent, base: eur(r.baseCents, lang) })}</dt><dd className="num">{eur(r.vatCents, lang)}</dd></div>
      ))}
      <div className="mt-1 flex justify-between border-t border-line pt-2.5 text-base font-bold"><dt>{t('cart.total')}</dt><dd className="num">{eur(order.totalCents, lang)}</dd></div>
    </dl>
  );
}

export function OrderPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const placed = params.get('placed') === '1';
  const order = useOrder(id);
  const add = useCart((s) => s.add);
  useDocumentTitle(order.data?.number);

  if (order.isLoading) return <Skeleton className="h-96" />;
  if (order.error || !order.data) return <ErrorNote><ApiErrorMessage error={order.error} /></ErrorNote>;
  const o = order.data;

  return (
    <div className="grid gap-5">
      <Link to="/orders" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {t('nav.orders')}
      </Link>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.25fr]">
        <Card className="grid content-start gap-4 p-6">
          {placed && <SuccessMark />}
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">{placed ? t('order.placedTitle') : o.number}</h1>
            {placed && <p className="mt-1 text-muted">{t('order.placedBody')}</p>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
            <dt className="text-muted">{t('order.number')}</dt><dd className="num font-medium">{o.number}</dd>
            <dt className="text-muted">{t('order.placed')}</dt><dd>{formatRome(o.placedAt, lang)}</dd>
            <dt className="text-muted">{t('cart.deliverTo')}</dt><dd>{o.address}{o.zoneName ? ` · ${o.zoneName}` : ''}</dd>
            <dt className="text-muted">{t('cart.total')}</dt><dd className="num font-medium">{eur(o.totalCents, lang)}</dd>
          </dl>
          <div className="grid gap-2 rounded-xl border border-line bg-canvas p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <b className="font-medium">{o.paymentMethodName[lang]}</b>
              <PaymentPill status={o.paymentStatus} />
            </div>
            {o.paymentStatus !== 'paid' && <p className="leading-relaxed text-muted">{o.paymentInstructions[lang]}</p>}
            {o.paymentStatus !== 'paid' && <p className="text-[13px]">{t('order.reference')} <b className="num font-medium">{o.number}</b></p>}
            {o.payments.length > 0 && (
              <ul className="grid gap-1.5 border-t border-line pt-2.5">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span><b className="num font-medium">{eur(p.amountCents, lang)}</b> <span className="text-muted">· {t(`admin.pay.kind.${p.kind}`)} · {p.receivedOn}</span></span>
                    <Link to={`/receipt/${o.id}/${p.id}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-4"><Receipt className="size-3.5" /> {t('receipt.short')} {p.receiptNumber}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/invoice/${o.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover">
              <FileText className="size-4" /> {t('order.invoice')}
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                o.lines.forEach((l) => add(l.productId, l.qty));
                toast({ title: t('home.againDone'), action: { label: t('nav.cart'), to: '/cart' }, tone: 'ok' });
              }}
            >
              <RotateCcw className="size-4" /> {t('home.againBtn')}
            </Button>
          </div>
          {o.emailSentAt && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Mail className="size-3.5" /> {t('order.emailed', { when: formatRome(o.emailSentAt, lang) })}
            </p>
          )}
        </Card>
        <Card className="grid gap-6 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">{t('order.status')}</h2>
            <StatusPill status={o.status} />
          </div>
          {o.status !== 'cancelled' && <TrackingBar order={o} />}
          <OrderLines order={o} />
          <OrderTotals order={o} />
        </Card>
      </div>
    </div>
  );
}
