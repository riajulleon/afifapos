import { ArrowLeft, ExternalLink, ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, useAdminProducts, useAdminSettings, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { useCategoryList } from '../../components/ProductIcon';
import { ExpiryBadge, ProductImage } from '../../components/productBits';
import { Button, Card, EmptyState, ErrorNote, EuroInput, Field, Input, PageHeader, Select, Skeleton } from '../../components/ui';
import { eur, parseEuro } from '../../domain/money';
import type { Product } from '../../domain/types';
import { useBands, useDocumentTitle, useLang } from '../../lib/hooks';
import { fitTiers } from '../../domain/pricing';
import { resizeImage } from '../../lib/image';
import { toast } from '../../store/toasts';

const textarea = 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-fg focus:ring-[3px] focus:ring-[var(--ring)]';

/** Edit everything about one product (catalog data, photo, prices, stock, VAT, best-before). */
function Editor({ product: p }: { product: Product }) {
  const { t } = useTranslation();
  const lang = useLang();
  const settings = useAdminSettings();
  const save = useApi(api.updateProduct);
  const cats = useCategoryList();
  const { labels } = useBands();
  const [f, setF] = useState({
    nameEn: p.name.en, nameIt: p.name.it, packEn: p.pack.en, packIt: p.pack.it, descEn: p.description.en, descIt: p.description.it,
    sku: p.sku, ean: p.ean, brand: p.brand, origin: p.origin, category: p.category,
    tiers: fitTiers(p.tiers, labels.length).map((c) => (c / 100).toFixed(2)),
    stock: String(p.stock), vatRateId: p.vatRateId, expiryDate: p.expiryDate ?? '', active: p.active, image: p.image,
  });
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const tiers = f.tiers.map(parseEuro);
  const stock = /^\d+$/.test(f.stock) ? Number(f.stock) : null;
  const errors = {
    nameEn: !f.nameEn.trim(), nameIt: !f.nameIt.trim(), sku: !f.sku.trim(),
    tiers: tiers.some((c) => c === null || c <= 0), stock: stock === null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const tiersOdd = !errors.tiers && tiers.some((c, i) => i > 0 && c! > tiers[i - 1]!);

  const submit = async () => {
    setTried(true);
    if (invalid) return;
    const patch: Partial<Product> = {
      name: { en: f.nameEn.trim(), it: f.nameIt.trim() }, pack: { en: f.packEn.trim(), it: f.packIt.trim() },
      description: { en: f.descEn.trim(), it: f.descIt.trim() }, sku: f.sku.trim().toUpperCase(), ean: f.ean.trim(),
      brand: f.brand.trim(), origin: f.origin.trim(), category: f.category, tiers: tiers as number[],
      stock: stock!, vatRateId: f.vatRateId, expiryDate: f.expiryDate || null, active: f.active, image: f.image,
    };
    const changed = (Object.keys(patch) as (keyof Product)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(p[k]));
    if (!changed.length) return toast({ title: t('admin.product.noChanges') });
    const detail = changed.map((k) => (k === 'tiers' ? `prices ${p.tiers.map((c) => eur(c)).join('/')} → ${patch.tiers!.map((c) => eur(c)).join('/')}` : k === 'stock' ? `stock ${p.stock} → ${patch.stock}` : k === 'expiryDate' ? `best-before ${p.expiryDate ?? '—'} → ${patch.expiryDate ?? '—'}` : k)).join(', ');
    await save.mutateAsync([p.id, patch, `Edited product ${patch.name!.en}: ${detail}`]);
    toast({ title: t('admin.product.saved'), tone: 'ok' });
  };

  const err = (bad: boolean) => (tried && bad ? t('v.required') : undefined);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="grid gap-5">
        <Card className="grid gap-4 p-5">
          <h2 className="font-medium">{t('admin.product.basics')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t('admin.product.name')} (EN)`} htmlFor="pn-en" error={err(errors.nameEn)}><Input id="pn-en" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} invalid={tried && errors.nameEn} /></Field>
            <Field label={`${t('admin.product.name')} (IT)`} htmlFor="pn-it" error={err(errors.nameIt)}><Input id="pn-it" value={f.nameIt} onChange={(e) => set('nameIt', e.target.value)} invalid={tried && errors.nameIt} /></Field>
            <Field label={`${t('product.pack')} (EN)`} htmlFor="pp-en" hint={t('admin.product.packHint')}><Input id="pp-en" value={f.packEn} onChange={(e) => set('packEn', e.target.value)} /></Field>
            <Field label={`${t('product.pack')} (IT)`} htmlFor="pp-it"><Input id="pp-it" value={f.packIt} onChange={(e) => set('packIt', e.target.value)} /></Field>
            <Field label={t('catalog.category')} htmlFor="p-cat">
              <Select id="p-cat" value={f.category} onChange={(e) => set('category', e.target.value)}>
                {cats.list.map((c) => <option key={c.id} value={c.id}>{cats.name(c.id)}{c.active ? '' : ` (${t('admin.product.hidden')})`}</option>)}
              </Select>
            </Field>
            <Field label={t('product.brand')} htmlFor="p-brand"><Input id="p-brand" value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label={t('product.origin')} htmlFor="p-origin"><Input id="p-origin" value={f.origin} onChange={(e) => set('origin', e.target.value)} /></Field>
            <Field label="SKU" htmlFor="p-sku" error={err(errors.sku)}><Input id="p-sku" value={f.sku} onChange={(e) => set('sku', e.target.value)} invalid={tried && errors.sku} /></Field>
            <Field label={t('admin.product.ean')} htmlFor="p-ean"><Input id="p-ean" inputMode="numeric" value={f.ean} onChange={(e) => set('ean', e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="grid gap-4 p-5">
          <h2 className="font-medium">{t('product.description')}</h2>
          <Field label="EN" htmlFor="pd-en"><textarea id="pd-en" rows={4} className={textarea} value={f.descEn} onChange={(e) => set('descEn', e.target.value)} /></Field>
          <Field label="IT" htmlFor="pd-it"><textarea id="pd-it" rows={4} className={textarea} value={f.descIt} onChange={(e) => set('descIt', e.target.value)} /></Field>
        </Card>

        <Card className="grid gap-4 p-5">
          <h2 className="font-medium">{t('admin.product.pricesStock')}</h2>
          <div className="flex flex-wrap gap-4">
            {labels.map((r, i) => (
              <Field key={r} label={t('product.cases', { r })} htmlFor={`p-t${i}`}>
                <EuroInput id={`p-t${i}`} value={f.tiers[i] ?? ''} onChange={(v) => set('tiers', f.tiers.map((x, j) => (j === i ? v : x)))} invalid={tried && (tiers[i] === null || tiers[i]! <= 0)} />
              </Field>
            ))}
            <Field label={t('admin.stock')} htmlFor="p-stock" error={err(errors.stock)}><Input id="p-stock" inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value.replace(/\D/g, ''))} className="!h-9 w-28" /></Field>
            <Field label={t('admin.vatRate')} htmlFor="p-vat">
              <Select id="p-vat" value={f.vatRateId} onChange={(e) => set('vatRateId', e.target.value)} className="!h-9 w-44">
                {settings.data?.vatRates.map((r) => <option key={r.id} value={r.id}>{r.label[lang]}</option>)}
              </Select>
            </Field>
          </div>
          <p className="text-[13px] text-muted">{t('admin.product.pricesNote')} <Link to="/admin/settings?tab=pricing" className="underline underline-offset-4">{t('admin.product.bandsLink')}</Link></p>
          {tiersOdd && <p className="text-[13px] text-warn">{t('admin.product.tiersOdd')}</p>}
          {tried && errors.tiers && <p className="text-[13px] text-bad">{t('admin.product.tiersBad')}</p>}
        </Card>
      </div>

      <div className="grid gap-5 lg:sticky lg:top-20">
        <Card className="grid gap-3 p-5">
          <h2 className="font-medium">{t('admin.product.photo')}</h2>
          <ProductImage product={{ image: f.image, icon: p.icon, name: { en: f.nameEn, it: f.nameIt } }} className="aspect-square w-full rounded-xl border border-line" iconClass="size-20" />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
              <ImagePlus className="size-4" /> {f.image ? t('admin.product.replacePhoto') : t('admin.product.addPhoto')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setImgErr(t('admin.product.photoType'));
                  if (file.size > 15 * 1024 * 1024) return setImgErr(t('admin.product.photoSize'));
                  try {
                    set('image', await resizeImage(file));
                    setImgErr(null);
                  } catch {
                    setImgErr(t('admin.product.photoType'));
                  }
                }}
              />
            </label>
            {f.image && <Button variant="quiet" onClick={() => set('image', null)}><Trash2 className="size-4" /> {t('common.remove')}</Button>}
          </div>
          <p className={imgErr ? 'text-[12.5px] text-bad' : 'text-[12.5px] text-muted'}>{imgErr ?? t('admin.product.photoHint')}</p>
        </Card>

        <Card className="grid gap-3 p-5">
          <h2 className="font-medium">{t('admin.product.batch')}</h2>
          <Field label={t('admin.product.expiry')} htmlFor="p-exp" hint={t('admin.product.expiryHint')}>
            <Input id="p-exp" type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} className="w-48" />
          </Field>
          <ExpiryBadge date={f.expiryDate || null} long />
          <label className="flex items-center gap-2 pt-1 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-[var(--primary)]" />
            {t('admin.product.active')}
          </label>
        </Card>

        {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} loading={save.isPending} className="h-10 flex-1">{t('admin.product.save')}</Button>
          <Link to={`/product/${p.id}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"><ExternalLink className="size-4" /> {t('admin.product.preview')}</Link>
        </div>
      </div>
    </div>
  );
}

export function ProductEditPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { id = '' } = useParams();
  const products = useAdminProducts();
  const p = products.data?.find((x) => x.id === id);
  useDocumentTitle(p ? p.name[lang] : t('admin.nav.products'));
  if (products.isLoading) return <Skeleton className="h-[600px]" />;
  if (!p) return <EmptyState title={t('product.notFound')} action={<Link to="/admin/products" className="text-sm underline">{t('admin.nav.products')}</Link>} />;
  return (
    <div className="grid gap-5">
      <Link to="/admin/products" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('admin.nav.products')}</Link>
      <PageHeader title={p.name[lang]} sub={`${p.sku} · ${p.pack[lang]}`} />
      {/* Remount the form when the saved product changes, so it always starts from stored values. */}
      <Editor key={JSON.stringify(p)} product={p} />
    </div>
  );
}
