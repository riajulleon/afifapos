import { Pencil, UserCheck } from 'lucide-react';
import { Link } from 'react-router';
import { DocChip } from '../../components/DocViewer';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useAdminCities, useApi, useApplications } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, EmptyState, ErrorNote, Input, PageHeader, Pill, Skeleton } from '../../components/ui';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.approvals'));
  const apps = useApplications();
  const cities = useAdminCities();
  const review = useApi(api.review);
  const [noteFor, setNoteFor] = useState<{ id: string; kind: 'reject' | 'info' } | null>(null);
  const [note, setNote] = useState('');

  const act = async (id: string, decision: 'approve' | 'reject' | 'info', name: string, text = '') => {
    await review.mutateAsync([id, decision, text]);
    setNoteFor(null);
    setNote('');
    toast({ title: t(`admin.review.${decision}Done`, { name }), tone: decision === 'approve' ? 'ok' : 'default' });
  };

  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.approvals')} sub={t('admin.approvalsSub')} />
      {review.error && <ErrorNote><ApiErrorMessage error={review.error} /></ErrorNote>}
      {apps.isLoading ? (
        <Skeleton className="h-64" />
      ) : !apps.data?.length ? (
        <EmptyState icon={<UserCheck className="size-5" />} title={t('admin.noApplications')} />
      ) : (
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
            {apps.data.map((u) => {
              const city = cities.data?.find((c) => c.id === u.cityId);
              const zone = city?.zones.find((z) => z.id === u.zoneId);
              return (
                <motion.article key={u.id} layout exit={{ opacity: 0, x: 30, transition: { duration: 0.25 } }} className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-1 lg:grid-cols-[1fr_auto]">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium">{u.businessName}</h2>
                      <Pill tone={u.state === 'pending' ? 'warn' : 'info'}>{t(`admin.state.${u.state}`)}</Pill>
                    </div>
                    <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[140px_1fr]">
                      <dt className="text-muted">{t('apply.fullName')}</dt><dd>{u.fullName}</dd>
                      <dt className="text-muted">{t('apply.email')} / {t('apply.mobile')}</dt><dd>{u.email} · +39 {u.mobile}</dd>
                      <dt className="text-muted">{t('apply.address')}</dt><dd>{u.address} · {city?.name}{zone ? ` › ${zone.name}` : ''}</dd>
                      <dt className="text-muted">P.IVA · C.F.</dt><dd className="num">{u.vatNumber} · {u.fiscalCode}</dd>
                      <dt className="text-muted">SDI / PEC</dt><dd>{u.sdiOrPec}</dd>
                      <dt className="text-muted">{t('admin.applied')}</dt><dd>{formatRome(u.createdAt, lang)}</dd>
                    </dl>
                    <div className="grid gap-2 pt-1 sm:grid-cols-2">
                      {u.licenceDoc && <DocChip doc={u.licenceDoc} label={t('apply.licence')} />}
                      {u.vatDoc && <DocChip doc={u.vatDoc} label={t('apply.vatDoc')} />}
                      {(u.extraDocs ?? []).map((d, i) => <DocChip key={i} doc={d} label={t('docs.extra')} />)}
                    </div>
                    {u.reviewNote && <p className="text-[13px] text-muted">{t('admin.lastNote')}: “{u.reviewNote}”</p>}
                  </div>
                  <div className="grid content-start gap-2 lg:w-64">
                    <Button loading={review.isPending && !noteFor} onClick={() => act(u.id, 'approve', u.businessName)}>{t('admin.review.approve')}</Button>
                    <Link to={`/admin/resellers/${u.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"><Pencil className="size-4" /> {t('res.editDetails')}</Link>
                    <Button variant="ghost" onClick={() => { setNoteFor({ id: u.id, kind: 'info' }); setNote(''); }}>{t('admin.review.info')}</Button>
                    <Button variant="danger" onClick={() => { setNoteFor({ id: u.id, kind: 'reject' }); setNote(''); }}>{t('admin.review.reject')}</Button>
                    {noteFor?.id === u.id && (
                      <form className="grid gap-2 rounded-xl border border-line bg-canvas p-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void act(u.id, noteFor.kind, u.businessName, note.trim()); }}>
                        <label htmlFor={`note-${u.id}`} className="text-[13px] font-medium text-muted">{noteFor.kind === 'info' ? t('admin.review.infoAsk') : t('admin.review.rejectWhy')}</label>
                        <Input id={`note-${u.id}`} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                        <div className="flex gap-2"><Button size="sm" type="submit" disabled={!note.trim()} loading={review.isPending}>{t('admin.review.send')}</Button><Button size="sm" type="button" variant="quiet" onClick={() => setNoteFor(null)}>{t('common.cancel')}</Button></div>
                      </form>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
