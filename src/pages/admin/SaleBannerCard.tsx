import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminSettings, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { SaleBackdropView } from '../../components/SaleBackdrop';
import { Button, Card, ErrorNote } from '../../components/ui';
import type { SaleBanner } from '../../domain/types';
import { resizeImage } from '../../lib/image';
import { toast } from '../../store/toasts';

/** Admin › Today's Sale: background photo for the sale banner, with a live preview and a strength slider. */
function Editor({ saved }: { saved: SaleBanner }) {
  const { t } = useTranslation();
  const save = useApi(api.updateSettings);
  const [b, setB] = useState<SaleBanner>(saved);
  const [err, setErr] = useState<string | null>(null);
  const dirty = b.image !== saved.image || b.strength !== saved.strength;

  return (
    <Card className="grid gap-4 p-5">
      <div className="grid gap-1">
        <h2 className="font-medium">{t('banner.title')}</h2>
        <p className="text-[13px] text-muted">{t('banner.sub')}</p>
      </div>

      {/* Live preview, same component the shop uses. */}
      <div className="inv relative isolate grid min-h-44 content-center gap-2 overflow-hidden rounded-xl p-6">
        <SaleBackdropView banner={b} />
        <span className="text-[11px] font-medium uppercase tracking-[.1em] text-muted">{t('banner.previewDay')}</span>
        <b className="text-[30px] font-bold leading-tight tracking-tight">{t('sale.nav')}</b>
        <span className="max-w-[40ch] text-sm text-muted">{t('sale.startsAt')}</span>
        {!b.image && <span className="text-xs text-muted">{t('banner.none')}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
          <ImagePlus className="size-4" /> {b.image ? t('banner.replace') : t('banner.upload')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setErr(t('admin.product.photoType'));
              if (file.size > 15 * 1024 * 1024) return setErr(t('admin.product.photoSize'));
              try {
                setB({ ...b, image: await resizeImage(file, 1800, 0.82) });
                setErr(null);
              } catch {
                setErr(t('admin.product.photoType'));
              }
            }}
          />
        </label>
        {b.image && <Button variant="quiet" onClick={() => setB({ ...b, image: null })}><Trash2 className="size-4" /> {t('common.remove')}</Button>}
        <label className="ml-auto flex min-w-60 items-center gap-3 text-sm" htmlFor="banner-strength">
          <span className="text-muted">{t('banner.strength')}</span>
          <input id="banner-strength" type="range" min={15} max={90} step={5} value={Math.round(b.strength * 100)} onChange={(e) => setB({ ...b, strength: Number(e.target.value) / 100 })} disabled={!b.image} className="flex-1 accent-[var(--primary)]" />
          <span className="num w-10 text-right">{Math.round(b.strength * 100)}%</span>
        </label>
      </div>
      <p className={err ? 'text-[12.5px] text-bad' : 'text-[12.5px] text-muted'}>{err ?? t('banner.hint')}</p>

      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div className="flex gap-2">
        <Button
          disabled={!dirty}
          loading={save.isPending}
          onClick={async () => {
            await save.mutateAsync([{ saleBanner: b }, b.image ? `Sale banner image ${saved.image ? 'replaced' : 'added'} (strength ${Math.round(b.strength * 100)}%)` : 'Sale banner image removed']);
            toast({ title: t('banner.saved'), tone: 'ok' });
          }}
        >
          {t('common.save')}
        </Button>
        {dirty && <Button variant="quiet" onClick={() => setB(saved)}>{t('common.cancel')}</Button>}
      </div>
    </Card>
  );
}

export function SaleBannerCard() {
  const settings = useAdminSettings();
  if (!settings.data) return null;
  const saved = settings.data.saleBanner;
  return <Editor key={`${saved.image?.length ?? 0}-${saved.strength}`} saved={saved} />;
}
