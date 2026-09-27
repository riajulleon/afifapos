import clsx from 'clsx';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminProducts, useApi, useCategories } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { CategoryIcon, ICON_CHOICES, ProductIcon } from '../../components/ProductIcon';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import type { Category } from '../../domain/types';
import { useCan, useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';

/** CAT-02: pick a built-in icon or upload a small SVG/PNG/WebP. */
function Editor({ cat, onDone }: { cat: Category; onDone: () => void }) {
  const { t } = useTranslation();
  const save = useApi(api.saveCategory);
  const [c, setC] = useState<Category>(cat);
  const [err, setErr] = useState<string | null>(null);
  const valid = c.name.en.trim() && c.name.it.trim();
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="font-medium">{cat.id ? t('cats.edit') : t('cats.add')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t('cats.name')} (EN)`} htmlFor="c-en"><Input id="c-en" value={c.name.en} onChange={(e) => setC({ ...c, name: { ...c.name, en: e.target.value } })} /></Field>
        <Field label={`${t('cats.name')} (IT)`} htmlFor="c-it"><Input id="c-it" value={c.name.it} onChange={(e) => setC({ ...c, name: { ...c.name, it: e.target.value } })} /></Field>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium text-muted">{t('cats.icon')}</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-surface-2"><CategoryIcon category={c} className="size-7" /></span>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
            <ImagePlus className="size-4" /> {t('cats.upload')}
            <input
              type="file"
              accept="image/svg+xml,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (!/^image\/(svg\+xml|png|webp)$/.test(f.type)) return setErr(t('cats.uploadType'));
                if (f.size > 200 * 1024) return setErr(t('cats.uploadSize'));
                setErr(null);
                const r = new FileReader();
                r.onload = () => setC((x) => ({ ...x, image: String(r.result) }));
                r.readAsDataURL(f);
              }}
            />
          </label>
          {c.image && <Button size="sm" variant="quiet" onClick={() => setC({ ...c, image: null })}>{t('cats.useIcon')}</Button>}
        </div>
        {err && <p className="text-[12.5px] text-bad">{err}</p>}
        {!c.image && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5 rounded-xl border border-line p-2" role="radiogroup" aria-label={t('cats.icon')}>
            {ICON_CHOICES.map((name) => (
              <button key={name} type="button" role="radio" aria-checked={c.icon === name} title={name} onClick={() => setC({ ...c, icon: name })} className={clsx('grid h-11 place-items-center rounded-lg border transition-colors', c.icon === name ? 'border-primary bg-primary text-primary-ink' : 'border-transparent hover:bg-surface-2')}>
                <ProductIcon name={name} className="size-5" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {t('cats.shown')}</label>
      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div className="flex gap-2">
        <Button disabled={!valid} loading={save.isPending} onClick={async () => { await save.mutateAsync([{ ...c, name: { en: c.name.en.trim(), it: c.name.it.trim() } }]); toast({ title: t('cats.saved'), tone: 'ok' }); onDone(); }}>{t('common.save')}</Button>
        <Button variant="quiet" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </Card>
  );
}

/** CAT-03: deleting a category that has products asks where they go. */
function DeleteDialog({ cat, count, others, onDone }: { cat: Category; count: number; others: Category[]; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const del = useApi(api.deleteCategory);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <div className="grid gap-3 rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm">
      <p>{count ? t('cats.deleteMove', { count, name: cat.name[lang] }) : t('cats.deleteEmpty', { name: cat.name[lang] })}</p>
      {count > 0 && (
        <Select value={target} onChange={(e) => setTarget(e.target.value)} className="!h-9 max-w-xs" aria-label={t('cats.moveTo')}>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name[lang]}</option>)}
        </Select>
      )}
      {del.error && <ErrorNote><ApiErrorMessage error={del.error} /></ErrorNote>}
      <div className="flex gap-2">
        <Button size="sm" variant="danger" loading={del.isPending} disabled={count > 0 && !target} onClick={async () => { await del.mutateAsync([cat.id, count ? target : undefined]); toast({ title: t('cats.deleted'), tone: 'ok' }); onDone(); }}>{t('cats.deleteConfirm')}</Button>
        <Button size="sm" variant="quiet" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.categories'));
  const cats = useCategories();
  const products = useAdminProducts();
  const reorder = useApi(api.reorderCategories);
  const can = useCan();
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  if (cats.isLoading || products.isLoading) return <Skeleton className="h-96" />;
  const list = cats.data!;
  const count = (id: string) => products.data?.filter((p) => p.category === id).length ?? 0;
  const move = (i: number, d: -1 | 1) => {
    const ids = list.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    reorder.mutate([ids]);
  };
  const editable = can('categories.edit');

  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.categories')} sub={t('cats.sub')} actions={editable && !editing && <Button onClick={() => setEditing({ id: '', name: { en: '', it: '' }, icon: 'package', image: null, sort: list.length, active: true })}><Plus className="size-4" /> {t('cats.add')}</Button>} />
      {editing && <Editor key={editing.id || 'new'} cat={editing} onDone={() => setEditing(null)} />}
      <div className="grid gap-2">
        {list.map((c, i) => (
          <Card key={c.id} className="grid gap-3 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-surface-2"><CategoryIcon category={c} /></span>
              <div className="min-w-0 flex-1">
                <b className="font-medium">{c.name[lang]}</b> <span className="text-muted">· {lang === 'it' ? c.name.en : c.name.it}</span>
                <p className="text-[13px] text-muted">{t('cats.products', { count: count(c.id) })}</p>
              </div>
              {!c.active && <Pill tone="muted">{t('cats.hidden')}</Pill>}
              {editable && (
                <span className="flex gap-1">
                  <Button size="sm" variant="quiet" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label={t('admin.settings.moveUp')}><ArrowUp className="size-4" /></Button>
                  <Button size="sm" variant="quiet" disabled={i === list.length - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label={t('admin.settings.moveDown')}><ArrowDown className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>{t('common.edit')}</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(c.id)} aria-label={t('common.remove')}><Trash2 className="size-4" /></Button>
                </span>
              )}
            </div>
            {deleting === c.id && <DeleteDialog cat={c} count={count(c.id)} others={list.filter((o) => o.id !== c.id)} onDone={() => setDeleting(null)} />}
          </Card>
        ))}
      </div>
    </div>
  );
}
