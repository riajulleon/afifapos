import clsx from 'clsx';
import { FileCheck, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, queryClient, useCities } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, ErrorNote, Field, Input, Select } from '../../components/ui';
import { useDocumentTitle } from '../../lib/hooks';
import { formatBytes, normalizeMobile, rules, UPLOAD_ACCEPT } from '../../lib/validate';
import { AuthLayout } from '../../layouts/AuthLayout';
import { usePrefs } from '../../store/prefs';

type Form = {
  fullName: string; email: string; mobile: string; password: string;
  businessName: string; address: string; cityId: string; zoneId: string; vatNumber: string; fiscalCode: string; sdiOrPec: string;
};
type Errors = Partial<Record<keyof Form | 'licence' | 'vatDoc' | 'consent', string>>;

const STEP_FIELDS: (keyof Form)[][] = [
  ['fullName', 'email', 'mobile', 'password'],
  ['businessName', 'address', 'cityId', 'zoneId', 'vatNumber', 'fiscalCode', 'sdiOrPec'],
];

function check(f: Form, keys: (keyof Form)[]): Errors {
  const e: Errors = {};
  const r = (k: keyof Form, fn: (v: string) => string | null) => {
    if (!keys.includes(k)) return;
    const msg = rules.required(f[k]) ?? fn(f[k]);
    if (msg) e[k] = msg;
  };
  r('fullName', () => null);
  r('email', rules.email);
  r('mobile', rules.mobile);
  r('password', rules.password);
  r('businessName', () => null);
  r('address', () => null);
  r('cityId', () => null);
  r('zoneId', () => null);
  r('vatNumber', rules.vatNumber);
  r('fiscalCode', rules.fiscalCode);
  r('sdiOrPec', rules.sdiOrPec);
  return e;
}

function FileDrop({ id, label, file, error, onFile }: { id: string; label: string; file: File | null; error?: string; onFile: (f: File | null) => void }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0] ?? null); }}
      className={clsx('grid gap-3 rounded-xl border-[1.5px] border-dashed p-4 transition-colors', error ? 'border-bad bg-bad-soft' : over ? 'border-fg bg-surface-2' : 'border-line-strong bg-canvas')}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface"><Upload className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block font-medium">{label}</label>
          <p className={clsx('text-[12.5px]', error ? 'text-bad' : 'text-muted')}>{error ? t(error) : t('apply.limits')}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => input.current?.click()}>{t('apply.browse')}</Button>
        <input ref={input} id={id} type="file" accept={UPLOAD_ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </div>
      {file && !error && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
          <FileCheck className="size-4 text-ok" />
          <span className="min-w-0 flex-1 truncate">{file.name} · {formatBytes(file.size)}</span>
          <button type="button" onClick={() => onFile(null)} className="text-muted hover:text-fg" aria-label={t('common.remove')}><X className="size-4" /></button>
        </motion.div>
      )}
    </div>
  );
}

