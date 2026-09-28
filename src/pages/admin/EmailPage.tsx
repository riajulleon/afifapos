import clsx from 'clsx';
import { Megaphone, Pencil, RefreshCw, Search, Send, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { api, useAdminSettings, useApi, useCampaigns, useEmailLogs, useEmailTemplates } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import { EMAIL_TRIGGERS, type EmailLog, type EmailStatus, type EmailTheme, type Settings, type SmtpSettings } from '../../domain/types';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { compact, norm } from '../../lib/text';
import { toast } from '../../store/toasts';

type Tab = 'log' | 'templates' | 'campaigns' | 'setup';
const TABS: Tab[] = ['log', 'templates', 'campaigns', 'setup'];

export const statusTone = (s: EmailStatus) => (s === 'delivered' || s === 'opened' ? 'ok' : s === 'bounced' || s === 'failed' ? 'bad' : 'info');

/* ---------- log (MAIL-06) ---------- */

function LogDrawer({ log, onClose }: { log: EmailLog; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const resend = useApi(api.resendEmail);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside role="dialog" aria-modal="true" aria-label={log.subject} initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }} transition={{ duration: 0.22 }} onClick={(e) => e.stopPropagation()}
        className="grid h-full w-full max-w-2xl grid-rows-[auto_auto_1fr] gap-3 overflow-hidden bg-surface p-5 shadow-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{log.subject}</h2>
            <p className="text-[13px] text-muted">{t('mail.to')} {log.toName} &lt;{log.to}&gt; · {formatRome(log.at, lang)}</p>
          </div>
          <Button size="sm" variant="quiet" onClick={onClose} aria-label={t('common.close')}><X className="size-4" /></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <ol className="grid gap-1 text-[12.5px]">
            {log.events.map((e, i) => (
              <li key={i} className="flex items-center gap-2"><Pill tone={statusTone(e.status)}>{t(`mail.status.${e.status}`)}</Pill><span className="num text-muted">{formatRome(e.at, lang)}</span>{e.detail && <code className="text-muted">{e.detail}</code>}</li>
            ))}
            {log.error && <li className="text-bad">{log.error}</li>}
          </ol>
          <div className="flex flex-wrap content-start gap-2">
            {log.orderId && <Link to={`/admin/orders/${log.orderId}`} className="inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2">{t('mail.openOrder')}</Link>}
            {(log.status === 'failed' || log.status === 'bounced') && (
              <Button size="sm" loading={resend.isPending} onClick={async () => { const r = await resend.mutateAsync([log.id]); toast({ title: t('mail.resent', { status: t(`mail.status.${r.status}`) }), tone: r.status === 'delivered' ? 'ok' : undefined }); onClose(); }}><RefreshCw className="size-4" /> {t('mail.resend')}</Button>
            )}
          </div>
          {resend.error && <ErrorNote><ApiErrorMessage error={resend.error} /></ErrorNote>}
        </div>
        <iframe title={log.subject} srcDoc={log.html} sandbox="" className="size-full rounded-lg border border-line bg-white" />
      </motion.aside>
    </motion.div>
  );
}

function LogTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const logs = useEmailLogs();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | EmailStatus>('all');
  const [kind, setKind] = useState<string>('all');
  const [open, setOpen] = useState<EmailLog | null>(null);
  const all = logs.data ?? [];
  const list = useMemo(() => all.filter((l) => (status === 'all' || l.status === status) && (kind === 'all' || l.kind === kind) && (!q || norm(`${l.to} ${l.toName} ${l.subject}`).includes(norm(q)) || compact(l.subject).includes(compact(q)))), [all, q, status, kind]);
  if (logs.isLoading) return <Skeleton className="h-96" />;
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = all.filter((l) => Date.parse(l.at) > weekAgo);
  const pct = (n: number) => (recent.length ? `${Math.round((n / recent.length) * 100)}%` : '—');
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [t('mail.kpi.sent'), String(recent.length)],
          [t('mail.kpi.delivered'), pct(recent.filter((l) => l.status === 'delivered' || l.status === 'opened').length)],
          [t('mail.kpi.opened'), pct(recent.filter((l) => l.status === 'opened').length)],
          [t('mail.kpi.problems'), String(recent.filter((l) => l.status === 'bounced' || l.status === 'failed').length)],
        ].map(([k, v]) => <div key={k} className="grid gap-0.5 rounded-xl border border-line bg-surface p-4 shadow-1"><span className="text-[13px] text-muted">{k}</span><b className="num text-[22px] font-bold">{v}</b><small className="text-xs text-muted">{t('mail.kpi.week')}</small></div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mail.search')} className="!h-9 pl-9 text-sm" aria-label={t('mail.search')} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="!h-9 !w-44 text-sm" aria-label={t('mail.statusCol')}>
          <option value="all">{t('mail.allStatuses')}</option>
          {(['delivered', 'opened', 'bounced', 'failed'] as const).map((s) => <option key={s} value={s}>{t(`mail.status.${s}`)}</option>)}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!h-9 !w-56 text-sm" aria-label={t('mail.kindCol')}>
          <option value="all">{t('mail.allKinds')}</option>
          {[...EMAIL_TRIGGERS, 'campaign', 'test'].map((k) => <option key={k} value={k}>{t(`mail.trigger.${k}`)}</option>)}
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="px-4 py-2.5 font-medium">{t('mail.sentAt')}</th><th className="px-4 py-2.5 font-medium">{t('mail.to')}</th><th className="px-4 py-2.5 font-medium">{t('mail.subject')}</th><th className="px-4 py-2.5 font-medium">{t('mail.kindCol')}</th><th className="px-4 py-2.5 font-medium">{t('mail.statusCol')}</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 200).map((l) => (
              <tr key={l.id} className="cursor-pointer border-t border-line hover:bg-canvas" onClick={() => setOpen(l)}>
                <td className="num whitespace-nowrap px-4 py-2.5 text-muted">{formatRome(l.at, lang)}</td>
                <td className="px-4 py-2.5"><b className="font-medium">{l.toName}</b><br /><span className="text-muted">{l.to}</span></td>
                <td className="max-w-80 px-4 py-2.5"><button type="button" className="truncate text-left underline-offset-4 hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(l); }}>{l.subject}</button></td>
                <td className="px-4 py-2.5 text-muted">{t(`mail.trigger.${l.kind}`)}</td>
                <td className="px-4 py-2.5"><Pill tone={statusTone(l.status)}>{t(`mail.status.${l.status}`)}</Pill></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">{t('mail.noEmails')}</td></tr>}
          </tbody>
        </table>
      </div>
      {list.length > 200 && <p className="text-[12.5px] text-muted">{t('mail.showingFirst', { n: 200, total: list.length })}</p>}
      <AnimatePresence>{open && <LogDrawer log={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

/* ---------- templates (MAIL-02) ---------- */

function TemplatesTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const templates = useEmailTemplates();
  const toggle = useApi(api.setTemplateEnabled);
  if (templates.isLoading) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted">{t('mail.templatesNote')}</p>
      {toggle.error && <ErrorNote><ApiErrorMessage error={toggle.error} /></ErrorNote>}
      {templates.data!.map((tpl) => (
        <Card key={tpl.id} className="flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <b className="font-medium">{t(`mail.trigger.${tpl.id}`)}</b>
            <p className="truncate text-[13px] text-muted">{tpl.content[lang].subject}</p>
            <p className="text-[12px] text-muted">{t('mail.versionInfo', { n: tpl.versions[0]?.n ?? 1, by: tpl.versions[0]?.savedBy ?? '', when: formatRome(tpl.versions[0]?.savedAt ?? new Date().toISOString(), lang, false) })}</p>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" role="switch" checked={tpl.enabled} onChange={(e) => toggle.mutate([tpl.id, e.target.checked])} className="size-4 accent-[var(--primary)]" />
            {tpl.enabled ? t('mail.on') : t('mail.off')}
          </label>
          <Link to={`/admin/emails/templates/${tpl.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2"><Pencil className="size-4" /> {t('common.edit')}</Link>
        </Card>
      ))}
    </div>
  );
}

/* ---------- announcements (MAIL-07) ---------- */

function CampaignsTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const campaigns = useCampaigns();
  const logs = useEmailLogs();
  if (campaigns.isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">{t('mail.campaignsNote')}</p>
        <Link to="/admin/emails/campaigns/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover"><Megaphone className="size-4" /> {t('mail.newCampaign')}</Link>
      </div>
      {campaigns.data!.map((c) => {
        const mine = (logs.data ?? []).filter((l) => l.campaignId === c.id);
        const ok = mine.filter((l) => l.status === 'delivered' || l.status === 'opened').length;
        const bad = mine.filter((l) => l.status === 'bounced' || l.status === 'failed').length;
        return (
          <Card key={c.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <b className="font-medium">{c.name}</b>
              <p className="truncate text-[13px] text-muted">{c.content[lang].subject}</p>
              <p className="text-[12px] text-muted">{t('mail.sentBy', { who: c.sentBy, when: formatRome(c.sentAt, lang) })}</p>
            </div>
            <span className="flex flex-wrap gap-1.5">
              <Pill tone="info">{t('mail.recipients', { count: c.recipients })}</Pill>
              <Pill tone="ok">{t('mail.deliveredN', { n: ok })}</Pill>
              {bad > 0 && <Pill tone="bad">{t('mail.problemsN', { n: bad })}</Pill>}
              {c.skippedOptOut > 0 && <Pill tone="muted">{t('mail.optedOutN', { n: c.skippedOptOut })}</Pill>}
            </span>
          </Card>
        );
      })}
      {!campaigns.data!.length && <p className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">{t('mail.noCampaigns')}</p>}
    </div>
  );
}

/* ---------- setup: SMTP (MAIL-01) and look ---------- */

function SmtpCard({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const save = useApi(api.saveSmtp);
  const test = useApi(api.testSmtp);
  const [f, setF] = useState<Omit<SmtpSettings, 'passwordSet'>>({ ...s.smtp, password: '' });
  const [to, setTo] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{t('mail.smtp')}</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} className="size-4 accent-[var(--primary)]" /> {f.enabled ? t('mail.on') : t('mail.off')}</label>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('mail.host')} htmlFor="smtp-host" className="md:col-span-2"><Input id="smtp-host" value={f.host} onChange={(e) => set('host', e.target.value)} placeholder="smtp.example.com" autoComplete="off" /></Field>
        <Field label={t('mail.port')} htmlFor="smtp-port"><Input id="smtp-port" inputMode="numeric" value={String(f.port)} onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '')) || 0)} /></Field>
        <Field label={t('mail.security')} htmlFor="smtp-sec">
          <Select id="smtp-sec" value={f.security} onChange={(e) => { const v = e.target.value as SmtpSettings['security']; set('security', v); set('port', v === 'ssl' ? 465 : v === 'tls' ? 587 : 25); }}>
            <option value="tls">STARTTLS (587)</option><option value="ssl">SSL/TLS (465)</option><option value="none">{t('mail.noEncryption')}</option>
          </Select>
        </Field>
        <Field label={t('mail.username')} htmlFor="smtp-user"><Input id="smtp-user" value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" /></Field>
        <Field label={t('auth.password')} htmlFor="smtp-pw" hint={s.smtp.passwordSet ? t('mail.passwordKept') : t('mail.passwordNone')}><Input id="smtp-pw" type="password" value={f.password ?? ''} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder={s.smtp.passwordSet ? '••••••••' : ''} /></Field>
        <Field label={t('mail.fromName')} htmlFor="smtp-fn"><Input id="smtp-fn" value={f.fromName} onChange={(e) => set('fromName', e.target.value)} /></Field>
        <Field label={t('mail.fromEmail')} htmlFor="smtp-fe"><Input id="smtp-fe" type="email" value={f.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} /></Field>
        <Field label={t('mail.replyTo')} htmlFor="smtp-rt"><Input id="smtp-rt" type="email" value={f.replyTo} onChange={(e) => set('replyTo', e.target.value)} /></Field>
      </div>
      {f.security === 'none' && <p className="text-[13px] text-warn">{t('mail.noEncryptionWarn')}</p>}
      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div><Button loading={save.isPending} onClick={async () => { await save.mutateAsync([f]); setF((x) => ({ ...x, password: '' })); toast({ title: t('admin.settings.saved'), tone: 'ok' }); }}>{t('common.save')}</Button></div>
      <div className="grid gap-2 border-t border-line pt-4">
        <span className="text-[13px] font-medium text-muted">{t('mail.testConnection')}</span>
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await test.mutateAsync([to]); toast({ title: t('mail.testResult', { status: t(`mail.status.${r.status}`) }), body: r.error, tone: r.status === 'delivered' ? 'ok' : undefined }); }}>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" className="!h-9 max-w-72 text-sm" aria-label={t('mail.testTo')} required />
          <Button type="submit" size="sm" variant="ghost" loading={test.isPending}><Send className="size-4" /> {t('mail.sendTest')}</Button>
        </form>
        <p className="text-[12px] text-muted">{t('mail.testNote')}</p>
        {test.error && <ErrorNote><ApiErrorMessage error={test.error} /></ErrorNote>}
      </div>
    </Card>
  );
}

function ThemeCard({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const save = useApi(api.updateSettings);
  const [th, setTh] = useState<EmailTheme>(s.emailTheme);
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="font-medium">{t('mail.look')}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={th.showLogo} onChange={(e) => setTh({ ...th, showLogo: e.target.checked })} className="size-4 accent-[var(--primary)]" /> {t('mail.showLogo')}</label>
        <Field label={t('mail.accent')} htmlFor="th-acc"><span className="flex items-center gap-2"><input id="th-acc" type="color" value={th.accent} onChange={(e) => setTh({ ...th, accent: e.target.value })} className="h-9 w-12 rounded border border-line-strong bg-surface" /><code className="text-[13px]">{th.accent}</code></span></Field>
        <Field label={t('mail.background')} htmlFor="th-bg"><span className="flex items-center gap-2"><input id="th-bg" type="color" value={th.background} onChange={(e) => setTh({ ...th, background: e.target.value })} className="h-9 w-12 rounded border border-line-strong bg-surface" /><code className="text-[13px]">{th.background}</code></span></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(['en', 'it'] as const).map((l) => (
          <Field key={l} label={`${t('mail.footer')} (${l.toUpperCase()})`} htmlFor={`th-f-${l}`}>
            <textarea id={`th-f-${l}`} rows={3} value={th.footer[l]} onChange={(e) => setTh({ ...th, footer: { ...th.footer, [l]: e.target.value } })} className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-fg focus:ring-[3px] focus:ring-[var(--ring)]" />
          </Field>
        ))}
      </div>
      <p className="text-[12.5px] text-muted">{t('mail.lookNote')}</p>
      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div><Button loading={save.isPending} onClick={async () => { await save.mutateAsync([{ emailTheme: th }, `Email look: accent ${th.accent}, background ${th.background}, logo ${th.showLogo ? 'on' : 'off'}`]); toast({ title: t('admin.settings.saved'), tone: 'ok' }); }}>{t('common.save')}</Button></div>
    </Card>
  );
}

function SetupTab() {
  const settings = useAdminSettings();
  if (settings.isLoading) return <Skeleton className="h-96" />;
  const key = JSON.stringify(settings.data!.emailTheme) + JSON.stringify(settings.data!.smtp);
  return <div className="grid gap-4"><SmtpCard key={`s${key}`} s={settings.data!} /><ThemeCard key={`t${key}`} s={settings.data!} /></div>;
}

export function EmailPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('mail.title'));
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'log') as Tab;
  return (
    <div className="grid gap-5">
      <PageHeader title={t('mail.title')} sub={t('mail.sub')} />
      <p role="note" className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">{t('mail.demoBanner')}</p>
      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map((x) => (
          <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setParams(x === 'log' ? {} : { tab: x }, { replace: true })} className={clsx('-mb-px h-10 whitespace-nowrap border-b-2 px-3 text-sm transition-colors', tab === x ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t(`mail.tab.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'log' && <LogTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'setup' && <SetupTab />}
    </div>
  );
}
