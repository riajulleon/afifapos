import { ArrowLeft, Ban, FileUp, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api, useAdminCities, useAdminOrders, useApi, usePocOptions, useReseller } from '../../api/queries';
import type { ResellerInput } from '../../api/mockServer';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { DocChip } from '../../components/DocViewer';
import { PaymentPill, StatusPill } from '../../components/orderBits';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome, romeDateKey } from '../../domain/romeTime';
import type { Lang, User } from '../../domain/types';
import { putFile } from '../../lib/fileStore';
import { daysUntil } from '../../lib/image';
import { useCan, useDocumentTitle, useLang } from '../../lib/hooks';
import { rules, UPLOAD_ACCEPT } from '../../lib/validate';
import { toast } from '../../store/toasts';

const EMPTY: ResellerInput = { fullName: '', businessName: '', address: '', cityId: '', zoneId: '', email: '', mobile: '', vatNumber: '', fiscalCode: '', sdiOrPec: '', lang: 'it' };

function ProfileForm({ user, onSaved }: { user?: User; onSaved: (id: string) => void }) {
  const { t } = useTranslation();
  const cities = useAdminCities();
  const can = useCan();
  const update = useApi(api.updateReseller);
  const create = useApi(api.createReseller);
  const [f, setF] = useState<ResellerInput>(user ? { fullName: user.fullName, businessName: user.businessName, address: user.address, cityId: user.cityId, zoneId: user.zoneId, email: user.email, mobile: user.mobile, vatNumber: user.vatNumber, fiscalCode: user.fiscalCode, sdiOrPec: user.sdiOrPec, lang: user.lang } : EMPTY);
  const [password, setPassword] = useState('');
  const set = (k: keyof ResellerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'cityId' ? { zoneId: '' } : {}) }));
  const city = cities.data?.find((c) => c.id === f.cityId);
  const readOnly = user ? !can('resellers.edit') : !can('resellers.create');
  const error = update.error ?? create.error;
  const field = (k: keyof ResellerInput, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={`r-${k}`}><Input id={`r-${k}`} value={f[k]} onChange={set(k)} disabled={readOnly} {...extra} /></Field>
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (user) {
          await update.mutateAsync([user.id, f]);
          toast({ title: t('res.saved'), tone: 'ok' });
          onSaved(user.id);
        } else {
          const u = await create.mutateAsync([f, password]);
          toast({ title: t('res.created', { name: u.businessName }), tone: 'ok' });
          onSaved(u.id);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field('businessName', t('apply.businessName'))}
        {field('fullName', t('apply.fullName'))}
        {field('email', t('apply.email'), { type: 'email' })}
        {field('mobile', t('apply.mobile'), { inputMode: 'tel' })}
        <div className="sm:col-span-2">{field('address', t('apply.address'))}</div>
        <Field label={t('apply.city')} htmlFor="r-city"><Select id="r-city" value={f.cityId} onChange={set('cityId')} disabled={readOnly}><option value="">{t('apply.choose')}</option>{cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t('apply.zone')} htmlFor="r-zone"><Select id="r-zone" value={f.zoneId} onChange={set('zoneId')} disabled={readOnly || !city}><option value="">{t('apply.choose')}</option>{city?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
        {field('vatNumber', t('apply.vatNumber'))}
        {field('fiscalCode', t('apply.fiscalCode'))}
        {field('sdiOrPec', t('apply.sdiOrPec'))}
        <Field label={t('account.language')} htmlFor="r-lang"><Select id="r-lang" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value as Lang })} disabled={readOnly}><option value="it">Italiano</option><option value="en">English</option></Select></Field>
        {!user && (
          <Field label={t('staff.password')} htmlFor="r-pw" hint={t('res.passwordHint')} error={password && rules.password(password) ? t('v.password') : undefined}>
            <Input id="r-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        )}
      </div>
      {error && <ErrorNote><ApiErrorMessage error={error} /></ErrorNote>}
      {!readOnly && <div><Button type="submit" loading={update.isPending || create.isPending}>{user ? t('common.save') : t('res.create')}</Button></div>}
    </form>
  );
}

