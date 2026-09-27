import clsx from 'clsx';
import { ArrowLeft, Check, ShoppingCart } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { usePublicSettings, useProducts } from '../../api/queries';
import { QtyStepper } from '../../components/controls';
import { ExpiryBadge, ProductImage } from '../../components/productBits';
import { useCategoryList } from '../../components/ProductIcon';
import { Button, EmptyState, OffBadge, Pill, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { bandIndex, bandPrice } from '../../domain/pricing';
import { discountPct, useAllowanceLeft, useBands, useDocumentTitle, useLang, useSale } from '../../lib/hooks';
import { useCart } from '../../store/cart';
import { toast } from '../../store/toasts';

/** Product detail for resellers: photo, description, best-before, case prices or today's sale price, add to cart. */
export function ProductPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { id = '' } = useParams();
  const products = useProducts();
  const cats = useCategoryList();
  const settings = usePublicSettings();
  const sale = useSale(5000);
  const allowance = useAllowanceLeft();
  const add = useCart((s) => s.add);
  const inCart = useCart((s) => s.items[id] ?? 0);
  const [qty, setQty] = useState(0);
  const { bands, min, labels } = useBands();
  const [added, setAdded] = useState(false);
  const p = products.data?.find((x) => x.id === id);
  useDocumentTitle(p?.name[lang]);

  if (products.isLoading) return <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="aspect-square" /><Skeleton className="h-96" /></div>;
  if (!p) return <EmptyState title={t('product.notFound')} action={<Link to="/catalog" className="text-sm font-medium underline underline-offset-4">{t('home.all')}</Link>} />;

  const deal = sale.byProduct.get(p.id);
  const vat = settings.data?.vatRates.find((v) => v.id === p.vatRateId)?.percent;
  const max = deal ? allowance(deal) - inCart : p.stock - inCart;
  const oos = p.stock <= 0;
  // A new line must meet the minimum; once it's in the cart, any extra case is fine.
  const minAdd = Math.max(1, min - inCart);
  const q = Math.min(Math.max(qty, minAdd), Math.max(minAdd, max));
  const cannotAdd = max < minAdd;
  const active = bandIndex(inCart + q, bands);
  const specs: [string, string][] = [
    [t('product.brand'), p.brand],
    [t('product.origin'), p.origin],
    [t('product.pack'), p.pack[lang]],
    ['SKU', p.sku],
    ['EAN', p.ean],
    [t('order.vat'), vat !== undefined ? `${vat}%` : ''],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="grid gap-5">
      <Link to="/catalog" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('nav.catalog')}</Link>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className="relative">
          <ProductImage product={p} className="aspect-square w-full rounded-2xl border border-line" iconClass="size-28" />
          {deal && <OffBadge className="absolute left-4 top-4 px-3 py-1 text-sm">−{discountPct(p.tiers[0], deal.priceCents)}% · {t('sale.today')}</OffBadge>}
        </motion.div>

        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <p className="text-[13px] font-medium uppercase tracking-[.08em] text-muted">{cats.name(p.category)}{p.brand && ` · ${p.brand}`}</p>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight">{p.name[lang]}</h1>
            <p className="text-muted">{p.pack[lang]}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {oos ? <Pill tone="bad">{t('catalog.out')}</Pill> : p.stock <= 20 ? <Pill tone="warn">{t('catalog.low', { n: p.stock })}</Pill> : <Pill tone="ok">{t('catalog.in')}</Pill>}
              <ExpiryBadge date={p.expiryDate} long />
            </div>
          </div>

          {deal ? (
            <div className="inv grid gap-1 rounded-2xl p-5">
              <span className="text-xs font-medium uppercase tracking-[.1em] text-muted">{t('sale.nav')}</span>
              <div className="flex flex-wrap items-baseline gap-3">
                <b className="num text-[34px] font-bold tracking-tight">{eur(deal.priceCents, lang)}</b>
                <s className="num text-muted">{eur(p.tiers[0], lang)}</s>
              </div>
              <p className="text-sm">{t('sale.save', { x: eur(p.tiers[0] - deal.priceCents, lang) })} · {t('sale.limit', { n: deal.perResellerLimit })}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <span className="text-[13px] font-medium text-muted">{t('catalog.tiers')} · {t('product.exclVat')}</span>
              <div className="grid overflow-hidden rounded-xl border border-line text-center" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
                {labels.map((r, i) => (
                  <div key={r} className={clsx('grid gap-0.5 border-line py-3 transition-colors [&:not(:last-child)]:border-r', i === active && 'bg-primary-soft')}>
                    <span className="text-xs text-muted">{t('product.cases', { r })}</span>
                    <b className="num text-lg font-bold">{eur(bandPrice(p, i), lang)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!oos && (
            <div className="flex flex-wrap items-center gap-3">
              <QtyStepper value={q} onChange={setQty} min={minAdd} max={Math.max(minAdd, max)} label={t('catalog.qty')} />
              <Button
                className={clsx('h-10 min-w-44 flex-1 sm:flex-none', added && '!bg-ok !text-white')}
                disabled={cannotAdd}
                onClick={() => {
                  add(p.id, q);
                  setAdded(true);
                  setTimeout(() => setAdded(false), 1200);
                  toast({ title: t('home.againDone'), body: `${q}× ${p.name[lang]}`, action: { label: t('nav.cart'), to: '/cart' }, tone: 'ok' });
                }}
              >
                {added ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
                {cannotAdd ? (deal ? t('sale.limitHit') : t('catalog.out')) : added ? t('catalog.added') : t('sale.add')}
              </Button>
              {inCart > 0 ? <span className="text-sm text-muted">{t('product.inCart', { n: inCart })}</span> : min > 1 && <span className="text-sm text-muted">{t('catalog.minPerLine', { n: min })}</span>}
            </div>
          )}

          {p.description[lang] && (
            <section className="grid gap-2 border-t border-line pt-5">
              <h2 className="text-sm font-medium">{t('product.description')}</h2>
              <p className="max-w-[62ch] leading-relaxed text-muted">{p.description[lang]}</p>
            </section>
          )}

          <section className="grid gap-2 border-t border-line pt-5">
            <h2 className="text-sm font-medium">{t('product.details')}</h2>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
              {specs.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
