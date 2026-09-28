import clsx from 'clsx';
import { ArrowLeft, Megaphone, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, useAdminCities, useApi, useMe, usePocOptions, useResellers } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { EmailBuilder } from '../../components/EmailBuilder';
import { Button, Card, ErrorNote, Field, Input, PageHeader } from '../../components/ui';
import { defaultCampaign } from '../../domain/email';
import type { Audience, EmailContent, Lang } from '../../domain/types';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { norm } from '../../lib/text';
import { toast } from '../../store/toasts';

const KINDS: Audience['kind'][] = ['all', 'city', 'poc', 'selected'];

/** MAIL-07: an announcement to a chosen group of approved resellers. Opted-out resellers are skipped. */
export function CampaignPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  useDocumentTitle(t('mail.newCampaign'));
  const me = useMe();
  const cities = useAdminCities();
  const staff = usePocOptions();
  const resellers = useResellers();
  const send = useApi(api.sendCampaign);
  const test = useApi(api.sendTestEmail);
  const [name, setName] = useState('');
  const [content, setContent] = useState<Record<Lang, EmailContent>>(defaultCampaign);
  const [audience, setAudience] = useState<Audience>({ kind: 'all' });
  const [size, setSize] = useState<{ recipients: number; optedOut: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    api.audienceSize(audience).then((s) => live && setSize(s)).catch(() => live && setSize(null));
    return () => { live = false; };
  }, [audience]);

  const ids = (a: Audience) => (a.kind === 'city' ? a.cityIds : a.kind === 'poc' ? a.staffIds : a.kind === 'selected' ? a.userIds : []);
  const toggle = (id: string) => {
    const cur = new Set(ids(audience));
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    const list = [...cur];
    setAudience(audience.kind === 'city' ? { kind: 'city', cityIds: list } : audience.kind === 'poc' ? { kind: 'poc', staffIds: list } : { kind: 'selected', userIds: list });
  };
  const options = audience.kind === 'city' ? (cities.data ?? []).map((c) => ({ id: c.id, label: c.name }))
    : audience.kind === 'poc' ? (staff.data ?? []).filter((s) => s.active).map((s) => ({ id: s.id, label: s.fullName }))
    : audience.kind === 'selected' ? (resellers.data ?? []).filter((r) => r.state === 'approved' && (!q || norm(r.businessName).includes(norm(q)))).map((r) => ({ id: r.id, label: `${r.businessName}${r.marketingOptOut ? ` · ${t('mail.optedOut')}` : ''}` }))
    : [];

  return (
    <div className="grid gap-5">
      <Link to="/admin/emails?tab=campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('mail.tab.campaigns')}</Link>
      <PageHeader title={t('mail.newCampaign')} sub={t('mail.campaignSub')} />
      <Card className="grid gap-4 p-5">
        <Field label={t('mail.campaignName')} htmlFor="cmp-name" hint={t('mail.campaignNameHint')}><Input id="cmp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <div className="grid gap-2">
          <span className="text-[13px] font-medium text-muted">{t('mail.audience')}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('mail.audience')}>
            {KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={audience.kind === k} onClick={() => setAudience(k === 'all' ? { kind: 'all' } : k === 'city' ? { kind: 'city', cityIds: [] } : k === 'poc' ? { kind: 'poc', staffIds: [] } : { kind: 'selected', userIds: [] })}
                className={clsx('h-8 rounded-full border px-3 text-[13px]', audience.kind === k ? 'border-fg bg-inv-bg text-inv-fg' : 'border-line-strong hover:bg-surface-2')}>{t(`mail.aud.${k}`)}</button>
            ))}
          </div>
          {audience.kind === 'selected' && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('team.searchResellers')} className="!h-9 max-w-80 text-sm" aria-label={t('team.searchResellers')} />}
          {options.length > 0 && (
            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
              {options.map((o) => (
                <label key={o.id} className={clsx('flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px]', ids(audience).includes(o.id) ? 'border-fg bg-surface-2' : 'border-line-strong')}>
                  <input type="checkbox" checked={ids(audience).includes(o.id)} onChange={() => toggle(o.id)} className="size-3.5 accent-[var(--primary)]" /> {o.label}
                </label>
              ))}
            </div>
          )}
          {size && <p className="text-[13px]"><b className="num">{t('mail.recipients', { count: size.recipients })}</b>{size.optedOut > 0 && <span className="text-muted"> · {t('mail.optedOutN', { n: size.optedOut })}</span>}</p>}
        </div>
        <p className="text-[12.5px] text-muted">{t('mail.unsubNote')}</p>
      </Card>

      <EmailBuilder value={content} onChange={setContent} kind="campaign" />

      <Card className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 p-3 shadow-3">
        {confirming ? (
          <>
            <span className="text-sm">{t('mail.confirmSend', { count: size?.recipients ?? 0 })}</span>
            <Button loading={send.isPending} onClick={async () => { const c = await send.mutateAsync([{ name, content, audience }]); toast({ title: t('mail.campaignSent', { count: c.recipients }), tone: 'ok' }); navigate('/admin/emails?tab=campaigns'); }}><Send className="size-4" /> {t('mail.sendNow')}</Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
          </>
        ) : (
          <>
            <Button disabled={!name.trim() || !size?.recipients} onClick={() => setConfirming(true)}><Megaphone className="size-4" /> {t('mail.reviewSend')}</Button>
            <Button variant="ghost" loading={test.isPending} onClick={async () => { const r = await test.mutateAsync([me.data?.email ?? '', content[lang], lang, 'campaign']); toast({ title: t('mail.testSent', { to: r.to, status: t(`mail.status.${r.status}`) }) }); }}><Send className="size-4" /> {t('mail.testToMe')}</Button>
          </>
        )}
        {(send.error || test.error) && <div className="w-full"><ErrorNote><ApiErrorMessage error={send.error ?? test.error} /></ErrorNote></div>}
      </Card>
    </div>
  );
}
