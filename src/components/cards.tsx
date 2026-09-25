import clsx from 'clsx';
import { Check, ShoppingCart, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ProductImage } from './productBits';
import { eur } from '../domain/money';
import { bandIndex, bandPrice } from '../domain/pricing';
import type { Deal, Product } from '../domain/types';
import { discountPct, useAllowanceLeft, useBands, useLang } from '../lib/hooks';
import { useCart } from '../store/cart';
import { QtyStepper } from './controls';
import { Button, OffBadge, Pill } from './ui';

const enter = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, delay: Math.min(i, 12) * 0.04, ease: [0.16, 1, 0.3, 1] as const },
});

function AddButton({ onAdd, disabled, label }: { onAdd: () => void; disabled?: boolean; label: string }) {
  const { t } = useTranslation();
  const [added, setAdded] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
      className={clsx('flex-1', added && '!bg-ok !text-white')}
      onClick={() => {
        onAdd();
        setAdded(true);
        setTimeout(() => setAdded(false), 1200);
      }}
    >
      {added ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
      {added ? t('catalog.added') : label}
    </Button>
  );
}

function StockPill({ stock }: { stock: number }) {
  const { t } = useTranslation();
  if (stock <= 0) return <Pill tone="bad">{t('catalog.out')}</Pill>;
  if (stock <= 20) return <Pill tone="warn">{t('catalog.low', { n: stock })}</Pill>;
  return <Pill tone="ok">{t('catalog.in')}</Pill>;
}

