import { ChevronRight, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMyOrders } from '../../api/queries';
import { PaymentPill, StatusPill } from '../../components/orderBits';
import { EmptyState, PageHeader, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';

export function OrdersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('nav.orders'));
  const orders = useMyOrders();
  return (
    <div className="grid gap-5">
      <PageHeader title={t('nav.orders')} sub={t('orders.sub')} />
      {orders.isLoading ? (
        <Skeleton className="h-64" />
      ) : !orders.data?.length ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title={t('orders.empty')} action={<Link to="/catalog" className="text-sm font-medium underline underline-offset-4">{t('home.all')}</Link>} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-1">
          <ul className="divide-y divide-line">
            {orders.data.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-canvas sm:grid-cols-[150px_1fr_auto_auto_auto_16px]">
                  <span className="num font-medium">{o.number}</span>
                  <span className="text-sm text-muted sm:order-none">{formatRome(o.placedAt, lang)}</span>
                  <span className="hidden sm:block"><StatusPill status={o.status} /></span>
                  <span className="hidden sm:block"><PaymentPill status={o.paymentStatus} /></span>
                  <b className="num text-right font-medium">{eur(o.totalCents, lang)}</b>
                  <ChevronRight className="hidden size-4 text-muted sm:block" />
                  <span className="col-span-2 flex gap-2 sm:hidden"><StatusPill status={o.status} /><PaymentPill status={o.paymentStatus} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
