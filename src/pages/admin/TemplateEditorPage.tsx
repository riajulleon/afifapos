import { ArrowLeft, Eye, History, RotateCcw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useParams } from 'react-router';
import { api, useApi, useEmailTemplates, useMe } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { EmailBuilder, EmailPreview } from '../../components/EmailBuilder';
import { Button, Card, ErrorNote, Input, Pill, Skeleton } from '../../components/ui';
import { formatRome } from '../../domain/romeTime';
import type { EmailContent, EmailTemplate, EmailTemplateVersion, Lang } from '../../domain/types';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { toast } from '../../store/toasts';

function Editor({ tpl }: { tpl: EmailTemplate }) {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useMe();
  const save = useApi(api.saveTemplate);
  const restore = useApi(api.restoreTemplateVersion);
  const test = useApi(api.sendTestEmail);
  const [draft, setDraft] = useState<Record<Lang, EmailContent>>(structuredClone(tpl.content));
  const [note, setNote] = useState('');
  const [testTo, setTestTo] = useState(me.data?.email ?? '');
  const [history, setHistory] = useState(false);
  const [peek, setPeek] = useState<EmailTemplateVersion | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(tpl.content);

  // Unsaved edits are easy to lose; ask before leaving.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirm(t('mail.leaveUnsaved'))) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, t]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const error = save.error ?? restore.error ?? test.error;
  return (
    <div className="grid gap-5">
      <Link to="/admin/emails?tab=templates" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('mail.tab.templates')}</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">{t(`mail.trigger.${tpl.id}`)}</h1>
          <p className="flex flex-wrap items-center gap-2 text-muted">
            {t(`mail.when.${tpl.id}`)} <Pill tone={tpl.enabled ? 'ok' : 'muted'}>{tpl.enabled ? t('mail.on') : t('mail.off')}</Pill> <Pill tone="info">v{tpl.versions[0]?.n}</Pill> {dirty && <Pill tone="warn">{t('mail.unsaved')}</Pill>}
          </p>
        </div>
        <Button variant="ghost" onClick={() => setHistory((h) => !h)} aria-expanded={history}><History className="size-4" /> {t('mail.history', { count: tpl.versions.length })}</Button>
      </div>

      {history && (
        <Card className="grid gap-3 p-4">
          <ol className="grid gap-1.5">
            {tpl.versions.map((v, i) => (
              <li key={v.n} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                <b className="num w-10 font-medium">v{v.n}</b>
                <span className="flex-1">{v.note || '—'} <span className="text-muted">· {v.savedBy} · {formatRome(v.savedAt, lang)}</span></span>
                {i === 0 ? <Pill tone="ok">{t('mail.current')}</Pill> : (
                  <>
                    <Button size="sm" variant="quiet" onClick={() => setPeek(peek?.n === v.n ? null : v)}><Eye className="size-4" /> {t('mail.view')}</Button>
                    <Button size="sm" variant="ghost" loading={restore.isPending && restore.variables?.[1] === v.n} onClick={async () => {
                      if (dirty && !confirm(t('mail.restoreDiscards'))) return;
                      const next = await restore.mutateAsync([tpl.id, v.n]);
                      setDraft(structuredClone(next.content));
                      setPeek(null);
                      toast({ title: t('mail.restored', { n: v.n, m: next.versions[0].n }), tone: 'ok' });
                    }}><RotateCcw className="size-4" /> {t('mail.restore')}</Button>
                  </>
                )}
              </li>
            ))}
          </ol>
          {peek && <div className="grid gap-2"><p className="text-[13px] font-medium">{t('mail.viewing', { n: peek.n })}</p><EmailPreview content={peek.content[lang]} lang={lang} kind={tpl.id} /></div>}
        </Card>
      )}

      <EmailBuilder value={draft} onChange={setDraft} kind={tpl.id} />

      <Card className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 p-3 shadow-3">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mail.versionNote')} className="!h-9 min-w-48 flex-1 text-sm" maxLength={120} aria-label={t('mail.versionNote')} />
        <Button disabled={!dirty} loading={save.isPending} onClick={async () => { const next = await save.mutateAsync([tpl.id, draft, note]); setDraft(structuredClone(next.content)); setNote(''); toast({ title: t('mail.saved', { n: next.versions[0].n }), tone: 'ok' }); }}>{t('mail.saveVersion')}</Button>
        <Button variant="quiet" disabled={!dirty} onClick={() => setDraft(structuredClone(tpl.content))}>{t('mail.discard')}</Button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await test.mutateAsync([testTo, draft[lang], lang, tpl.id]); toast({ title: t('mail.testSent', { to: r.to, status: t(`mail.status.${r.status}`) }), tone: r.status === 'delivered' ? 'ok' : undefined }); }}>
          <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="!h-9 !w-56 text-sm" aria-label={t('mail.testTo')} required />
          <Button type="submit" variant="ghost" loading={test.isPending}><Send className="size-4" /> {t('mail.sendTest')}</Button>
        </form>
        {error && <div className="w-full"><ErrorNote><ApiErrorMessage error={error} /></ErrorNote></div>}
      </Card>
    </div>
  );
}

export function TemplateEditorPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const templates = useEmailTemplates();
  const tpl = templates.data?.find((x) => x.id === id);
  useDocumentTitle(tpl ? t(`mail.trigger.${tpl.id}`) : t('mail.title'));
  if (templates.isLoading) return <Skeleton className="h-[70vh]" />;
  if (!tpl) return <ErrorNote>{t('mail.noTemplate')}</ErrorNote>;
  return <Editor key={`${tpl.id}-${tpl.versions[0]?.n}`} tpl={tpl} />;
}
