import clsx from 'clsx';
import { ArrowDown, ArrowUp, ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { api, useAdminSettings, useApi } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Skeleton } from '../../components/ui';
import { PAYMENT_KINDS, type Branding, type BusinessDetails, type PaymentKind, type PaymentMethod, type Settings, type VatRate } from '../../domain/types';
import { PaymentIcon } from '../../components/PaymentIcon';
import { Select } from '../../components/ui';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';
import { FooterSettingsTab } from './FooterSettingsTab';
import { PricingSettingsTab } from './PricingSettingsTab';

type Tab = 'appearance' | 'footer' | 'pricing' | 'payments' | 'tax' | 'business' | 'demo';

function useSaver() {
  const { t } = useTranslation();
  const m = useApi(api.updateSettings);
  const save = async (patch: Partial<Settings>, what: string) => {
    await m.mutateAsync([patch, what]);
    toast({ title: t('admin.settings.saved'), tone: 'ok' });
  };
  return { save, pending: m.isPending, error: m.error };
}

/* ---------- Appearance (BRAND-01…04) ---------- */

function LogoInput({ label, value, onChange, dark }: { label: string; value: string | null; onChange: (v: string | null) => void; dark?: boolean }) {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <div className={clsx('grid h-20 place-items-center rounded-xl border border-line', dark ? 'bg-[#0a0a0a]' : 'bg-white')}>
        {value ? <img src={value} alt="" className="h-7 max-w-40 object-contain" /> : <span className={clsx('text-xs', dark ? 'text-[#a1a1a1]' : 'text-[#666]')}>{t('admin.settings.noLogo')}</span>}
      </div>
      <div className="flex gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2">
          <ImagePlus className="size-4" /> {t('admin.settings.upload')}
          <input
            type="file"
            accept="image/png,image/svg+xml"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!['image/png', 'image/svg+xml'].includes(f.type)) return setErr(t('admin.settings.logoType'));
              if (f.size > 2 * 1024 * 1024) return setErr(t('admin.settings.logoSize'));
              setErr(null);
              const r = new FileReader();
              r.onload = () => onChange(String(r.result));
              r.readAsDataURL(f);
            }}
          />
        </label>
        {value && <Button size="sm" variant="quiet" onClick={() => onChange(null)}><Trash2 className="size-4" /> {t('common.remove')}</Button>}
      </div>
      {err && <p className="text-[12.5px] text-bad">{err}</p>}
    </div>
  );
}

