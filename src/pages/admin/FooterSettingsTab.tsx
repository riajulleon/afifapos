import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { FooterView } from '../../components/Footer';
import { Button, Card, ErrorNote, Field, Input } from '../../components/ui';
import type { FooterSettings, Localized, Settings } from '../../domain/types';
import { toast } from '../../store/toasts';

const validHref = (h: string) => /^(\/[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s-]+)$/i.test(h.trim());

/** Settings › Footer: one footer for the shop and the admin console, in EN and IT. */
export function FooterSettingsTab({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const save = useApi(api.updateSettings);
  const [f, setF] = useState<FooterSettings>(s.footer);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof FooterSettings>(k: K, v: FooterSettings[K]) => setF((x) => ({ ...x, [k]: v }));
  const setLoc = (k: 'about' | 'hours' | 'copyright', lang: keyof Localized, v: string) => setF((x) => ({ ...x, [k]: { ...x[k], [lang]: v } }));
  const setLink = (i: number, patch: Partial<FooterSettings['links'][number]>) => set('links', f.links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...f.links];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set('links', next);
  };
  const badLink = (l: FooterSettings['links'][number]) => !l.label.en.trim() || !l.label.it.trim() || !validHref(l.href);
  const invalid = f.links.some(badLink);

  const submit = async () => {
    setTried(true);
    if (invalid) return;
    const clean: FooterSettings = { ...f, email: f.email.trim(), phone: f.phone.trim(), address: f.address.trim(), links: f.links.map((l) => ({ label: { en: l.label.en.trim(), it: l.label.it.trim() }, href: l.href.trim() })) };
    await save.mutateAsync([{ footer: clean }, `Footer updated (shop ${clean.showOnShop ? 'on' : 'off'}, admin ${clean.showOnAdmin ? 'on' : 'off'}, ${clean.links.length} links)`]);
    toast({ title: t('admin.settings.saved'), tone: 'ok' });
  };

  const area = 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-fg focus:ring-[3px] focus:ring-[var(--ring)]';

  return (
    <div className="grid gap-5">
      <Card className="grid gap-3 p-5">
        <h2 className="font-medium">{t('footer.where')}</h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.showOnShop} onChange={(e) => set('showOnShop', e.target.checked)} className="size-4 accent-[var(--primary)]" /> {t('footer.onShop')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.showOnAdmin} onChange={(e) => set('showOnAdmin', e.target.checked)} className="size-4 accent-[var(--primary)]" /> {t('footer.onAdmin')}</label>
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="font-medium">{t('footer.aboutTitle')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(['en', 'it'] as const).map((l) => (
            <Field key={l} label={`${t('footer.about')} (${l.toUpperCase()})`} htmlFor={`ft-about-${l}`}>
              <textarea id={`ft-about-${l}`} rows={3} className={area} value={f.about[l]} onChange={(e) => setLoc('about', l, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="font-medium">{t('footer.contact')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('apply.email')} htmlFor="ft-email"><Input id="ft-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label={t('footer.phone')} htmlFor="ft-phone"><Input id="ft-phone" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('apply.address')} htmlFor="ft-addr"><Input id="ft-addr" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={`${t('footer.hours')} (EN)`} htmlFor="ft-h-en"><Input id="ft-h-en" value={f.hours.en} onChange={(e) => setLoc('hours', 'en', e.target.value)} /></Field>
          <Field label={`${t('footer.hours')} (IT)`} htmlFor="ft-h-it"><Input id="ft-h-it" value={f.hours.it} onChange={(e) => setLoc('hours', 'it', e.target.value)} /></Field>
        </div>
        <p className="text-[13px] text-muted">{t('footer.emptyHidden')}</p>
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="font-medium">{t('footer.links')}</h2>
        {f.links.map((l, i) => {
          const bad = tried && badLink(l);
          return (
            <div key={i} className="grid items-end gap-2 rounded-xl border border-line bg-canvas p-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
              <Field label={`${t('footer.label')} (EN)`} htmlFor={`fl-en-${i}`}><Input id={`fl-en-${i}`} value={l.label.en} onChange={(e) => setLink(i, { label: { ...l.label, en: e.target.value } })} invalid={bad && !l.label.en.trim()} className="!h-9" /></Field>
              <Field label={`${t('footer.label')} (IT)`} htmlFor={`fl-it-${i}`}><Input id={`fl-it-${i}`} value={l.label.it} onChange={(e) => setLink(i, { label: { ...l.label, it: e.target.value } })} invalid={bad && !l.label.it.trim()} className="!h-9" /></Field>
              <Field label={t('footer.href')} htmlFor={`fl-h-${i}`} error={bad && !validHref(l.href) ? t('footer.hrefBad') : undefined}><Input id={`fl-h-${i}`} value={l.href} onChange={(e) => setLink(i, { href: e.target.value })} placeholder="/catalog · https://… · mailto:…" invalid={bad && !validHref(l.href)} className="!h-9" /></Field>
              <div className="flex gap-1">
                <Button size="sm" variant="quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('admin.settings.moveUp')}><ArrowUp className="size-4" /></Button>
                <Button size="sm" variant="quiet" disabled={i === f.links.length - 1} onClick={() => move(i, 1)} aria-label={t('admin.settings.moveDown')}><ArrowDown className="size-4" /></Button>
                <Button size="sm" variant="quiet" onClick={() => set('links', f.links.filter((_, j) => j !== i))} aria-label={t('common.remove')}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          );
        })}
        <Button variant="ghost" className="justify-self-start" onClick={() => set('links', [...f.links, { label: { en: '', it: '' }, href: '' }])}><Plus className="size-4" /> {t('footer.addLink')}</Button>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="font-medium">{t('footer.copyright')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(['en', 'it'] as const).map((l) => (
            <Field key={l} label={`${t('footer.copyright')} (${l.toUpperCase()})`} htmlFor={`ft-c-${l}`} hint={l === 'en' ? t('footer.yearHint') : undefined}>
              <Input id={`ft-c-${l}`} value={f.copyright[l]} onChange={(e) => setLoc('copyright', l, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid gap-2">
        <h2 className="text-[11.5px] font-medium uppercase tracking-[.08em] text-muted">{t('footer.preview')}</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <FooterView footer={f} variant="shop" />
        </div>
        <div className="overflow-hidden rounded-xl border border-line">
          <FooterView footer={f} variant="admin" />
        </div>
      </div>

      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      {tried && invalid && <ErrorNote>{t('footer.fixLinks')}</ErrorNote>}
      <div><Button onClick={submit} loading={save.isPending}>{t('common.save')}</Button></div>
    </div>
  );
}
