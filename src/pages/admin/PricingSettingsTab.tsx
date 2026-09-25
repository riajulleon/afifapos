import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminProducts, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, Card, ErrorNote, Field, Input } from '../../components/ui';
import { eur } from '../../domain/money';
import { bandLabels, bandPrice, fitTiers, validateBands } from '../../domain/pricing';
import type { Settings } from '../../domain/types';
import { useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';

/**
 * Settings › Pricing: the minimum cases per product line and the quantity bands every product is priced in,
 * e.g. 3–20, 21–40, 41+. Each product then has one price per band (Products › edit).
 */
export function PricingSettingsTab({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const lang = useLang();
  const products = useAdminProducts();
  const save = useApi(api.updateSettings);
  const [starts, setStarts] = useState<string[]>(s.pricing.starts.map(String));
  const nums = starts.map((v) => (/^\d+$/.test(v) ? Number(v) : NaN));
  const bands = { starts: nums };
  const error = nums.some(Number.isNaN) ? 'bands_invalid' : validateBands(bands);
  const labels = error ? [] : bandLabels(bands);
  const countChanged = starts.length !== s.pricing.starts.length;
  const sample = products.data?.find((p) => p.active);

  const setAt = (i: number, v: string) => setStarts(starts.map((x, j) => (j === i ? v.replace(/\D/g, '') : x)));

  const submit = async () => {
    if (error) return;
    const before = bandLabels(s.pricing).join(', ');
    await save.mutateAsync([{ pricing: { starts: nums } }, `Quantity bands ${before} → ${labels.join(', ')} (minimum ${nums[0]} per line)`]);
    toast({ title: t('admin.settings.saved'), body: t('pricing.savedBody'), tone: 'ok' });
  };

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5">
        <div className="grid gap-1">
          <h2 className="font-medium">{t('pricing.title')}</h2>
          <p className="text-[13px] text-muted">{t('pricing.intro')}</p>
        </div>

        <div className="grid gap-2">
          {starts.map((v, i) => {
            const next = nums[i + 1];
            const to = i === starts.length - 1 ? t('pricing.andUp') : Number.isNaN(next) ? '…' : String(next - 1);
            return (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-canvas p-3">
                <span className="w-20 pb-2 text-sm font-medium">{t('pricing.band', { n: i + 1 })}</span>
                <Field label={i === 0 ? t('pricing.minimum') : t('pricing.from')} htmlFor={`band-${i}`}>
                  <Input id={`band-${i}`} inputMode="numeric" value={v} onChange={(e) => setAt(i, e.target.value)} className="!h-9 w-24" invalid={Number.isNaN(nums[i]) || (i > 0 && nums[i] <= nums[i - 1])} />
                </Field>
                <span className="pb-2 text-sm text-muted">{t('pricing.to')} <b className="num font-medium text-fg">{to}</b> {t('pricing.cases')}</span>
                {i === 0 && <span className="pb-2 text-xs text-muted">{t('pricing.minHint')}</span>}
                {i > 0 && i === starts.length - 1 && starts.length > 2 && (
                  <Button size="sm" variant="quiet" className="ml-auto" onClick={() => setStarts(starts.slice(0, -1))}><Trash2 className="size-4" /> {t('common.remove')}</Button>
                )}
              </div>
            );
          })}
        </div>

        {starts.length < 6 && (
          <Button variant="ghost" className="justify-self-start" onClick={() => setStarts([...starts, String((nums[nums.length - 1] || 0) + 20)])}><Plus className="size-4" /> {t('pricing.addBand')}</Button>
        )}
        {error && <p className="text-[13px] text-bad">{t(`errors.${error}`)}</p>}
      </Card>

      {!error && (
        <Card className="grid gap-3 p-5">
          <h2 className="font-medium">{t('pricing.preview')}</h2>
          <p className="text-[13px] text-muted">{t('pricing.previewSub')}</p>
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => <span key={l} className="num rounded-full border border-line-strong px-3 py-1 text-sm">{l} {t('pricing.cases')}</span>)}
          </div>
          {sample && (
            <div className="grid gap-1.5">
              <span className="text-[13px] text-muted">{sample.name[lang]}</span>
              <div className="grid overflow-hidden rounded-lg border border-line text-center text-[12px]" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
                {labels.map((r, i) => (
                  <div key={r} className="grid border-line py-2 [&:not(:last-child)]:border-r">
                    <span className="text-muted">{r}</span>
                    <b className="num font-medium">{eur(bandPrice({ tiers: fitTiers(sample.tiers, labels.length) }, i), lang)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
          {countChanged && <p className="text-[13px] text-warn">{starts.length > s.pricing.starts.length ? t('pricing.moreBands') : t('pricing.fewerBands')}</p>}
        </Card>
      )}

      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div><Button onClick={submit} disabled={!!error} loading={save.isPending}>{t('common.save')}</Button></div>
    </div>
  );
}
