import clsx from 'clsx';
import { Banknote, CheckCircle2, CreditCard, Percent, Printer, Receipt, ScanLine, Search, ShoppingBag, Store, Trash2, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, useApi, useDeals, usePosCatalog, usePublicSettings } from '../../api/queries';
import type { PosSaleInput } from '../../api/mockServer';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { QtyStepper } from '../../components/controls';
import { PaymentIcon } from '../../components/PaymentIcon';
import { ProductImage } from '../../components/productBits';
import { useCategoryList } from '../../components/ProductIcon';
import { Button, ErrorNote, Input, OffBadge, Skeleton } from '../../components/ui';
import { eur, parseEuro } from '../../domain/money';
import { discountAmount, isDealLive, orderTotals, unitPrice } from '../../domain/pricing';
import type { Order, PaymentKind, Product } from '../../domain/types';
import { useBands, useDocumentTitle, useLang } from '../../lib/hooks';
import { compact, norm } from '../../lib/text';

type PayKind = PaymentKind | 'later';
const PAY_KINDS: PayKind[] = ['cash', 'card', 'bank', 'paypal', 'bkash', 'later'];

interface Draft {
  lines: { productId: string; qty: number }[];
  customer: { kind: 'walkin'; name: string } | { kind: 'reseller'; userId: string };
  discount: { kind: 'percent' | 'fixed'; value: string; reason: string };
  pay: PayKind;
  tendered: string;
  reference: string;
  handedOver: boolean;
}

const EMPTY: Draft = { lines: [], customer: { kind: 'walkin', name: '' }, discount: { kind: 'percent', value: '', reason: '' }, pay: 'cash', tendered: '', reference: '', handedOver: true };
const KEY = 'afifa-pos-draft';

/** The sale in progress survives a reload (sessionStorage only: it never outlives the browser tab). */
function useDraft() {
  const [d, setD] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? { ...EMPTY, ...(JSON.parse(raw) as Draft) } : EMPTY;
    } catch {
      return EMPTY;
    }
  });
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ }
  }, [d]);
  return [d, setD] as const;
}

