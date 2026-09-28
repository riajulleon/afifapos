import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, useAdminSettings, useApi, useCommissions, usePayouts, usePocOptions } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { PaymentIcon } from '../../components/PaymentIcon';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import type { CommissionSettings } from '../../domain/types';
import { toast } from '../../store/toasts';
import { eur } from '../../domain/money';
import { downloadCsv } from '../../lib/csv';
import { useDocumentTitle, useLang } from '../../lib/hooks';

/** COM-01: default rate and when a commission becomes payable. Rate changes apply to new orders only. */
function Rules({ value }: { value: CommissionSettings }) {
  const { t } = useTranslation();
  const save = useApi(api.updateSettings);
  const [pct, setPct] = useState(String(value.defaultPct).replace('.', ','));
  const [when, setWhen] = useState(value.payableWhen);
  const n = Number(pct.replace(',', '.'));
  const bad = !(n >= 0 && n <= 50);
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="font-medium">{t('com.rules')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('com.defaultRate')} htmlFor="com-rate" hint={t('com.defaultRateHint')} error={bad ? t('team.rateBad') : undefined}><Input id="com-rate" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} invalid={bad} /></Field>
        <Field label={t('com.payableWhen')} htmlFor="com-when">
          <Select id="com-when" value={when} onChange={(e) => setWhen(e.target.value as CommissionSettings['payableWhen'])}>
            <option value="paid">{t('com.when.paid')}</option>
            <option value="delivered">{t('com.when.delivered')}</option>
          </Select>
        </Field>
      </div>
      <p className="text-[13px] text-muted">{t('com.rulesNote')}</p>
      {save.error && <ErrorNote><ApiErrorMessage error={save.error} /></ErrorNote>}
      <div><Button disabled={bad} loading={save.isPending} onClick={async () => { await save.mutateAsync([{ commission: { defaultPct: n, payableWhen: when } }, `Commission rules: default ${value.defaultPct}% → ${n}%, payable when ${when}`]); toast({ title: t('admin.settings.saved'), tone: 'ok' }); }}>{t('common.save')}</Button></div>
    </Card>
  );
}

/** COM-05/06: what each person is owed right now, and every payout made. */
export function CommissionsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('com.title'));
  const entries = useCommissions();
  const payouts = usePayouts();
  const staff = usePocOptions();
  const settings = useAdminSettings();
  if (entries.isLoading || payouts.isLoading) return <Skeleton className="h-96" />;
  const all = entries.data ?? [];
  const people = [...new Set(all.map((e) => e.staffId))].map((id) => {
    const mine = all.filter((e) => e.staffId === id && e.status !== 'void');
    const sum = (s: string) => mine.filter((e) => e.status === s).reduce((a, e) => a + e.amountCents, 0);
    return { id, name: staff.data?.find((s) => s.id === id)?.fullName ?? id, pending: sum('pending'), payable: sum('payable'), paid: sum('paid'), lines: mine.filter((e) => e.status === 'payable').length };
  }).sort((a, b) => b.payable - a.payable);

  return (
    <div className="grid gap-5">
      <Link to="/admin/team" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('team.title')}</Link>
      <PageHeader
        title={t('com.title')}
        sub={t('com.sub', { when: t(`com.when.${settings.data?.commission.payableWhen ?? 'paid'}`), pct: settings.data?.commission.defaultPct ?? 0 })}
        actions={<Button variant="ghost" onClick={() => downloadCsv('commission-lines.csv', [['Date', 'Order', 'Reseller', 'Staff', 'Base EUR', 'Rate %', 'Commission EUR', 'Status', 'Payout'], ...all.map((e) => [e.romeDate, e.orderNumber, e.businessName, people.find((p) => p.id === e.staffId)?.name ?? e.staffId, (e.baseCents / 100).toFixed(2), e.pct, (e.amountCents / 100).toFixed(2), e.status, payouts.data?.find((p) => p.id === e.payoutId)?.number ?? ''])])}><Download className="size-4" /> CSV</Button>}
      />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="px-4 py-2.5 font-medium">{t('rep.col.member')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('com.status.pending')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('com.status.payable')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('com.paidToDate')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="num px-4 py-3 text-right text-muted">{eur(p.pending, lang)}</td>
                <td className="num px-4 py-3 text-right">{p.payable ? <b>{eur(p.payable, lang)}</b> : eur(0, lang)} {p.lines > 0 && <span className="text-xs text-muted">({t('com.linesN', { count: p.lines })})</span>}</td>
                <td className="num px-4 py-3 text-right">{eur(p.paid, lang)}</td>
                <td className="px-4 py-3 text-right"><Link to={`/admin/team/${p.id}`} className="inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2">{p.payable > 0 ? t('com.review') : t('com.open')}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {settings.data && <Rules key={JSON.stringify(settings.data.commission)} value={settings.data.commission} />}
      <Card className="grid gap-2 p-4">
        <h2 className="text-sm font-medium">{t('com.payoutHistory')}</h2>
        {(payouts.data ?? []).map((p) => (
          <Link key={p.id} to={`/admin/payouts/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-canvas">
            <span className="flex items-center gap-2"><PaymentIcon kind={p.kind} className="size-4 text-muted" /><b className="num font-medium">{p.number}</b> <span>{p.staffName}</span> <span className="text-muted">· {p.paidOn} · {p.reference}</span></span>
            <span className="flex items-center gap-3"><Pill tone="ok">{t('com.status.paid')}</Pill><b className="num">{eur(p.amountCents, lang)}</b><FileText className="size-4 text-muted" /></span>
          </Link>
        ))}
        {!payouts.data?.length && <p className="text-[13px] text-muted">{t('com.noPayouts')}</p>}
      </Card>
    </div>
  );
}