function Documents({ user }: { user: User }) {
  const { t } = useTranslation();
  const can = useCan();
  const add = useApi(api.addResellerDoc);
  const [err, setErr] = useState<string | null>(null);
  const docs = [
    ...(user.licenceDoc ? [{ doc: user.licenceDoc, label: t('apply.licence') }] : []),
    ...(user.vatDoc ? [{ doc: user.vatDoc, label: t('apply.vatDoc') }] : []),
    ...(user.extraDocs ?? []).map((doc) => ({ doc, label: t('docs.extra') })),
  ];
  return (
    <Card className="grid gap-3 p-5">
      <h2 className="font-medium">{t('docs.title')}</h2>
      {docs.length === 0 && <p className="text-sm text-muted">{t('docs.none')}</p>}
      {docs.map((d, i) => <DocChip key={i} doc={d.doc} label={d.label} />)}
      {can('resellers.edit') && (
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 justify-self-start rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
          <FileUp className="size-4" /> {t('docs.upload')}
          <input
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const bad = rules.file(file);
              if (bad) return setErr(t(bad));
              setErr(null);
              const fileId = await putFile(file);
              await add.mutateAsync([user.id, { name: file.name, size: file.size, type: file.type, fileId }]);
              toast({ title: t('docs.uploaded'), tone: 'ok' });
            }}
          />
        </label>
      )}
      {err && <p className="text-[12.5px] text-bad">{err}</p>}
    </Card>
  );
}