export function PosPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('pos.title'));
  const cat = usePosCatalog();
  const deals = useDeals();
  const vatRates = usePublicSettings().data?.vatRates ?? [];
  const { bands } = useBands();
  const cats = useCategoryList();
  const checkout = useApi(api.posCheckout);
  const [d, setD] = useDraft();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [done, setDone] = useState<Order | null>(null);
  const [custQ, setCustQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const saleRef = useRef<HTMLElement>(null);

  const products = cat.data?.products ?? [];
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const now = new Date();
  const liveDeal = (pid: string) => (deals.data ?? []).find((x) => x.productId === pid && isDealLive(x, now));

  const customers = cat.data?.customers ?? [];
  const buyer = d.customer.kind === 'reseller' ? customers.find((c) => c.id === (d.customer as { userId: string }).userId) : undefined;

  // Prices as the server will set them: live deal price, else the quantity band (no minimum at the counter).
  const lines = d.lines.flatMap((l) => {
    const p = byId.get(l.productId);
    if (!p) return [];
    const price = unitPrice(p, l.qty, liveDeal(p.id), bands);
    const vatPercent = vatRates.find((v) => v.id === p.vatRateId)?.percent ?? 22;
    return [{ p, qty: l.qty, unit: price.unitCents, deal: price.source.startsWith('deal:'), vatPercent, total: price.unitCents * l.qty }];
  });
  const goods = lines.reduce((a, l) => a + l.total, 0);
  const dValue = d.discount.kind === 'percent' ? Number(d.discount.value.replace(',', '.')) || 0 : parseEuro(d.discount.value) ?? 0;
  const discountCents = discountAmount(d.discount.kind, dValue, goods);
  const delivery = !d.handedOver && buyer ? buyer.deliveryCents : 0;
  const totals = orderTotals(lines.map((l) => ({ netCents: l.total, vatPercent: l.vatPercent })), delivery, discountCents);
  const overLimit = goods > 0 && discountCents > Math.round((goods * (cat.data?.maxDiscountPct ?? 0)) / 100) && !cat.data?.canOverride;
  const tendered = parseEuro(d.tendered) ?? 0;
  const change = tendered - totals.totalCents;

  const filtered = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q.trim()) return true;
    const s = norm(q.trim());
    return norm(p.name.en).includes(s) || norm(p.name.it).includes(s) || compact(p.sku).includes(compact(q)) || p.ean.includes(q.trim());
  });

  const add = (p: Product, qty = 1) => {
    if (p.stock <= 0) return;
    setD((x) => {
      const cur = x.lines.find((l) => l.productId === p.id);
      const next = cur ? x.lines.map((l) => (l.productId === p.id ? { ...l, qty: Math.min(p.stock, l.qty + qty) } : l)) : [...x.lines, { productId: p.id, qty: Math.min(p.stock, qty) }];
      return { ...x, lines: next };
    });
  };
  const setQty = (id: string, qty: number) => setD((x) => ({ ...x, lines: x.lines.map((l) => (l.productId === id ? { ...l, qty } : l)) }));
  const remove = (id: string) => setD((x) => ({ ...x, lines: x.lines.filter((l) => l.productId !== id) }));

  /** Scanner or Enter: an exact EAN/SKU (or a single match) goes straight into the cart. */
  const onScan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    if (!v) return;
    const exact = products.find((p) => p.ean === v || compact(p.sku) === compact(v));
    const hit = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (hit) {
      add(hit);
      setQ('');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isWalkIn = d.customer.kind === 'walkin';
  const needsRef = d.pay !== 'cash' && d.pay !== 'later';
  const canCharge = lines.length > 0 && !overLimit && (discountCents === 0 || d.discount.reason.trim()) && (d.pay !== 'cash' || change >= 0) && (!needsRef || d.reference.trim()) && (d.customer.kind === 'walkin' || !!buyer) && !(isWalkIn && d.pay === 'later');

  const charge = async () => {
    const input: PosSaleInput = {
      customer: d.customer,
      items: d.lines,
      discount: discountCents > 0 ? { kind: d.discount.kind, value: d.discount.kind === 'percent' ? dValue : Math.round(dValue), reason: d.discount.reason } : null,
      payment: { kind: d.pay, tenderedCents: d.pay === 'cash' ? tendered : undefined, reference: d.reference },
      handedOver: isWalkIn ? true : d.handedOver,
    };
    const order = await checkout.mutateAsync([input]);
    setDone(order);
    setD(EMPTY);
    setQ('');
  };

  if (cat.isLoading) return <div className="grid gap-4 lg:grid-cols-[1fr_400px]"><Skeleton className="h-[70vh]" /><Skeleton className="h-[70vh]" /></div>;
  if (cat.error) return <ErrorNote><ApiErrorMessage error={cat.error} /></ErrorNote>;

  return (
    <div className="grid gap-4 pb-20 lg:grid-cols-[minmax(0,1fr)_410px] lg:items-start lg:pb-0">
      {/* Products */}
      <section className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-tight"><Store className="size-5" /> {t('pos.title')}</h1>
          <span className="text-[13px] text-muted">{t('pos.shortcut')}</span>
        </div>
        <form onSubmit={onScan} className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input ref={search} name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pos.search')} className="h-11 pl-9" autoFocus autoComplete="off" aria-label={t('pos.search')} />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={!category} onClick={() => setCategory(null)}>{t('catalog.all')}</Chip>
          {cats.active.map((c) => <Chip key={c.id} on={category === c.id} onClick={() => setCategory(c.id === category ? null : c.id)}>{cats.name(c.id)}</Chip>)}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const deal = liveDeal(p.id);
            const inCart = d.lines.find((l) => l.productId === p.id)?.qty ?? 0;
            return (
              <button key={p.id} type="button" disabled={p.stock <= 0} onClick={() => add(p)}
                className={clsx('relative grid gap-1.5 rounded-xl border bg-surface p-3 text-left shadow-1 transition-[border-color,transform] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50', inCart ? 'border-fg' : 'border-line hover:border-line-strong')}>
                {inCart > 0 && <span className="num absolute right-2 top-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-inv-bg px-1.5 text-xs font-bold text-inv-fg">{inCart}</span>}
                <ProductImage product={p} className="h-16 rounded-lg" iconClass="size-8" />
                <b className="line-clamp-2 text-[13px] font-medium leading-snug">{p.name[lang]}</b>
                <span className="text-[11.5px] text-muted">{p.pack[lang]}</span>
                <span className={clsx('num text-[11.5px]', p.stock < 20 ? 'text-warn' : 'text-muted')}>{p.stock <= 0 ? t('pos.outOfStock') : t('pos.stock', { n: p.stock })}</span>
                <span className="flex items-center justify-between gap-1">
                  <span className="num text-sm font-bold">{eur(deal ? deal.priceCents : p.tiers[0], lang)}</span>
                  {deal && <OffBadge className="text-[10px]">{t('sale.tag')}</OffBadge>}
                </span>
              </button>
            );
          })}
          {!filtered.length && <p className="col-span-full py-10 text-center text-sm text-muted">{t('pos.noMatch')}</p>}
        </div>
      </section>

      {/* Sale */}
      <aside ref={saleRef} className="grid scroll-mt-20 gap-3 rounded-xl border border-line bg-surface p-4 shadow-2 lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-88px)] lg:overflow-y-auto" aria-label={t('pos.sale')}>
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label={t('pos.customer')}>
            {(['walkin', 'reseller'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={d.customer.kind === k} onClick={() => setD((x) => ({ ...x, customer: k === 'walkin' ? { kind: 'walkin', name: '' } : { kind: 'reseller', userId: '' }, pay: k === 'walkin' && x.pay === 'later' ? 'cash' : x.pay, handedOver: true }))}
                className={clsx('flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] transition-colors', d.customer.kind === k ? 'bg-surface font-medium shadow-1' : 'text-muted hover:text-fg')}>
                {k === 'walkin' ? <UserRound className="size-4" /> : <Store className="size-4" />} {t(`pos.${k}`)}
              </button>
            ))}
          </div>
          {d.customer.kind === 'walkin' ? (
            <Input value={d.customer.name} onChange={(e) => setD((x) => ({ ...x, customer: { kind: 'walkin', name: e.target.value } }))} placeholder={t('pos.walkinName')} className="!h-9 text-sm" aria-label={t('pos.walkinName')} />
          ) : buyer ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
              <span className="min-w-0"><b className="block truncate font-medium">{buyer.businessName}</b><span className="text-muted">{buyer.fullName} · {buyer.cityName}</span></span>
              <Button size="sm" variant="quiet" onClick={() => setD((x) => ({ ...x, customer: { kind: 'reseller', userId: '' } }))} aria-label={t('pos.changeCustomer')}><X className="size-4" /></Button>
            </div>
          ) : (
            <div className="grid gap-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder={t('pos.findReseller')} className="!h-9 pl-9 text-sm" aria-label={t('pos.findReseller')} />
              </div>
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-line">
                {customers.filter((c) => !custQ || norm(`${c.businessName} ${c.fullName} ${c.cityName}`).includes(norm(custQ))).map((c) => (
                  <li key={c.id}><button type="button" onClick={() => { setD((x) => ({ ...x, customer: { kind: 'reseller', userId: c.id } })); setCustQ(''); }} className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-2"><b className="font-medium">{c.businessName}</b> <span className="text-muted">· {c.cityName}</span></button></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid gap-2 border-t border-line pt-3">
          {lines.length === 0 && <p className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted"><ShoppingBag className="size-6" />{t('pos.empty')}</p>}
          <AnimatePresence initial={false}>
            {lines.map((l) => (
              <motion.div key={l.p.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
                <span className="min-w-0 text-[13px]"><b className="block truncate font-medium">{l.p.name[lang]}</b><span className="num text-muted">{eur(l.unit, lang)} {l.deal && <OffBadge className="ml-1 text-[9px]">{t('sale.tag')}</OffBadge>}</span></span>
                <b className="num text-right text-sm">{eur(l.total, lang)}</b>
                <QtyStepper value={l.qty} onChange={(v) => setQty(l.p.id, v)} max={l.p.stock} label={t('pos.qtyOf', { name: l.p.name[lang] })} />
                <Button size="sm" variant="quiet" onClick={() => remove(l.p.id)} aria-label={t('common.remove')} className="justify-self-end"><Trash2 className="size-4" /></Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {lines.length > 0 && (
          <>
            <fieldset className="grid gap-2 border-t border-line pt-3">
              <legend className="sr-only">{t('pos.discount')}</legend>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-medium"><Percent className="size-4" /> {t('pos.discount')}</span>
                <div className="ml-auto flex rounded-md border border-line-strong p-0.5 text-[12px]">
                  {(['percent', 'fixed'] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={d.discount.kind === k} onClick={() => setD((x) => ({ ...x, discount: { ...x.discount, kind: k, value: '' } }))} className={clsx('h-6 rounded px-2', d.discount.kind === k ? 'bg-inv-bg text-inv-fg' : 'text-muted')}>
                      {k === 'percent' ? '%' : '€'}
                    </button>
                  ))}
                </div>
                <Input inputMode="decimal" value={d.discount.value} onChange={(e) => setD((x) => ({ ...x, discount: { ...x.discount, value: e.target.value } }))} className="!h-8 !w-20 text-right text-sm" placeholder="0" aria-label={t('pos.discountValue')} />
              </div>
              {discountCents > 0 && <Input value={d.discount.reason} onChange={(e) => setD((x) => ({ ...x, discount: { ...x.discount, reason: e.target.value } }))} placeholder={t('pos.discountReason')} className="!h-8 text-[13px]" aria-label={t('pos.discountReason')} maxLength={120} />}
              {overLimit && <p className="text-[12.5px] text-bad">{t('pos.overLimit', { max: cat.data!.maxDiscountPct })}</p>}
            </fieldset>

            {!isWalkIn && buyer && (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={!d.handedOver} onChange={(e) => setD((x) => ({ ...x, handedOver: !e.target.checked }))} className="size-4 accent-[var(--primary)]" />
                {t('pos.deliver', { fee: eur(buyer.deliveryCents, lang) })}
              </label>
            )}

            <dl className="grid gap-1 border-t border-line pt-3 text-[13px]">
              <Row k={t('pos.items')} v={eur(goods, lang)} />
              {discountCents > 0 && <Row k={t('pos.discount')} v={`− ${eur(discountCents, lang)}`} />}
              {delivery > 0 && <Row k={t('pos.delivery')} v={eur(delivery, lang)} />}
              {totals.vat.map((r) => <Row key={r.percent} k={t('cart.vatRow', { p: r.percent, base: eur(r.baseCents, lang) })} v={eur(r.vatCents, lang)} muted />)}
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2"><dt className="font-bold">{t('cart.total')}</dt><dd className="num text-[26px] font-bold tracking-tight">{eur(totals.totalCents, lang)}</dd></div>
            </dl>

            <div className="grid gap-2 border-t border-line pt-3">
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('pos.payWith')}>
                {PAY_KINDS.filter((k) => k !== 'later' || !isWalkIn).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={d.pay === k} onClick={() => setD((x) => ({ ...x, pay: k, reference: '' }))}
                    className={clsx('flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] transition-colors', d.pay === k ? 'border-fg bg-inv-bg font-medium text-inv-fg' : 'border-line-strong hover:bg-surface-2')}>
                    {k === 'later' ? <Receipt className="size-4" /> : k === 'cash' ? <Banknote className="size-4" /> : k === 'card' ? <CreditCard className="size-4" /> : <PaymentIcon kind={k} className="size-4" />}
                    {k === 'later' ? t('pos.later') : t(`admin.pay.kind.${k}`)}
                  </button>
                ))}
              </div>
              {d.pay === 'cash' && (
                <div className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <label htmlFor="pos-tendered" className="text-[13px] text-muted">{t('pos.tendered')}</label>
                    <Input id="pos-tendered" inputMode="decimal" value={d.tendered} onChange={(e) => setD((x) => ({ ...x, tendered: e.target.value }))} className="!h-9 ml-auto !w-32 text-right" placeholder="0,00" />
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {[...new Set([totals.totalCents, Math.ceil(totals.totalCents / 500) * 500, Math.ceil(totals.totalCents / 1000) * 1000, Math.ceil(totals.totalCents / 5000) * 5000])].map((c) => (
                      <button key={c} type="button" onClick={() => setD((x) => ({ ...x, tendered: (c / 100).toFixed(2) }))} className="num h-7 rounded-md border border-line-strong px-2 text-[12px] hover:bg-surface-2">{eur(c, lang)}</button>
                    ))}
                  </div>
                  {d.tendered && <p className={clsx('flex justify-between text-sm font-medium', change < 0 ? 'text-bad' : 'text-ok')}><span>{change < 0 ? t('pos.short') : t('pos.change')}</span><span className="num">{eur(Math.abs(change), lang)}</span></p>}
                </div>
              )}
              {needsRef && <Input value={d.reference} onChange={(e) => setD((x) => ({ ...x, reference: e.target.value }))} placeholder={d.pay === 'card' ? t('pos.cardRef') : t('admin.pay.reference')} className="!h-9 text-sm" aria-label={t('admin.pay.reference')} />}
              {d.pay === 'later' && <p className="text-[12.5px] text-muted">{t('pos.laterNote')}</p>}
            </div>

            {checkout.error && <ErrorNote><ApiErrorMessage error={checkout.error} /></ErrorNote>}
            <Button className="h-12 text-base" disabled={!canCharge} loading={checkout.isPending} onClick={charge}>
              {d.pay === 'later' ? t('pos.placeOnAccount', { total: eur(totals.totalCents, lang) }) : t('pos.charge', { total: eur(totals.totalCents, lang) })}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setD(EMPTY)}>{t('pos.clear')}</Button>
          </>
        )}
      </aside>

      {/* Phones: the sale panel sits below the products, so keep the running total in reach. */}
      {lines.length > 0 && (
        <button type="button" onClick={() => saleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed inset-x-4 bottom-4 z-30 flex h-12 items-center justify-between rounded-xl bg-primary px-4 font-medium text-primary-ink shadow-3 lg:hidden">
          <span>{t('pos.mobileBar', { count: lines.reduce((a, l) => a + l.qty, 0) })}</span>
          <span className="num">{eur(totals.totalCents, lang)}</span>
        </button>
      )}

      <AnimatePresence>
        {done && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={t('pos.done')}>
            <motion.div initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} className="grid w-full max-w-sm justify-items-center gap-3 rounded-2xl bg-surface p-6 text-center shadow-3">
              <CheckCircle2 className="size-12 text-ok" />
              <h2 className="text-xl font-bold">{t('pos.done')}</h2>
              <p className="num text-muted">{done.number} · {eur(done.totalCents, lang)}</p>
              {done.tenderedCents !== undefined && done.tenderedCents > done.totalCents && (
                <p className="rounded-lg bg-ok-soft px-4 py-2 text-lg font-bold text-ok">{t('pos.changeDue', { v: eur(done.tenderedCents - done.totalCents, lang) })}</p>
              )}
              <div className="grid w-full gap-2">
                <Link to={`/admin/pos/receipt/${done.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-ink hover:bg-primary-hover"><Printer className="size-4" /> {t('pos.printReceipt')}</Link>
                <Link to={`/admin/orders/${done.id}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong font-medium hover:bg-surface-2">{t('pos.viewOrder')}</Link>
                <Button variant="quiet" onClick={() => { setDone(null); search.current?.focus(); }} autoFocus>{t('pos.newSale')}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={clsx('h-8 rounded-full border px-3 text-[13px] transition-colors', on ? 'border-fg bg-inv-bg text-inv-fg' : 'border-line-strong hover:bg-surface-2')}>{children}</button>;
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return <div className={clsx('flex justify-between', muted && 'text-muted')}><dt>{k}</dt><dd className="num">{v}</dd></div>;
}
