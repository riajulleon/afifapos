import clsx from 'clsx';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { api, queryClient, useApi, useMe } from '../../api/queries';
import { Button, ErrorNote, Field } from '../../components/ui';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { rules, UPLOAD_ACCEPT } from '../../lib/validate';
import { AuthLayout } from '../../layouts/AuthLayout';

/** What a Pending or Info-requested applicant sees after signing in (AUTH account states). */
export function PendingPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('pending.title'));
  const me = useMe();
  const navigate = useNavigate();
  const resubmit = useApi(api.resubmit);
  const [licence, setLicence] = useState<File | null>(null);
  const [vatDoc, setVatDoc] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  if (me.isLoading) return null;
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.state === 'approved') return <Navigate to="/" replace />;
  const info = me.data.state === 'info_requested';

  const steps = [
    { label: t('pending.t1'), sub: formatRome(me.data.createdAt, lang), state: 'done' },
    { label: t('pending.t2'), sub: t('pending.t2s'), state: 'now' },
    { label: t('pending.t3'), sub: t('pending.t3s'), state: 'todo' },
  ];

  return (
    <AuthLayout>
      <div className="grid gap-6">
        {!info && (
          <div className="relative size-24">
            <motion.svg viewBox="0 0 96 96" className="size-24" animate={{ rotate: 360 }} transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }} aria-hidden>
              <circle cx="48" cy="48" r="41" fill="none" stroke="var(--primary-soft)" strokeWidth="7" />
              <circle cx="48" cy="48" r="41" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray="82 176" />
            </motion.svg>
            <span className="num absolute inset-0 grid place-items-center text-xl font-bold">2/3</span>
          </div>
        )}
        <div className="grid gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight">{info ? t('pending.infoTitle') : t('pending.title')}</h1>
          <p className="text-muted">{info ? t('pending.infoBody') : t('pending.body')}</p>
        </div>
        {info && me.data.reviewNote && <blockquote className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">“{me.data.reviewNote}”</blockquote>}

        {info ? (
          <div className="grid gap-4">
            <Field label={t('apply.licence')} htmlFor="re-lic"><input id="re-lic" type="file" accept={UPLOAD_ACCEPT} onChange={(e) => setLicence(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
            <Field label={t('apply.vatDoc')} htmlFor="re-vat"><input id="re-vat" type="file" accept={UPLOAD_ACCEPT} onChange={(e) => setVatDoc(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
            {fileErr && <ErrorNote>{t(fileErr)}</ErrorNote>}
            <Button
              loading={resubmit.isPending}
              onClick={async () => {
                const bad = (licence && rules.file(licence)) || (vatDoc && rules.file(vatDoc));
                if (bad) return setFileErr(bad);
                if (!licence && !vatDoc) return setFileErr('v.fileRequired');
                await resubmit.mutateAsync([{
                  licenceDoc: licence ? { name: licence.name, size: licence.size, type: licence.type } : undefined,
                  vatDoc: vatDoc ? { name: vatDoc.name, size: vatDoc.size, type: vatDoc.type } : undefined,
                }]);
                await queryClient.invalidateQueries({ queryKey: ['me'] });
              }}
            >
              {t('pending.resubmit')}
            </Button>
          </div>
        ) : (
          <ol className="grid">
            {steps.map((s, i) => (
              <li key={s.label} className="relative grid grid-cols-[24px_1fr] gap-3 pb-5 last:pb-0">
                {i < steps.length - 1 && <span className="absolute bottom-0 left-[11px] top-6 w-0.5 bg-line" aria-hidden />}
                <span className={clsx('z-10 grid size-6 place-items-center rounded-full border-2 text-[11px]', s.state === 'done' && 'border-ok bg-ok text-white', s.state === 'now' && 'border-primary bg-surface ring-4 ring-primary-soft', s.state === 'todo' && 'border-line bg-surface')}>
                  {s.state === 'done' && <Check className="size-3.5" />}
                </span>
                <div>
                  <b className="text-sm font-medium">{s.label}</b>
                  <p className="text-[13px] text-muted">{s.sub}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <Button
          variant="ghost"
          onClick={async () => {
            await api.logout();
            queryClient.clear();
            navigate('/login');
          }}
        >
          {t('nav.signOut')}
        </Button>
      </div>
    </AuthLayout>
  );
}