function Performance({ user }: { user: User }) {
  const { t } = useTranslation();
  const lang = useLang();
  const orders = useAdminOrders();
  const mine = useMemo(() => (orders.data ?? []).filter((o) => o.userId === user.id && o.status !== 'cancelled'), [orders.data, user.id]);
  if (orders.isLoading) return <Skeleton className="h-40" />;
  const revenue = mine.reduce((a, o) => a + o.subtotalCents, 0);
  const last = mine[0];
  const due = mine.reduce((a, o) => a + Math.max(0, o.totalCents - o.payments.reduce((x, p) => x + p.amountCents, 0)), 0);
  const stats = [
    [t('admin.kpi.orders'), String(mine.length)],
    [t('res.revenue'), eur(revenue, lang)],
    [t('admin.kpi.avg'), mine.length ? eur(Math.round(revenue / mine.length), lang) : '—'],
    [t('res.lastOrder'), last ? t('res.daysAgo', { count: -daysUntil(last.romeDate, romeDateKey()) }) : '—'],
    [t('res.due'), eur(due, lang)],
  ];
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="font-medium">{t('res.performance')}</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => <div key={k} className="grid gap-0.5"><dt className="text-xs text-muted">{k}</dt><dd className="num text-lg font-bold">{v}</dd></div>)}
      </dl>
      {mine.length > 0 && (
        <ul className="divide-y divide-line text-[13px]">
          {mine.slice(0, 5).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 py-2">
              <Link to={`/admin/orders/${o.id}`} className="num font-medium hover:underline">{o.number}</Link>
              <span className="text-muted">{formatRome(o.placedAt, lang, false)}</span>
              <StatusPill status={o.status} /><PaymentPill status={o.paymentStatus} />
              <b className="num ml-auto font-medium">{eur(o.totalCents, lang)}</b>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** TEAM-01/02: who looks after this reseller and earns commission on its new orders. */
function PointOfContact({ user }: { user: User }) {
  const { t } = useTranslation();
  const can = useCan();
  const staff = usePocOptions();
  const assign = useApi(api.assignPoc);
  const current = staff.data?.find((s) => s.id === user.pocId);
  return (
    <Card className="grid gap-3 p-5">
      <h2 className="font-medium">{t('team.poc')}</h2>
      {can('resellers.edit') ? (
        <Select value={user.pocId ?? ''} aria-label={t('team.poc')} disabled={assign.isPending}
          onChange={async (e) => { await assign.mutateAsync([[user.id], e.target.value || null]); toast({ title: t('team.pocSaved'), tone: 'ok' }); }}>
          <option value="">{t('team.noContact')}</option>
          {(staff.data ?? []).filter((s) => s.active || s.id === user.pocId).map((s) => <option key={s.id} value={s.id}>{s.fullName} · {s.roleName} · {s.commissionPct}%</option>)}
        </Select>
      ) : <p className="text-sm">{current ? `${current.fullName} · ${current.roleName}` : t('team.noContact')}</p>}
      {current && <Link to={`/admin/team/${current.id}`} className="text-[13px] underline underline-offset-4">{t('team.seePerformance', { name: current.fullName })}</Link>}
      <p className="text-[13px] text-muted">{t('team.pocNote')}</p>
      {assign.error && <ErrorNote><ApiErrorMessage error={assign.error} /></ErrorNote>}
    </Card>
  );
}

export function ResellerPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const r = useReseller(isNew ? '' : id);
  const can = useCan();
  const setActive = useApi(api.setResellerActive);
  const del = useApi(api.deleteReseller);
  const [confirmDelete, setConfirmDelete] = useState('');
  useDocumentTitle(isNew ? t('res.new') : r.data?.businessName);

  if (!isNew && r.isLoading) return <Skeleton className="h-96" />;
  if (!isNew && !r.data) return <ErrorNote><ApiErrorMessage error={r.error} /></ErrorNote>;
  const u = r.data;
  const pending = u && (u.state === 'pending' || u.state === 'info_requested');

  return (
    <div className="grid gap-5">
      <Link to={pending ? '/admin/approvals' : '/admin/resellers'} className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {pending ? t('admin.nav.approvals') : t('admin.nav.resellers')}</Link>
      <PageHeader
        title={isNew ? t('res.new') : u!.businessName}
        sub={isNew ? t('res.newSub') : `${u!.fullName} · ${u!.email}`}
        actions={u && <Pill tone={u.state === 'approved' ? 'ok' : u.state === 'suspended' || u.state === 'rejected' ? 'bad' : 'warn'}>{t(`admin.state.${u.state}`)}</Pill>}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <ProfileForm key={u ? JSON.stringify(u) : 'new'} user={u} onSaved={(nid) => isNew && navigate(`/admin/resellers/${nid}`, { replace: true })} />
        </Card>
        {u && (
          <div className="grid gap-5">
            <Documents user={u} />
            {!pending && <PointOfContact user={u} />}
            {pending &&<Card className="grid gap-2 p-5 text-sm"><p>{t('res.pendingNote')}</p><Link to="/admin/approvals" className="font-medium underline underline-offset-4">{t('res.goApprovals')}</Link></Card>}
            {!pending && can('resellers.edit') && (
              <Card className="grid gap-3 p-5">
                <h2 className="font-medium">{t('res.status')}</h2>
                <Button variant="ghost" className="justify-self-start" loading={setActive.isPending} onClick={async () => { await setActive.mutateAsync([u.id, u.state !== 'approved']); toast({ title: u.state === 'approved' ? t('res.deactivated') : t('res.reactivated'), tone: 'ok' }); }}>
                  {u.state === 'approved' ? <><Ban className="size-4" /> {t('res.deactivate')}</> : <><RotateCcw className="size-4" /> {t('res.reactivate')}</>}
                </Button>
                <p className="text-[13px] text-muted">{t('res.deactivateNote')}</p>
                {can('resellers.delete') && (
                  <div className="grid gap-2 border-t border-line pt-3">
                    <p className="text-[13px] text-muted">{t('res.deleteNote', { name: u.businessName })}</p>
                    <div className="flex flex-wrap gap-2">
                      <Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder={u.businessName} className="!h-9 max-w-64" aria-label={t('res.deleteType')} />
                      <Button variant="danger" disabled={confirmDelete.trim() !== u.businessName} loading={del.isPending} onClick={async () => { await del.mutateAsync([u.id]); toast({ title: t('res.deleted'), tone: 'ok' }); navigate('/admin/resellers'); }}><Trash2 className="size-4" /> {t('res.delete')}</Button>
                    </div>
                  </div>
                )}
                {(setActive.error || del.error) && <ErrorNote><ApiErrorMessage error={setActive.error ?? del.error} /></ErrorNote>}
              </Card>
            )}
          </div>
        )}
      </div>
      {u && !pending && <Performance user={u} />}
    </div>
  );
}