export function ProductCard({ product: p, deal, index, rank }: { product: Product; deal?: Deal; index: number; rank?: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const add = useCart((s) => s.add);
  const inCart = useCart((s) => s.items[p.id] ?? 0);
  const allowance = useAllowanceLeft();
  const { bands, min, labels } = useBands();
  const [qty, setQty] = useState(0);
  const oos = p.stock <= 0;
  // A new line must meet the minimum; once it's in the cart, any extra case is fine.
  const minAdd = Math.max(1, min - inCart);
  const max = deal ? allowance(deal) - inCart : p.stock - inCart;
  const q = Math.min(Math.max(qty, minAdd), Math.max(minAdd, max));
  const cannotAdd = max < minAdd;
  const active = bandIndex(inCart + q, bands);
  return (
    <motion.article {...enter(index)} className={clsx('group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-2', oos && 'opacity-60')}>
      <Link to={`/product/${p.id}`} className="relative grid h-32 place-items-center bg-surface-2" aria-label={p.name[lang]}>
        <ProductImage product={p} className="absolute inset-0" />
        {rank ? (
          <span className="num absolute left-2.5 top-2.5 rounded-md bg-fg px-2 py-0.5 text-[11px] font-bold text-bg">{t('home.rank', { n: rank })}</span>
        ) : (
          <span className="absolute left-2.5 top-2.5 rounded bg-surface px-1.5 text-[10.5px] text-muted">{p.sku}</span>
        )}
        <span className="absolute right-2.5 top-2">
          <StockPill stock={p.stock} />
        </span>
        {deal && <OffBadge className="absolute bottom-2.5 left-2.5">−{discountPct(p.tiers[0], deal.priceCents)}% · {t('sale.today')}</OffBadge>}
      </Link>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <h3 className="font-medium leading-snug"><Link to={`/product/${p.id}`} className="hover:underline">{p.name[lang]}</Link></h3>
          <p className="text-[13px] text-muted">{p.pack[lang]}</p>
        </div>
        {deal ? (
          <div className="grid gap-0.5 rounded-lg border border-line px-3 py-2">
            <div className="flex items-baseline gap-2">
              <b className="num text-lg font-bold">{eur(deal.priceCents, lang)}</b>
              <s className="num text-[13px] text-muted">{eur(p.tiers[0], lang)}</s>
            </div>
            <span className="text-xs text-muted">{t('sale.anyQty')}</span>
          </div>
        ) : (
          <div className="grid overflow-hidden rounded-lg border border-line text-center text-[11.5px]" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-label={t('catalog.tiers')}>
            {labels.map((r, i) => (
              <div key={r} className={clsx('grid border-line py-1.5 transition-colors [&:not(:last-child)]:border-r', i === active && 'bg-primary-soft')}>
                <span className="text-[10.5px] text-muted">{r}</span>
                <b className="num text-[13px] font-medium">{eur(bandPrice(p, i), lang)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="mt-auto flex gap-2 pt-1">
          <QtyStepper value={q} onChange={setQty} min={minAdd} max={Math.max(minAdd, max)} label={t('catalog.qty')} />
          {oos ? (
            <Button size="sm" variant="ghost" className="flex-1" disabled>
              {t('catalog.out')}
            </Button>
          ) : (
            <AddButton label={cannotAdd && deal ? t('sale.limitHit') : t('catalog.add')} disabled={cannotAdd} onAdd={() => add(p.id, q)} />
          )}
        </div>
        {!oos && inCart === 0 && min > 1 && <p className="-mt-1 text-[11.5px] text-muted">{t('catalog.minPerLine', { n: min })}</p>}
      </div>
    </motion.article>
  );
}

export function DealCard({ deal, product: p, featured, index, compact }: { deal: Deal; product: Product; featured?: boolean; index: number; compact?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const add = useCart((s) => s.add);
  const inCart = useCart((s) => s.items[p.id] ?? 0);
  const allowance = useAllowanceLeft();
  const { min } = useBands();
  const [qty, setQty] = useState(0);
  const left = allowance(deal) - inCart;
  const minAdd = Math.max(1, min - inCart);
  const q = Math.min(Math.max(qty, minAdd), Math.max(minAdd, left));
  const cannotAdd = left < minAdd;
  const pct = discountPct(p.tiers[0], deal.priceCents);
  const claimed = deal.stockCap ? Math.min(100, Math.round((deal.sold / deal.stockCap) * 100)) : null;
  const casesLeft = deal.stockCap ? Math.max(0, deal.stockCap - deal.sold) : null;
  return (
    <motion.article
      {...enter(index)}
      className={clsx(
        'flex overflow-hidden rounded-xl border border-line transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-2',
        featured ? 'inv flex-col sm:col-span-2 sm:flex-row' : 'flex-col bg-surface',
      )}
    >
      <Link to={`/product/${p.id}`} aria-label={p.name[lang]} className={clsx('relative grid place-items-center bg-surface-2', featured ? 'h-40 sm:h-auto sm:min-h-60 sm:w-[42%]' : 'h-32')}>
        <ProductImage product={p} className="absolute inset-0" iconClass={featured ? 'size-16' : 'size-11'} />
        <OffBadge className={clsx('absolute left-3 top-3 px-2.5 py-1 text-sm', featured && '!bg-inv-fg !text-inv-bg')}>−{pct}%</OffBadge>
        {claimed !== null && claimed >= 80 && <Pill tone="bad" className="absolute right-3 top-3">{t('sale.hot')}</Pill>}
      </Link>
      <div className={clsx('flex flex-1 flex-col gap-2', featured ? 'p-5' : 'p-4')}>
        {featured && (
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.1em] text-muted">
            <Zap className="size-3.5" /> {t('sale.dotd')}
          </span>
        )}
        <div>
          <h3 className={clsx('leading-snug', featured ? 'text-[22px] font-bold' : 'font-medium')}><Link to={`/product/${p.id}`} className="hover:underline">{p.name[lang]}</Link></h3>
          <p className="text-[13px] text-muted">{p.pack[lang]}</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <b className={clsx('num font-bold tracking-tight', featured ? 'text-[34px]' : 'text-2xl')}>{eur(deal.priceCents, lang)}</b>
          <s className="num text-sm text-muted">{eur(p.tiers[0], lang)}</s>
        </div>
        <p className="text-[13px] font-medium">{t('sale.save', { x: eur(p.tiers[0] - deal.priceCents, lang) })}</p>
        {claimed !== null && (
          <div className="grid gap-1 text-xs text-muted">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full rounded-full bg-fg" initial={{ width: 0 }} animate={{ width: `${claimed}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            {t('sale.claimed', { p: claimed, n: casesLeft })}
          </div>
        )}
        {!compact && <p className="text-xs text-muted">{t('sale.limit', { n: deal.perResellerLimit })}</p>}
        <div className="mt-auto flex gap-2 pt-1">
          <QtyStepper value={q} onChange={setQty} min={minAdd} max={Math.max(minAdd, left)} label={t('catalog.qty')} />
          <AddButton label={cannotAdd ? t('sale.limitHit') : t('sale.add')} disabled={cannotAdd} onAdd={() => add(p.id, q)} />
        </div>
      </div>
    </motion.article>
  );
}
