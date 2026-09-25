import clsx from 'clsx';
import { AlertCircle, Check, Landmark, MapPin, ShoppingCart, Trash2, Wallet } from 'lucide-react';
import { motion, useAnimationControls } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, useApi, useCities, useMe, useProducts, usePublicSettings } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { QtyStepper } from '../../components/controls';
import { ProductIcon } from '../../components/ProductIcon';
import { Button, EmptyState, ErrorNote, OffBadge, PageHeader, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { orderTotals, resolveMinimum, resolveShipping, unitPrice } from '../../domain/pricing';
import { discountPct, useAllowanceLeft, useDocumentTitle, useLang, useSale } from '../../lib/hooks';
import { useCart } from '../../store/cart';

export function CartPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('nav.cart'));
  const navigate = useNavigate();
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.set);
  const clear = useCart((s) => s.clear);
  const me = useMe();
  const products = useProducts();
  const cities = useCities();
  const settings = usePublicSettings();
  const sale = useSale(5000);
  const allowance = useAllowanceLeft();
  const [methodId, setMethodId] = useState<string | null>(null);
  const place = useApi(api.placeOrder);
  const shake = useAnimationControls();

  if (products.isLoading || cities.isLoading || settings.isLoading || !me.data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const productById = new Map((products.data ?? []).map((p) => [p.id, p]));
  const vatOf = (rateId: string) => settings.data?.vatRates.find((v) => v.id === rateId)?.percent ?? 22;
  const lines = Object.entries(items)
    .map(([id, qty]) => {
      const p = productById.get(id);
      if (!p) return null;
      const deal = sale.byProduct.get(id);
      const price = unitPrice(p, qty, deal);
      const maxQty = deal ? allowance(deal) : p.stock;
      return { p, qty, deal, ...price, lineCents: price.unitCents * qty, vatPercent: vatOf(p.vatRateId), maxQty, over: qty > maxQty };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const city = cities.data?.find((c) => c.id === me.data!.cityId);
  const zone = city?.zones.find((z) => z.id === me.data!.zoneId);
  const shipping = city ? resolveShipping(city, zone?.id).cents : 0;
  const min = city ? resolveMinimum(city, zone?.id, settings.data!.globalMinOrderCents) : { cents: 0, from: 'global' as const };
  const totals = orderTotals(lines.map((l) => ({ netCents: l.lineCents, vatPercent: l.vatPercent })), shipping);
  const reached = totals.subtotalCents >= min.cents;
  const pct = min.cents ? Math.min(100, (totals.subtotalCents / min.cents) * 100) : 100;
  const methods = settings.data?.paymentMethods ?? [];
  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const blocked = !reached || lines.some((l) => l.over) || !method;

  if (!lines.length) {
    return (
      <div className="grid gap-5">
        <PageHeader title={t('cart.title')} />
        <EmptyState icon={<ShoppingCart className="size-5" />} title={t('cart.empty')} body={t('cart.emptyBody')} action={<Link to="/sale" className="text-sm font-medium underline underline-offset-4">{t('sale.shop')}</Link>} />
      </div>
    );
  }

  const submit = async () => {
    if (blocked) {
      void shake.start({ x: [0, -5, 5, -5, 5, 0], transition: { duration: 0.4 } });
      document.getElementById('minbox')?.focus();
      return;
    }
    const order = await place.mutateAsync([{ items: lines.map((l) => ({ productId: l.p.id, qty: l.qty })), paymentMethodId: method!.id }]);
    clear();
    navigate(`/orders/${order.id}?placed=1`);
  };

  return (
    <div className="grid gap-5">
      <PageHeader title={t('cart.title')} sub={t('cart.lines', { n: lines.length, c: lines.reduce((a, l) => a + l.qty, 0) })} />
      <div className="grid items-start gap-5 lg:grid-cols-[1.45fr_1fr]">
        <section className="grid gap-2.5" aria-label={t('cart.title')}>
          {lines.map((l) => (
            <motion.div layout key={l.p.id} className="grid grid-cols-[48px_1fr] items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-surface p-3.5 shadow-1 sm:grid-cols-[48px_1fr_auto_auto_auto]">
              <span className="grid size-12 place-items-center rounded-lg bg-surface-2">
                <ProductIcon name={l.p.icon} className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {l.p.name[lang]}
                  {l.deal && <OffBadge className="text-[10.5px]">−{discountPct(l.p.tiers[0], l.deal.priceCents)}% {t('sale.tag')}</OffBadge>}
                </p>
                <p className="text-[13px] text-muted">
                  {l.p.pack[lang]} · <span className="num">{eur(l.unitCents, lang)}</span> / {t('common.case')} · {t('cart.vatRate', { p: l.vatPercent })}
                </p>
                {l.over && (
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-bad">
                    <AlertCircle className="size-3.5" /> {l.deal ? t('cart.overDeal', { n: l.maxQty }) : t('cart.overStock', { n: l.maxQty })}
                  </p>
                )}
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:contents">
                <QtyStepper value={l.qty} min={1} max={Math.max(l.qty, l.maxQty)} onChange={(v) => setQty(l.p.id, v)} label={t('catalog.qty')} />
                <b className="num min-w-24 text-right font-medium">{eur(l.lineCents, lang)}</b>
                <button type="button" onClick={() => setQty(l.p.id, 0)} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-bad" aria-label={t('common.remove')}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </section>

        <aside className="grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-1 lg:sticky lg:top-20" aria-label={t('cart.summary')}>
          <div className="grid gap-1">
            <span className="text-[13px] font-medium text-muted">{t('cart.deliverTo')}</span>
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
              <span>
                {me.data.address}
                <br />
                <span className="text-muted">{city?.name}{zone ? ` › ${zone.name}` : ''}</span>
              </span>
            </p>
          </div>

          <motion.div id="minbox" tabIndex={-1} animate={shake} className="grid gap-2 rounded-xl border border-line bg-canvas p-3.5 outline-none">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium">{t('cart.min', { place: zone && min.from === 'zone' ? zone.name : city?.name ?? '' })}</span>
              <span className="num text-muted">{eur(totals.subtotalCents, lang)} / {eur(min.cents, lang)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div className={clsx('h-full rounded-full', reached ? 'bg-ok' : 'bg-warn')} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            <p className={clsx('flex items-center gap-1.5 text-[13px]', reached ? 'text-ok' : 'text-fg')}>
              {reached ? <Check className="size-4" /> : <AlertCircle className="size-4 text-warn" />}
              {reached ? t('cart.ok') : t('cart.gap', { x: eur(min.cents - totals.subtotalCents, lang), place: city?.name ?? '' })}
            </p>
          </motion.div>

          <dl className="grid gap-1.5 text-sm">
            <Row label={t('cart.subtotal')} value={eur(totals.subtotalCents, lang)} />
            <Row label={t('cart.shipping', { place: zone?.name ?? city?.name ?? '' })} value={totals.shippingCents === 0 ? t('cart.free') : eur(totals.shippingCents, lang)} />
            {totals.vat.map((r) => (
              <Row key={r.percent} label={t('cart.vatRow', { p: r.percent, base: eur(r.baseCents, lang) })} value={eur(r.vatCents, lang)} muted />
            ))}
            <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-3">
              <dt className="text-base font-bold">{t('cart.total')}</dt>
              <dd className="num text-lg font-bold">{eur(totals.totalCents, lang)}</dd>
            </div>
          </dl>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[13px] font-medium text-muted">{t('cart.payWith')}</legend>
            {methods.map((m) => {
              const on = method?.id === m.id;
              const Icon = m.kind === 'bank' ? Landmark : Wallet;
              return (
                <label key={m.id} className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors', on ? 'border-fg bg-canvas' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="pay" className="mt-1 accent-[var(--primary)]" checked={on} onChange={() => setMethodId(m.id)} />
                  <span className="grid gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="size-4" /> {m.name[lang]}
                    </span>
                    {on && <span className="text-[12.5px] leading-relaxed text-muted">{m.instructions[lang]}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {place.error && <ErrorNote><ApiErrorMessage error={place.error} /></ErrorNote>}
          <Button block onClick={submit} loading={place.isPending} aria-disabled={blocked} className={clsx('h-11 text-[15px]', blocked && 'opacity-45')}>
            {t('cart.place')}
          </Button>
          <p className="text-center text-xs text-muted">{t('cart.payNote')}</p>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={clsx('flex justify-between gap-4', muted && 'text-muted')}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
