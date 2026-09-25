import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminProducts, useAdminSettings, useApi } from '../../api/queries';
import { ProductIcon } from '../../components/ProductIcon';
import { Button, PageHeader, Select, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';

/** Products with their VAT rate (VAT-02): edit per row or bulk-set for a selection. */
export function ProductsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.products'));
  const products = useAdminProducts();
  const settings = useAdminSettings();
  const update = useApi(api.updateProduct);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRate, setBulkRate] = useState('');
  if (products.isLoading || settings.isLoading) return <Skeleton className="h-96" />;
  const rates = settings.data!.vatRates;
  const rateLabel = (id: string) => rates.find((r) => r.id === id)?.percent ?? '?';

  const setRate = async (id: string, vatRateId: string) => {
    const p = products.data!.find((x) => x.id === id)!;
    await update.mutateAsync([id, { vatRateId }, `VAT for ${p.name.en}: ${rateLabel(p.vatRateId)}% → ${rateLabel(vatRateId)}%`]);
  };

  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.products')} sub={t('admin.productsSub')} />
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-1">
          <span className="text-sm">{t('admin.selected', { count: selected.size })}</span>
          <Select value={bulkRate} onChange={(e) => setBulkRate(e.target.value)} className="!h-9 w-44" aria-label={t('admin.vatRate')}>
            <option value="">{t('admin.chooseRate')}</option>
            {rates.map((r) => <option key={r.id} value={r.id}>{r.label[lang]}</option>)}
          </Select>
          <Button
            size="sm"
            disabled={!bulkRate}
            loading={update.isPending}
            onClick={async () => {
              for (const id of selected) await setRate(id, bulkRate);
              toast({ title: t('admin.bulkDone', { count: selected.size }), tone: 'ok' });
              setSelected(new Set());
            }}
          >
            {t('admin.applyRate')}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label={t('admin.selectAll')} checked={selected.size === products.data!.length} onChange={(e) => setSelected(e.target.checked ? new Set(products.data!.map((p) => p.id)) : new Set())} className="accent-[var(--primary)]" /></th>
              <th className="px-2 py-2.5 font-medium">{t('order.item')}</th>
              <th className="px-4 py-2.5 text-right font-medium">1–9</th>
              <th className="px-4 py-2.5 text-right font-medium">10–49</th>
              <th className="px-4 py-2.5 text-right font-medium">50+</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('admin.stock')}</th>
              <th className="px-4 py-2.5 font-medium">{t('admin.vatRate')}</th>
            </tr>
          </thead>
          <tbody>
            {products.data!.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-2"><input type="checkbox" aria-label={p.name[lang]} checked={selected.has(p.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(p.id); else s.delete(p.id); setSelected(s); }} className="accent-[var(--primary)]" /></td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-surface-2"><ProductIcon name={p.icon} className="size-5" /></span>
                    <span><b className="font-medium">{p.name[lang]}</b><br /><span className="text-muted">{p.sku} · {p.pack[lang]}</span></span>
                  </span>
                </td>
                {p.tiers.map((c, i) => <td key={i} className="num px-4 py-2 text-right">{eur(c, lang)}</td>)}
                <td className={`num px-4 py-2 text-right ${p.stock <= 20 ? 'text-warn' : ''}`}>{p.stock}</td>
                <td className="px-4 py-2">
                  <Select value={p.vatRateId} onChange={(e) => void setRate(p.id, e.target.value)} className="!h-8 w-40 text-[13px]" aria-label={`${t('admin.vatRate')} ${p.name[lang]}`}>
                    {rates.map((r) => <option key={r.id} value={r.id}>{r.label[lang]}</option>)}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-muted">{t('admin.vatNote')}</p>
    </div>
  );
}
