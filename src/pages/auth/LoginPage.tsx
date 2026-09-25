import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, queryClient } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, ErrorNote, Field, Input } from '../../components/ui';
import { useDocumentTitle } from '../../lib/hooks';
import { AuthLayout } from '../../layouts/AuthLayout';
import { usePrefs } from '../../store/prefs';

/** Email or mobile number + password. No social sign-in (AUTH-01, AUTH-02). */
export function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.signIn'));
  const navigate = useNavigate();
  const setLang = usePrefs((s) => s.setLang);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(identifier, password);
      setLang(user.lang);
      queryClient.clear();
      navigate(user.role !== 'reseller' ? '/admin' : user.state === 'approved' ? '/' : '/pending', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} onSubmit={submit} className="grid gap-5" noValidate>
        <div className="grid gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight">{t('auth.signIn')}</h1>
          <p className="text-muted">{t('auth.signInSub')}</p>
        </div>
        <Field label={t('auth.identifier')} htmlFor="identifier" hint={t('auth.identifierHint')}>
          <Input id="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-fg" aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="size-4 accent-[var(--primary)]" /> {t('auth.remember')}</label>
          <span className="text-muted" title={t('auth.forgotHint')}>{t('auth.forgot')}</span>
        </div>
        {!!error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
        <Button type="submit" block loading={busy} className="h-10">{t('auth.submit')}</Button>
        <p className="text-center text-sm text-muted">
          {t('auth.new')} <Link to="/apply" className="font-medium text-fg underline underline-offset-4">{t('auth.apply')}</Link>
        </p>
        <details className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-muted">
          <summary className="cursor-pointer font-medium text-fg">{t('auth.demo')}</summary>
          <ul className="mt-2 grid gap-1">
            <li>Reseller · ordini@bottegasapori.it · wholesale1</li>
            <li>Reseller (mobile) · 347 812 4590 · wholesale1</li>
            <li>Admin · admin@afifa.it · admin12345</li>
            <li>Pending · minimarket.pigneto@gmail.com · wholesale1</li>
          </ul>
        </details>
      </motion.form>
    </AuthLayout>
  );
}