function Appearance({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const [b, setB] = useState<Branding>(s.branding);
  const { save, pending, error } = useSaver();
  const valid = b.brandName.trim() && b.brandName.length <= 40 && b.siteTitle.trim() && b.siteTitle.length <= 60;
  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('admin.settings.brandName')} htmlFor="b-name" hint={`${b.brandName.length}/40`}><Input id="b-name" maxLength={40} value={b.brandName} onChange={(e) => setB({ ...b, brandName: e.target.value })} /></Field>
        <Field label={t('admin.settings.siteTitle')} htmlFor="b-title" hint={`${b.siteTitle.length}/60`}><Input id="b-title" maxLength={60} value={b.siteTitle} onChange={(e) => setB({ ...b, siteTitle: e.target.value })} /></Field>
        <Field label={t('admin.settings.sender')} htmlFor="b-sender"><Input id="b-sender" value={b.senderName} onChange={(e) => setB({ ...b, senderName: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <LogoInput label={t('admin.settings.logoLight')} value={b.logoLight} onChange={(v) => setB({ ...b, logoLight: v })} />
        <LogoInput label={t('admin.settings.logoDark')} value={b.logoDark} onChange={(v) => setB({ ...b, logoDark: v })} dark />
      </div>
      <p className="text-[13px] text-muted">{t('admin.settings.appearanceNote')}</p>
      {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div><Button disabled={!valid} loading={pending} onClick={() => save({ branding: b }, `Appearance: brand “${s.branding.brandName}” → “${b.brandName}”, title “${s.branding.siteTitle}” → “${b.siteTitle}”${b.logoLight !== s.branding.logoLight || b.logoDark !== s.branding.logoDark ? ', logo changed' : ''}`)}>{t('common.save')}</Button></div>
    </Card>
  );
}

/* ---------- Payments (PAY-01, PAY-05) ---------- */

function Payments({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [methods, setMethods] = useState<PaymentMethod[]>([...s.paymentMethods].sort((a, b) => a.sort - b.sort));
  const { save, pending, error } = useSaver();
  const upd = (i: number, patch: Partial<PaymentMethod>) => setMethods(methods.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...methods];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setMethods(next);
  };
  const valid = methods.some((m) => m.enabled) && methods.every((m) => m.name.en.trim() && m.name.it.trim());
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted">{t('admin.settings.paymentsNote')}</p>
      {methods.map((m, i) => (
        <Card key={m.id} className={clsx('grid gap-4 p-5', !m.enabled && 'opacity-70')}>
          <div className="flex flex-wrap items-center gap-3">
            <b className="flex flex-1 items-center gap-2 font-medium"><PaymentIcon kind={m.kind} className="size-4" /> {m.name[lang] || t('admin.settings.newMethod')}</b>
            <Select value={m.kind} onChange={(e) => upd(i, { kind: e.target.value as PaymentKind })} className="!h-8 w-36 text-[13px]" aria-label={t('admin.pay.method')}>
              {PAYMENT_KINDS.map((k) => <option key={k} value={k}>{t(`admin.pay.kind.${k}`)}</option>)}
            </Select>
            <Pill tone={m.enabled ? 'ok' : 'muted'}>{m.enabled ? t('admin.settings.on') : t('admin.settings.off')}</Pill>
            <Button size="sm" variant="quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('admin.settings.moveUp')}><ArrowUp className="size-4" /></Button>
            <Button size="sm" variant="quiet" disabled={i === methods.length - 1} onClick={() => move(i, 1)} aria-label={t('admin.settings.moveDown')}><ArrowDown className="size-4" /></Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={`${t('admin.settings.methodName')} (EN)`} htmlFor={`pm-en-${m.id}`}><Input id={`pm-en-${m.id}`} value={m.name.en} onChange={(e) => upd(i, { name: { ...m.name, en: e.target.value } })} /></Field>
            <Field label={`${t('admin.settings.methodName')} (IT)`} htmlFor={`pm-it-${m.id}`}><Input id={`pm-it-${m.id}`} value={m.name.it} onChange={(e) => upd(i, { name: { ...m.name, it: e.target.value } })} /></Field>
            {(['en', 'it'] as const).map((l) => (
              <Field key={l} label={`${t('admin.settings.instructions')} (${l.toUpperCase()})`} htmlFor={`pm-i-${l}-${m.id}`}>
                <textarea id={`pm-i-${l}-${m.id}`} rows={3} value={m.instructions[l]} onChange={(e) => upd(i, { instructions: { ...m.instructions, [l]: e.target.value } })} className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-fg focus:ring-[3px] focus:ring-[var(--ring)]" />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={m.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {t('admin.settings.enabled')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={m.shipOnlyAfterPayment} onChange={(e) => upd(i, { shipOnlyAfterPayment: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {t('admin.settings.shipAfterPay')}</label>
          </div>
        </Card>
      ))}
      {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setMethods([...methods, { id: `pm${Date.now().toString(36)}`, kind: 'other', name: { en: '', it: '' }, instructions: { en: '', it: '' }, enabled: false, shipOnlyAfterPayment: true, sort: methods.length }])}><Plus className="size-4" /> {t('admin.settings.addMethod')}</Button>
        <Button disabled={!valid} loading={pending} onClick={() => save({ paymentMethods: methods.map((m, i) => ({ ...m, sort: i })) }, `Payment methods: ${methods.filter((m) => m.enabled).map((m) => m.name.en).join(', ')} enabled`)}>{t('common.save')}</Button>
      </div>
      {!methods.some((m) => m.enabled) && <p className="text-[13px] text-bad">{t('admin.settings.needOneMethod')}</p>}
    </div>
  );
}

/* ---------- Tax (VAT-01) ---------- */

function Tax({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const [rates, setRates] = useState<VatRate[]>(s.vatRates);
  const [pct, setPct] = useState('');
  const { save, pending, error } = useSaver();
  const n = Number(pct.replace(',', '.'));
  return (
    <Card className="grid gap-4 p-5">
      <p className="text-[13px] text-muted">{t('admin.settings.taxNote')}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-[.06em] text-muted"><th className="py-2 pr-3 font-medium">%</th><th className="py-2 pr-3 font-medium">EN</th><th className="py-2 font-medium">IT</th></tr></thead>
          <tbody>
            {rates.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="num py-2 pr-3 font-medium">{r.percent}%</td>
                <td className="py-2 pr-3"><Input value={r.label.en} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, label: { ...x.label, en: e.target.value } } : x)))} className="!h-9" aria-label={`${r.percent}% EN`} /></td>
                <td className="py-2"><Input value={r.label.it} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, label: { ...x.label, it: e.target.value } } : x)))} className="!h-9" aria-label={`${r.percent}% IT`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!(n >= 0 && n < 100) || rates.some((r) => r.percent === n)) return; setRates([...rates, { id: `v${String(n).replace('.', '_')}`, percent: n, label: { en: `${n}%`, it: `${n}%` } }]); setPct(''); }}>
        <Field label={t('admin.settings.newRate')} htmlFor="new-rate"><Input id="new-rate" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="!h-9 w-28" placeholder="5" /></Field>
        <Button type="submit" size="sm" variant="ghost" disabled={!pct || !(n >= 0 && n < 100)}><Plus className="size-4" /> {t('admin.settings.addRate')}</Button>
      </form>
      {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div><Button loading={pending} onClick={() => save({ vatRates: rates }, `VAT rates: ${rates.map((r) => `${r.percent}%`).join(', ')}`)}>{t('common.save')}</Button></div>
    </Card>
  );
}

