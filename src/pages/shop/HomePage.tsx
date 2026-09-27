import clsx from 'clsx';
import { ArrowRight, Flame, RotateCcw, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe, useMyOrders, useProducts, useTopSellers } from '../../api/queries';
import { ProductCard } from '../../components/cards';
import { SaleBackdrop } from '../../components/SaleBackdrop';
import { Countdown } from '../../components/controls';
import { CategoryIcon, ProductIcon, useCategoryList } from '../../components/ProductIcon';
import { EmptyState, OffBadge, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import { discountPct, useDocumentTitle, useLang, useSale } from '../../lib/hooks';
import { useCart } from '../../store/cart';
import { toast } from '../../store/toasts';

export function HomePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useMe();
  useDocumentTitle();
  const sale = useSale();
  const orders = useMyOrders();
  const cats = useCategoryList();
  const add = useCart((s) => s.add);
  const top = [...sale.live].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort - b.sort).slice(0, 3);
  const maxPct = Math.max(0, ...sale.live.map((d) => discountPct(sale.productById.get(d.productId)?.tiers[0] ?? d.priceCents, d.priceCents)));
  const last = orders.data?.[0];

  return (
    <div className="grid gap-8">
      <p className="text-muted">{t('home.hello', { name: me.data?.fullName.split(' ')[0] ?? '' })}</p>

      {/* Today's Sale hero: the one black block on the page (spec §05). */}
      <section className="inv relative isolate grid gap-8 overflow-hidden rounded-2xl p-6 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:items-center" aria-labelledby="sale-hero">
        <SaleBackdrop />
        <div className="grid content-start gap-4">
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.1em] text-muted">
            <Flame className="size-4" />
            {new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(sale.now)}
          </span>
          <h1 id="sale-hero" className="text-[40px] font-bold leading-[1.05] tracking-tight sm:text-5xl">
            {t('sale.nav')}
          </h1>
          <p className="max-w-[42ch] text-muted">
            {sale.live.length ? t('sale.heroSub', { pct: maxPct }) : sale.beforeStart ? t('sale.startsAt') : t('sale.none')}
          </p>
          {sale.live.length > 0 && <Countdown to={sale.window.end} now={sale.now} />}
          {sale.beforeStart && <Countdown to={sale.window.start} now={sale.now} />}
          <Link to="/sale" className="inline-flex h-10 items-center gap-2 justify-self-start rounded-lg bg-primary px-5 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover">
            {t('sale.shop')} <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-2">
          {sale.loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[70px]" />)}
          {top.map((d, i) => {
            const p = sale.productById.get(d.productId);
            if (!p) return null;
            return (
              <motion.div key={d.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
                <Link to="/sale" className="grid grid-cols-[48px_1fr_auto] items-center gap-3.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 transition-transform duration-200 hover:translate-x-1">
                  <span className="grid size-12 place-items-center rounded-lg bg-surface">
                    <ProductIcon name={p.icon} className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-medium">{p.name[lang]}</b>
                    <span className="text-[13px] text-muted">{p.pack[lang]}</span>
                  </span>
                  <span className="grid justify-items-end gap-0.5">
                    <OffBadge className="!bg-inv-fg !text-inv-bg">−{discountPct(p.tiers[0], d.priceCents)}%</OffBadge>
                    <b className="num text-[17px] font-bold">{eur(d.priceCents, lang)}</b>
                    <s className="num text-xs text-muted">{eur(p.tiers[0], lang)}</s>
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="cats">
        <div className="flex items-center justify-between">
          <h2 id="cats" className="text-lg font-medium">{t('home.cats')}</h2>
          <Link to="/catalog" className="text-sm font-medium underline underline-offset-4">{t('home.all')}</Link>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {cats.active.map((c) => (
            <Link key={c.id} to={`/catalog?cat=${c.id}`} className="grid justify-items-center gap-2 rounded-xl border border-line bg-surface px-2 py-4 text-center text-[13px] font-medium transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-fg">
              <span className="grid size-12 place-items-center rounded-full bg-surface-2">
                <CategoryIcon category={c} />
              </span>
              {cats.name(c.id)}
            </Link>
          ))}
        </div>
      </section>

      <TopSellers byProduct={sale.byProduct} />

      {last && (
        <section className="grid gap-3" aria-labelledby="again">
          <h2 id="again" className="text-lg font-medium">{t('home.again')}</h2>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 shadow-1">
            <div>
              <p className="font-medium">{last.number} · <span className="num">{eur(last.totalCents, lang)}</span></p>
              <p className="text-sm text-muted">
                {formatRome(last.placedAt, lang, false)} · {last.lines.map((l) => `${l.qty}× ${l.name[lang]}`).join(', ')}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium hover:bg-surface-2"
              onClick={() => {
                last.lines.forEach((l) => add(l.productId, l.qty));
                toast({ title: t('home.againDone'), action: { label: t('nav.cart'), to: '/cart' }, tone: 'ok' });
              }}
            >
              <RotateCcw className="size-4" /> {t('home.againBtn')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Top sellers across all categories, ranked by cases ordered in the last 30 days. Filter by category with the chips. */
function TopSellers({ byProduct }: { byProduct: ReturnType<typeof useSale>['byProduct'] }) {
  const { t } = useTranslation();
  const top = useTopSellers();
  const products = useProducts();
  const [cat, setCat] = useState<string>('all');
  const catList = useCategoryList();
  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
  const ranked = (top.data ?? []).map((r) => ({ ...r, product: byId.get(r.productId) })).filter((r) => r.product);
  const cats = catList.active.map((c) => c.id).filter((c) => ranked.some((r) => r.product!.category === c));
  const list = ranked.filter((r) => cat === 'all' || r.product!.category === cat).slice(0, 8);

  return (
    <section className="grid gap-3" aria-labelledby="top-sellers">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="top-sellers" className="flex items-center gap-2 text-lg font-medium"><TrendingUp className="size-5" /> {t('home.top')}</h2>
          <p className="text-sm text-muted">{t('home.topSub')}</p>
        </div>
        <Link to="/catalog" className="text-sm font-medium underline underline-offset-4">{t('home.all')}</Link>
      </div>
      {cats.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('catalog.category')}>
          {(['all', ...cats] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={clsx('h-8 rounded-full border px-3.5 text-[13px] transition-colors', cat === c ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface hover:bg-surface-2')}>
              {c === 'all' ? t('catalog.all') : catList.name(c)}
            </button>
          ))}
        </div>
      )}
      {top.isLoading || products.isLoading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}</div>
      ) : list.length ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((r, i) => <ProductCard key={`${cat}-${r.productId}`} product={r.product!} deal={byProduct.get(r.productId)} index={i} rank={r.rank} />)}
        </div>
      ) : (
        <EmptyState icon={<TrendingUp className="size-5" />} title={t('home.topEmpty')} />
      )}
    </section>
  );
}