export function ApplyPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('apply.title'));
  const lang = usePrefs((s) => s.lang);
  const navigate = useNavigate();
  const cities = useCities();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [f, setF] = useState<Form>({ fullName: '', email: '', mobile: '', password: '', businessName: '', address: '', cityId: '', zoneId: '', vatNumber: '', fiscalCode: '', sdiOrPec: '' });
  const [licence, setLicence] = useState<File | null>(null);
  const [vatDoc, setVatDoc] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF((s) => ({ ...s, [k]: v, ...(k === 'cityId' ? { zoneId: '' } : {}) }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const city = cities.data?.find((c) => c.id === f.cityId);
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); };

  const next = () => {
    const e = check(f, STEP_FIELDS[step]);
    setErrors(e);
    if (Object.keys(e).length === 0) go(step + 1);
  };

  const submit = async () => {
    const e: Errors = {};
    const l = rules.file(licence); if (l) e.licence = l;
    const v = rules.file(vatDoc); if (v) e.vatDoc = v;
    if (!consent) e.consent = 'v.consent';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setApiError(null);
    try {
      await api.apply({
        ...f,
        email: f.email.trim(),
        mobile: normalizeMobile(f.mobile),
        vatNumber: f.vatNumber.replace(/\s/g, '').toUpperCase(),
        fiscalCode: f.fiscalCode.replace(/\s/g, '').toUpperCase(),
        licenceDoc: { name: licence!.name, size: licence!.size, type: licence!.type },
        vatDoc: { name: vatDoc!.name, size: vatDoc!.size, type: vatDoc!.type },
        lang,
      });
      queryClient.clear();
      navigate('/pending', { replace: true });
    } catch (err) {
      setApiError(err);
      const code = (err as { code?: string }).code;
      if (code === 'email_taken' || code === 'mobile_taken') go(0);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: keyof Errors) => (errors[k] ? t(errors[k]!) : undefined);
  const steps = [t('apply.s1'), t('apply.s2'), t('apply.s3')];

  return (
    <AuthLayout wide>
      <div className="grid gap-6">
        <div className="grid gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight">{t('apply.title')}</h1>
          <p className="text-muted">{t('apply.sub')}</p>
        </div>
        <ol className="grid grid-cols-3 gap-2" aria-label={t('apply.progress')}>
          {steps.map((s, i) => (
            <li key={s} className="grid gap-1.5" aria-current={i === step ? 'step' : undefined}>
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <motion.div className="h-full bg-primary" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} />
              </div>
              <span className="text-[11px] uppercase tracking-[.06em] text-muted">{t('apply.step', { n: i + 1 })}</span>
              <b className={clsx('text-sm font-medium', i === step ? 'text-fg' : 'text-muted')}>{s}</b>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 14 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 * dir }} transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }} className="grid gap-4">
            {step === 0 && (
              <>
                <Field label={t('apply.fullName')} htmlFor="fullName" error={err('fullName')}><Input id="fullName" autoComplete="name" value={f.fullName} onChange={set('fullName')} invalid={!!errors.fullName} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('apply.email')} htmlFor="email" error={err('email')}><Input id="email" type="email" autoComplete="email" value={f.email} onChange={set('email')} invalid={!!errors.email} /></Field>
                  <Field label={t('apply.mobile')} htmlFor="mobile" error={err('mobile')} hint={t('apply.mobileHint')}>
                    <div className="flex gap-2"><span className="grid h-10 place-items-center rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted">+39</span><Input id="mobile" inputMode="tel" autoComplete="tel-national" value={f.mobile} onChange={set('mobile')} invalid={!!errors.mobile} /></div>
                  </Field>
                </div>
                <Field label={t('auth.password')} htmlFor="password" error={err('password')} hint={t('apply.passwordHint')}><Input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} invalid={!!errors.password} /></Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label={t('apply.businessName')} htmlFor="businessName" error={err('businessName')}><Input id="businessName" autoComplete="organization" value={f.businessName} onChange={set('businessName')} invalid={!!errors.businessName} /></Field>
                <Field label={t('apply.address')} htmlFor="address" error={err('address')}><Input id="address" autoComplete="street-address" value={f.address} onChange={set('address')} invalid={!!errors.address} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('apply.city')} htmlFor="cityId" error={err('cityId')}>
                    <Select id="cityId" value={f.cityId} onChange={set('cityId')}><option value="">{t('apply.choose')}</option>{cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                  </Field>
                  <Field label={t('apply.zone')} htmlFor="zoneId" error={err('zoneId')} hint={t('apply.zoneHint')}>
                    <Select id="zoneId" value={f.zoneId} onChange={set('zoneId')} disabled={!city}><option value="">{t('apply.choose')}</option>{city?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('apply.vatNumber')} htmlFor="vatNumber" error={err('vatNumber')}><Input id="vatNumber" value={f.vatNumber} onChange={set('vatNumber')} placeholder="IT01234567890" invalid={!!errors.vatNumber} /></Field>
                  <Field label={t('apply.fiscalCode')} htmlFor="fiscalCode" error={err('fiscalCode')}><Input id="fiscalCode" value={f.fiscalCode} onChange={set('fiscalCode')} invalid={!!errors.fiscalCode} /></Field>
                </div>
                <Field label={t('apply.sdiOrPec')} htmlFor="sdiOrPec" error={err('sdiOrPec')} hint={t('apply.sdiHint')}><Input id="sdiOrPec" value={f.sdiOrPec} onChange={set('sdiOrPec')} invalid={!!errors.sdiOrPec} /></Field>
              </>
            )}
            {step === 2 && (
              <>
                <FileDrop id="licence" label={t('apply.licence')} file={licence} error={errors.licence} onFile={(x) => { setLicence(x); setErrors((e) => ({ ...e, licence: x ? rules.file(x) ?? undefined : undefined })); }} />
                <FileDrop id="vatDoc" label={t('apply.vatDoc')} file={vatDoc} error={errors.vatDoc} onFile={(x) => { setVatDoc(x); setErrors((e) => ({ ...e, vatDoc: x ? rules.file(x) ?? undefined : undefined })); }} />
                <label className={clsx('flex items-start gap-2.5 text-sm', errors.consent && 'text-bad')}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
                  {t('apply.consent')}
                </label>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {!!apiError && <ErrorNote><ApiErrorMessage error={apiError} /></ErrorNote>}
        <div className="flex items-center justify-between gap-3">
          {step > 0 ? <Button variant="ghost" onClick={() => go(step - 1)}>{t('common.back')}</Button> : <Link to="/login" className="text-sm text-muted hover:text-fg">{t('apply.haveAccount')}</Link>}
          {step < 2 ? <Button onClick={next}>{t('common.next')}</Button> : <Button onClick={submit} loading={busy}>{t('apply.submit')}</Button>}
        </div>
      </div>
    </AuthLayout>
  );
}
