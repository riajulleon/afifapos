import clsx from 'clsx';
import { CalendarDays, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminProducts, useAllDeals, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { ProductIcon } from '../../components/ProductIcon';
import { Button, Card, EmptyState, ErrorNote, EuroInput, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import { eur, parseEuro } from '../../domain/money';
import { isDealLive } from '../../domain/pricing';
import { addDays, dealWindow, romeDateKey } from '../../domain/romeTime';
import type { Deal } from '../../domain/types';
import { discountPct, useDocumentTitle, useLang } from '../../lib/hooks';
import { useNow } from '../../lib/useNow';
import { toast } from '../../store/toasts';
import { SaleBannerCard } from './SaleBannerCard';

interface Draft { id: string; productId: string; price: string; limit: string; cap: string; featured: boolean; sort: number }

/** Schedule daily deals (DEAL-01…04). Live 08:00–23:59:59 Rome time on their date. */
export function DealsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('sale.nav'));
  const now = useNow(30_000);
  const today = romeDateKey(now);
  const [date, setDate] = useState(addDays(today, 1));
  const deals = useAllDeals();
  const products = useAdminProducts();
  const save = useApi(api.saveDeal);
  const cancel = useApi(api.cancelDeal);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (deals.isLoading || products.isLoading) return <Skeleton className="h-96" />;
  const pById = new Map(products.data!.map((p) => [p.id, p]));
  const dayDeals = deals.data!.filter((d) => d.date === date && !d.cancelled).sort((a, b) => a.sort - b.sort);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const past = date < today;
  const window = dealWindow(date);
  const dayState = now >= window.end ? 'ended' : now >= window.start ? 'live' : 'scheduled';

  const open = (d?: Deal) =>
    setDraft(d
      ? { id: d.id, productId: d.productId, price: (d.priceCents / 100).toFixed(2), limit: String(d.perResellerLimit), cap: d.stockCap === null ? '' : String(d.stockCap), featured: d.featured, sort: d.sort }
      : { id: '', productId: '', price: '', limit: '20', cap: '', featured: dayDeals.length === 0, sort: dayDeals.length });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const priceCents = parseEuro(draft.price);
    const limit = parseInt(draft.limit, 10);
    const cap = draft.cap.trim() ? parseInt(draft.cap, 10) : null;
    if (!draft.productId || priceCents === null || !(limit >= 1) || (cap !== null && !(cap >= 1))) return;
    const existing = deals.data!.find((d) => d.id === draft.id);
    await save.mutateAsync([{ id: draft.id, productId: draft.productId, date, priceCents, perResellerLimit: limit, stockCap: cap, sold: existing?.sold ?? 0, featured: draft.featured, sort: draft.sort, cancelled: false }]);
    setDraft(null);
    toast({ title: t('admin.deal.saved'), tone: 'ok' });
  };

  const dp = draft ? pById.get(draft.productId) : undefined;
  const dPrice = draft ? parseEuro(draft.price) : null;

  return (
    <div className="grid gap-5">
      <PageHeader title={t('sale.nav')} sub={t('admin.deal.sub')} actions={!past && <Button onClick={() => open()}><Plus className="size-4" /> {t('admin.deal.add')}</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        {days.map((d) => (
          <button key={d} type="button" onClick={() => { setDate(d); setDraft(null); }} aria-pressed={d === date} className={clsx('grid h-14 min-w-16 justify-items-center rounded-xl border px-3 py-1.5 text-xs transition-colors', d === date ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface hover:bg-surface-2')}>
            <span className="uppercase tracking-wide opacity-70">{new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'short' }).format(new Date(`${d}T12:00:00Z`))}</span>
            <b className="num text-base font-bold">{d.slice(8)}</b>
          </button>
        ))}
        <label className="ml-1 flex items-center gap-2 text-sm text-muted"><CalendarDays className="size-4" /><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!h-9 w-40" aria-label={t('admin.deal.date')} /></label>
      </div>
      <p className="flex items-center gap-2 text-sm">
        <Pill tone={dayState === 'live' ? 'ok' : dayState === 'ended' ? 'muted' : 'info'}>{t(`admin.deal.state.${dayState}`)}</Pill>
        <span className="text-muted">{t('admin.deal.window')}</span>
      </p>

      {(save.error || cancel.error) && <ErrorNote><ApiErrorMessage error={save.error ?? cancel.error} /></ErrorNote>}

      {draft && (
        <Card className="p-5">
          <form onSubmit={submit} className="grid gap-4">
            <h2 className="font-medium">{draft.id ? t('admin.deal.edit') : t('admin.deal.add')}</h2>
            <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
              <Field label={t('order.item')} htmlFor="d-p">
                <Select id="d-p" value={draft.productId} onChange={(e) => setDraft({ ...draft, productId: e.target.value })} disabled={!!draft.id}>
                  <option value="">{t('apply.choose')}</option>
                  {products.data!.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name[lang]} · {eur(p.tiers[0], lang)}</option>)}
                </Select>
              </Field>
              <Field label={t('admin.deal.price')} htmlFor="d-price" error={dp && dPrice !== null && dPrice >= dp.tiers[0] ? t('errors.deal_price_high') : undefined} hint={dp && dPrice ? t('admin.deal.pctOff', { pct: discountPct(dp.tiers[0], dPrice) }) : undefined}>
                <EuroInput id="d-price" value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} />
              </Field>
              <Field label={t('admin.deal.limit')} htmlFor="d-limit"><Input id="d-limit" inputMode="numeric" value={draft.limit} onChange={(e) => setDraft({ ...draft, limit: e.target.value.replace(/\D/g, '') })} className="!h-9" /></Field>
              <Field label={t('admin.deal.cap')} htmlFor="d-cap" hint={t('admin.deal.capHint')}><Input id="d-cap" inputMode="numeric" value={draft.cap} onChange={(e) => setDraft({ ...draft, cap: e.target.value.replace(/\D/g, '') })} className="!h-9" /></Field>
            </div>
            {dp && dPrice !== null && dPrice < dp.tiers[0] && dPrice < dp.tiers[dp.tiers.length - 1] && <p className="text-[13px] text-warn">{t('admin.deal.belowTier3', { price: eur(dp.tiers[dp.tiers.length - 1], lang) })}</p>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {t('admin.deal.featured')}</label>
            <div className="flex gap-2"><Button type="submit" loading={save.isPending}>{t('common.save')}</Button><Button type="button" variant="quiet" onClick={() => setDraft(null)}>{t('common.cancel')}</Button></div>
          </form>
        </Card>
      )}

      {dayDeals.length === 0 ? (
        <EmptyState icon={<Zap className="size-5" />} title={t('admin.deal.none')} body={past ? undefined : t('admin.deal.noneBody')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">{t('order.item')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('admin.deal.price')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('admin.deal.limit')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('admin.deal.sold')}</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {dayDeals.map((d) => {
                const p = pById.get(d.productId);
                if (!p) return null;
                return (
                  <tr key={d.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-lg bg-surface-2"><ProductIcon name={p.icon} className="size-5" /></span>
                        <span><b className="font-medium">{p.name[lang]}</b> {d.featured && <Pill tone="info" className="ml-1">{t('sale.dotd')}</Pill>} {isDealLive(d, now) && <Pill tone="ok" className="ml-1">{t('admin.deal.state.live')}</Pill>}<br /><span className="text-muted">{p.pack[lang]}</span></span>
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 text-right"><b className="font-medium">{eur(d.priceCents, lang)}</b> <s className="text-muted">{eur(p.tiers[0], lang)}</s> <span className="text-muted">−{discountPct(p.tiers[0], d.priceCents)}%</span></td>
                    <td className="num px-4 py-2.5 text-right">{d.perResellerLimit}</td>
                    <td className="num px-4 py-2.5 text-right">{d.sold}{d.stockCap !== null ? ` / ${d.stockCap}` : ''}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!past && (
                        <span className="inline-flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => open(d)}>{t('common.edit')}</Button>
                          <Button size="sm" variant="danger" onClick={() => cancel.mutate([d.id])}>{t('admin.deal.cancel')}</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SaleBannerCard />
    </div>
  );
}
