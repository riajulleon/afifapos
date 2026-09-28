import clsx from 'clsx';
import { ArrowLeft, FileText, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, useApi, useCommissions, usePayouts, usePocOptions, useResellers, useTeam } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { ColumnChart } from '../../components/charts';
import { DateRangeBar, useDateRange } from '../../components/DateRange';
import { PaymentIcon } from '../../components/PaymentIcon';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { addDays, romeDateKey } from '../../domain/romeTime';
import { PAYMENT_KINDS, type CommissionEntry, type PaymentKind } from '../../domain/types';
import { useCan, useDocumentTitle, useLang } from '../../lib/hooks';
import { norm } from '../../lib/text';
import { toast } from '../../store/toasts';
import { Kpi } from './TeamPage';

export const commTone = (s: CommissionEntry['status']) => (s === 'paid' ? 'ok' : s === 'payable' ? 'warn' : s === 'void' ? 'muted' : 'info');

function monthLabel(m: string, lang: 'en' | 'it', full = false) {
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { month: full ? 'long' : 'short', year: full ? 'numeric' : undefined, timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
}

/** Reassign resellers to this person (TEAM-02). */
function AssignResellers({ staffId, assigned, onDone }: { staffId: string; assigned: Set<string>; onDone: () => void }) {
  const { t } = useTranslation();
  const resellers = useResellers();
  const staff = usePocOptions();
  const assign = useApi(api.assignPoc);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const list = (resellers.data ?? []).filter((r) => r.state === 'approved' && !assigned.has(r.id) && (!q || norm(`${r.businessName} ${r.fullName}`).includes(norm(q))));
  return (
    <div className="grid gap-3 rounded-xl border border-line bg-canvas p-4">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('team.searchResellers')} className="!h-9 text-sm" aria-label={t('team.searchResellers')} />
      <ul className="grid max-h-56 gap-1 overflow-y-auto">
        {list.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2">
              <input type="checkbox" checked={pick.has(r.id)} onChange={() => setPick((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="size-4 accent-[var(--primary)]" />
              <b className="font-medium">{r.businessName}</b>
              <span className="text-muted">{r.pocId ? t('team.currently', { name: staff.data?.find((s) => s.id === r.pocId)?.fullName ?? '—' }) : t('team.noContact')}</span>
            </label>
          </li>
        ))}
        {!list.length && <li className="py-3 text-center text-[13px] text-muted">{t('team.nothingToAssign')}</li>}
      </ul>
      <p className="text-[12.5px] text-muted">{t('team.assignNote')}</p>
      {assign.error && <ErrorNote><ApiErrorMessage error={assign.error} /></ErrorNote>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!pick.size} loading={assign.isPending} onClick={async () => { await assign.mutateAsync([[...pick], staffId]); toast({ title: t('team.assigned', { count: pick.size }), tone: 'ok' }); onDone(); }}>{t('team.assign', { count: pick.size })}</Button>
        <Button size="sm" variant="quiet" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

/** COM-06: pay the ticked payable lines as one numbered payout. */
function PayoutForm({ staffId, entries, onDone }: { staffId: string; entries: CommissionEntry[]; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const create = useApi(api.createPayout);
  const [kind, setKind] = useState<PaymentKind>('bank');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(romeDateKey());
  const [note, setNote] = useState('');
  const total = entries.reduce((a, e) => a + e.amountCents, 0);
  return (
    <form
      className="grid gap-4 rounded-xl border border-line bg-canvas p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = await create.mutateAsync([{ staffId, entryIds: entries.map((x) => x.id), kind, reference, paidOn, note }]);
        toast({ title: t('com.paid', { n: p.number, v: eur(p.amountCents, lang) }), tone: 'ok', action: { label: t('com.statement'), to: `/admin/payouts/${p.id}` } });
        onDone();
      }}
    >
      <p className="text-sm">{t('com.payingLines', { count: entries.length })} <b className="num">{eur(total, lang)}</b></p>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label={t('admin.pay.method')} htmlFor="po-kind">
          <Select id="po-kind" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>{PAYMENT_KINDS.map((k) => <option key={k} value={k}>{t(`admin.pay.kind.${k}`)}</option>)}</Select>
        </Field>
        <Field label={t('admin.pay.reference')} htmlFor="po-ref"><Input id="po-ref" value={reference} onChange={(e) => setReference(e.target.value)} required /></Field>
        <Field label={t('com.paidOn')} htmlFor="po-date"><Input id="po-date" type="date" value={paidOn} max={romeDateKey()} onChange={(e) => setPaidOn(e.target.value)} required /></Field>
        <Field label={t('admin.note')} htmlFor="po-note"><Input id="po-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {total <= 0 && <p className="text-[13px] text-bad">{t('com.nothingToPay')}</p>}
      {create.error && <ErrorNote><ApiErrorMessage error={create.error} /></ErrorNote>}
      <div className="flex gap-2">
        <Button type="submit" disabled={total <= 0 || !reference.trim()} loading={create.isPending}>{t('com.recordPayout', { v: eur(total, lang) })}</Button>
        <Button type="button" variant="quiet" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export function TeamMemberPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const { id = '' } = useParams();
  const r = useDateRange('month');
  const team = useTeam(r.from, r.to);
  const entries = useCommissions(id);
  const payouts = usePayouts(id);
  const assign = useApi(api.assignPoc);
  const m = team.data?.find((x) => x.id === id);
  useDocumentTitle(m?.fullName);
  const [status, setStatus] = useState<'all' | CommissionEntry['status']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Last six months of attributed sales, from the commission lines (their base is the net sale).
  const months = useMemo(() => {
    const today = romeDateKey();
    const keys = Array.from({ length: 6 }, (_, i) => addDays(`${today.slice(0, 7)}-15`, -30 * (5 - i)).slice(0, 7));
    const sales = keys.map((k) => (entries.data ?? []).filter((e) => e.status !== 'void' && !e.adjustment && e.romeDate.startsWith(k)).reduce((a, e) => a + e.baseCents, 0));
    return { keys, sales };
  }, [entries.data]);

  if (team.isLoading || entries.isLoading) return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
  if (team.error) return <ErrorNote><ApiErrorMessage error={team.error} /></ErrorNote>;
  if (!m) return <ErrorNote>{t('team.notFound')}</ErrorNote>;

  const shown = (entries.data ?? []).filter((e) => (status === 'all' ? true : e.status === status) && e.romeDate >= r.from && e.romeDate <= r.to);
  const payable = (entries.data ?? []).filter((e) => e.status === 'payable');
  const chosen = payable.filter((e) => selected.has(e.id));
  const manage = can('commissions.manage');

  return (
    <div className="grid gap-5">
      <Link to={`/admin/team${location.search}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('team.title')}</Link>
      <PageHeader title={m.fullName} sub={`${m.roleName} · ${m.email} · ${t('team.rate', { pct: m.commissionPct })}`} />
      <DateRangeBar r={r} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('team.kpi.sales')} value={eur(m.salesCents, lang)} sub={t('team.kpi.ordersN', { count: m.orders })} />
        <Kpi label={t('team.kpi.earned')} value={eur(m.earnedCents, lang)} sub={t('team.kpi.earnedSub')} />
        <Kpi label={t('com.status.pending')} value={eur(m.pendingCents, lang)} sub={t('com.pendingSub')} />
        <Kpi label={t('team.kpi.payable')} value={eur(payable.reduce((a, e) => a + e.amountCents, 0), lang)} sub={t('com.payableAll')} tone={payable.length ? 'text-warn' : 'text-muted'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card className="grid gap-2 p-4">
          <h2 className="text-sm font-medium">{t('team.monthly')}</h2>
          <ColumnChart
            buckets={months.keys} stacked={false} height={220} ariaLabel={t('team.monthly')}
            series={[{ key: 'sales', label: t('team.kpi.sales'), values: months.sales }]}
            format={(v) => eur(v, lang)} bucketLabel={(b, full) => monthLabel(b, lang, full)}
          />
        </Card>
        <Card className="grid content-start gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t('team.resellers', { count: m.resellers.length })}</h2>
            {can('resellers.edit') && !assigning && <Button size="sm" variant="ghost" onClick={() => setAssigning(true)}><UserPlus className="size-4" /> {t('team.assignMore')}</Button>}
          </div>
          {assigning && <AssignResellers staffId={m.id} assigned={new Set(m.resellers.map((x) => x.id))} onDone={() => setAssigning(false)} />}
          <ul className="grid gap-1">
            {m.resellers.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-canvas">
                <Link to={`/admin/resellers/${x.id}`} className="min-w-0 truncate"><b className="font-medium">{x.businessName}</b> <span className="text-muted">· {x.cityName}</span></Link>
                {can('resellers.edit') && <Button size="sm" variant="quiet" onClick={() => assign.mutate([[x.id], null])} aria-label={t('team.unassign', { name: x.businessName })}><X className="size-4" /></Button>}
              </li>
            ))}
            {!m.resellers.length && <li className="text-[13px] text-muted">{t('team.noneAssigned')}</li>}
          </ul>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4">
          <h2 className="text-sm font-medium">{t('com.lines')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="!h-8 !w-44 text-[13px]" aria-label={t('com.filter')}>
              <option value="all">{t('com.all')}</option>
              {(['pending', 'payable', 'paid', 'void'] as const).map((s) => <option key={s} value={s}>{t(`com.status.${s}`)}</option>)}
            </Select>
            {manage && payable.length > 0 && !paying && (
              <Button size="sm" onClick={() => { setSelected(new Set(payable.map((e) => e.id))); setPaying(true); }}>{t('com.payAll', { v: eur(payable.reduce((a, e) => a + e.amountCents, 0), lang) })}</Button>
            )}
          </div>
        </div>
        {paying && <div className="px-4 pb-3"><PayoutForm staffId={m.id} entries={chosen} onDone={() => { setPaying(false); setSelected(new Set()); }} /></div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
                {paying && <th className="w-8 px-4 py-2.5" />}
                <th className="px-4 py-2.5 font-medium">{t('rep.col.date')}</th>
                <th className="px-4 py-2.5 font-medium">{t('rep.col.order')}</th>
                <th className="px-4 py-2.5 font-medium">{t('rep.col.customer')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('rep.col.base')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('rep.col.rate')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('rep.col.amount')}</th>
                <th className="px-4 py-2.5 font-medium">{t('rep.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 300).map((e) => (
                <tr key={e.id} className={clsx('border-t border-line', e.status === 'void' && 'text-muted')}>
                  {paying && <td className="px-4 py-2">{e.status === 'payable' && <input type="checkbox" checked={selected.has(e.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} className="size-4 accent-[var(--primary)]" aria-label={e.orderNumber} />}</td>}
                  <td className="num px-4 py-2">{e.romeDate}</td>
                  <td className="num px-4 py-2">{can('orders.view') ? <Link to={`/admin/orders/${e.orderId}`} className="underline-offset-4 hover:underline">{e.orderNumber}</Link> : e.orderNumber}{e.adjustment && <span className="ml-1.5 text-xs text-muted">({t('com.adjustment')})</span>}</td>
                  <td className="px-4 py-2">{e.businessName}</td>
                  <td className="num px-4 py-2 text-right">{eur(e.baseCents, lang)}</td>
                  <td className="num px-4 py-2 text-right">{e.pct}%</td>
                  <td className="num px-4 py-2 text-right font-medium">{eur(e.amountCents, lang)}</td>
                  <td className="px-4 py-2"><Pill tone={commTone(e.status)}>{t(`com.status.${e.status}`)}</Pill></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">{t('com.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="grid gap-2 p-4">
        <h2 className="text-sm font-medium">{t('com.payoutHistory')}</h2>
        {(payouts.data ?? []).map((p) => (
          <Link key={p.id} to={`/admin/payouts/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-canvas">
            <span className="flex items-center gap-2"><PaymentIcon kind={p.kind} className="size-4 text-muted" /><b className="num font-medium">{p.number}</b> <span className="text-muted">· {p.paidOn} · {p.reference}</span></span>
            <span className="flex items-center gap-3"><b className="num">{eur(p.amountCents, lang)}</b><FileText className="size-4 text-muted" /></span>
          </Link>
        ))}
        {!payouts.data?.length && <p className="text-[13px] text-muted">{t('com.noPayouts')}</p>}
      </Card>
    </div>
  );
}
