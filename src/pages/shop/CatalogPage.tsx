import clsx from 'clsx';
import { Search, SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useProducts } from '../../api/queries';
import { ProductCard } from '../../components/cards';
import { categories } from '../../components/ProductIcon';
import { EmptyState, ErrorNote, PageHeader, Select, Skeleton } from '../../components/ui';
import type { CategoryId } from '../../domain/types';
import { useDocumentTitle, useLang, useSale } from '../../lib/hooks';

export function CatalogPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('nav.catalog'));
  const products = useProducts();
  const sale = useSale(5000);
  const [params, setParams] = useSearchParams();
  const cat = (params.get('cat') ?? 'all') as CategoryId | 'all';
  const q = params.get('q') ?? '';
  const inStock = params.get('stock') === '1';
  const sort = params.get('sort') ?? 'name';

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null || v === '' || v === 'all') next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = (products.data ?? []).filter(
      (p) =>
        (cat === 'all' || p.category === cat) &&
        (!inStock || p.stock > 0) &&
        (!needle || [p.name.en, p.name.it, p.sku].some((s) => s.toLowerCase().includes(needle))),
    );
    return out.sort((a, b) => (sort === 'price' ? a.tiers[0] - b.tiers[0] : a.name[lang].localeCompare(b.name[lang])));
  }, [products.data, cat, inStock, q, sort, lang]);

  return (
    <div className="grid gap-5">
      <PageHeader title={t('nav.catalog')} sub={t('catalog.vatNote')} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="grid content-start gap-5" aria-label={t('catalog.filters')}>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 focus-within:border-fg focus-within:ring-[3px] focus-within:ring-[var(--ring)]">
            <Search className="size-4 text-muted" aria-hidden />
            <input value={q} onChange={(e) => set('q', e.target.value)} placeholder={t('catalog.search')} aria-label={t('catalog.search')} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          </label>
          <div className="grid gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-[.08em] text-muted">{t('catalog.category')}</h2>
            <div className="flex flex-wrap gap-1.5">
              {(['all', ...categories] as const).map((c) => (
                <button key={c} type="button" aria-pressed={cat === c} onClick={() => set('cat', c)} className={clsx('h-8 rounded-full border px-3 text-[13px] transition-colors', cat === c ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface hover:bg-surface-2')}>
                  {c === 'all' ? t('catalog.all') : t(`cat.${c}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inStock} onChange={(e) => set('stock', e.target.checked ? '1' : null)} className="size-4 accent-[var(--primary)]" />
            {t('catalog.inStockOnly')}
          </label>
          <div className="grid gap-2">
            <label htmlFor="sort" className="text-[11px] font-medium uppercase tracking-[.08em] text-muted">{t('catalog.sort')}</label>
            <Select id="sort" value={sort} onChange={(e) => set('sort', e.target.value === 'name' ? null : e.target.value)}>
              <option value="name">{t('catalog.sortName')}</option>
              <option value="price">{t('catalog.sortPrice')}</option>
            </Select>
          </div>
        </aside>

        <section className="grid content-start gap-3.5">
          <div className="flex items-center justify-between text-sm">
            <b className="font-medium">{t('catalog.count', { count: list.length })}</b>
            <span className="text-muted">{t('catalog.tierHint')}</span>
          </div>
          {products.isError && <ErrorNote>{t('errors.load')}</ErrorNote>}
          {products.isLoading ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-80" />)}
            </div>
          ) : list.length ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((p, i) => <ProductCard key={p.id} product={p} deal={sale.byProduct.get(p.id)} index={i} />)}
            </div>
          ) : (
            <EmptyState icon={<SearchX className="size-5" />} title={t('catalog.empty')} body={t('catalog.emptyBody')} />
          )}
        </section>
      </div>
    </div>
  );
}