/* ---------- Business details (INV-02) ---------- */

function Business({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const [b, setB] = useState<BusinessDetails>(s.business);
  const { save, pending, error } = useSaver();
  const text = (k: keyof Omit<BusinessDetails, 'footer'>, label: string) => (
    <Field label={label} htmlFor={`bd-${k}`}><Input id={`bd-${k}`} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} /></Field>
  );
  return (
    <Card className="grid gap-4 p-5">
      <p className="text-[13px] text-muted">{t('admin.settings.businessNote')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {text('legalName', t('admin.settings.legalName'))}
        {text('address', t('apply.address'))}
        {text('vatNumber', t('apply.vatNumber'))}
        {text('fiscalCode', t('apply.fiscalCode'))}
        {text('rea', 'REA')}
        {text('iban', 'IBAN')}
        {text('invoicePrefix', t('admin.settings.invoicePrefix'))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(['en', 'it'] as const).map((l) => (
          <Field key={l} label={`${t('admin.settings.footer')} (${l.toUpperCase()})`} htmlFor={`bd-f-${l}`}><Input id={`bd-f-${l}`} value={b.footer[l]} onChange={(e) => setB({ ...b, footer: { ...b.footer, [l]: e.target.value } })} /></Field>
        ))}
      </div>
      {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      <div><Button loading={pending} onClick={() => save({ business: b }, 'Business details updated')}>{t('common.save')}</Button></div>
    </Card>
  );
}

/* ---------- Demo data ---------- */

function Demo() {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="grid gap-3 p-5">
      <p className="text-sm">{t('admin.settings.demoNote')}</p>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-bad">{t('admin.settings.demoConfirm')}</span>
          <Button variant="danger" onClick={async () => { await api.resetDemo(); setConfirm(false); toast({ title: t('admin.settings.demoDone'), tone: 'ok' }); }}>{t('admin.settings.demoReset')}</Button>
          <Button variant="quiet" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
        </div>
      ) : (
        <Button variant="ghost" className="justify-self-start" onClick={() => setConfirm(true)}><RotateCcw className="size-4" /> {t('admin.settings.demoReset')}</Button>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('admin.nav.settings'));
  const settings = useAdminSettings();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'appearance') as Tab;
  const tabs: Tab[] = ['appearance', 'footer', 'pricing', 'payments', 'tax', 'business', 'demo'];
  if (settings.isLoading) return <Skeleton className="h-96" />;
  const s = settings.data!;
  const key = JSON.stringify(s);
  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.settings')} />
      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map((x) => (
          <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setParams({ tab: x }, { replace: true })} className={clsx('-mb-px h-10 whitespace-nowrap border-b-2 px-3 text-sm transition-colors', tab === x ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t(`admin.settings.tab.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'appearance' && <Appearance key={key} s={s} />}
      {tab === 'footer' && <FooterSettingsTab key={key} s={s} />}
      {tab === 'pricing' && <PricingSettingsTab key={key} s={s} />}
      {tab === 'payments' && <Payments key={key} s={s} />}
      {tab === 'tax' && <Tax key={key} s={s} />}
      {tab === 'business' && <Business key={key} s={s} />}
      {tab === 'demo' && <Demo />}
    </div>
  );
}
