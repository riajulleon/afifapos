import clsx from 'clsx';
import { ChevronRight, Flame, Timer, Truck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DealCard } from '../../components/cards';
import { SaleBackdrop } from '../../components/SaleBackdrop';
import { Countdown } from '../../components/controls';
import { EmptyState, Skeleton } from '../../components/ui';
import { discountPct, useDocumentTitle, useSale } from '../../lib/hooks';

type Filter = 'all' | 'big' | 'end';

export function SalePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('sale.nav'));
  const sale = useSale();
  const [filter, setFilter] = useState<Filter>('all');
  const pct = (id: string) => {
    const d = sale.live.find((x) => x.id === id)!;
    return discountPct(sale.productById.get(d.productId)?.tiers[0] ?? d.priceCents, d.priceCents);
  };
  const claimed = (id: string) => {
    const d = sale.live.find((x) => x.id === id)!;
    return d.stockCap ? d.sold / d.stockCap : 0;
  };
  let list = [...sale.live].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort - b.sort);
  if (filter === 'big') list = list.sort((a, b) => pct(b.id) - pct(a.id));
  if (filter === 'end') list = list.filter((d) => claimed(d.id) >= 0.8);
  const maxPct = list.length ? Math.max(...sale.live.map((d) => pct(d.id))) : 0;

  return (
    <div className="grid gap-5">
      <header className="inv relative isolate flex flex-wrap items-end justify-between gap-5 overflow-hidden rounded-2xl px-6 py-6 sm:px-7">
        <SaleBackdrop />
        <div className="grid gap-2">
          <nav className="flex items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
            <Link to="/" className="hover:underline">{t('nav.home')}</Link>
            <ChevronRight className="size-3.5" />
            <span>{t('sale.nav')}</span>
          </nav>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">{t('sale.nav')}</h1>
          <p className="text-muted">{sale.live.length ? t('sale.count', { n: sale.live.length, p: maxPct }) : sale.beforeStart ? t('sale.startsAt') : t('sale.none')}</p>
        </div>
        {(sale.live.length > 0 || sale.beforeStart) && (
          <div className="grid justify-items-start gap-1.5 sm:justify-items-end">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.1em] text-muted">
              <Timer className="size-4" /> {sale.live.length ? t('sale.endsIn') : t('sale.startsIn')}
            </span>
            <Countdown to={sale.live.length ? sale.window.end : sale.window.start} now={sale.now} />
          </div>
        )}
      </header>

      {sale.live.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('catalog.filters')}>
            {(['all', 'big', 'end'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={clsx('h-8 rounded-full border px-3.5 text-[13px] transition-colors', filter === f ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface hover:bg-surface-2')}>
                {t(`sale.f.${f}`)}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Truck className="size-4" /> {t('sale.minNote')}
          </span>
        </div>
      )}

      {sale.loading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-80" />)}
        </div>
      ) : list.length ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d, i) => {
            const p = sale.productById.get(d.productId);
            return p ? <DealCard key={d.id} deal={d} product={p} index={i} featured={filter === 'all' && d.featured} /> : null;
          })}
        </div>
      ) : (
        <EmptyState icon={<Flame className="size-5" />} title={sale.live.length ? t('sale.noneFiltered') : t('sale.none')} body={t('sale.noneBody')} action={<Link to="/catalog" className="text-sm font-medium underline underline-offset-4">{t('home.all')}</Link>} />
      )}
    </div>
  );
}
