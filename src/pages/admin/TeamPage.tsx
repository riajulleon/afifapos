import { ArrowRight, BadgeEuro, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useMe, useTeam } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { BarList } from '../../components/charts';
import { DateRangeBar, useDateRange } from '../../components/DateRange';
import { Card, EmptyState, ErrorNote, PageHeader, Pill, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { useCan, useDocumentTitle, useLang } from '../../lib/hooks';

/** TEAM-04: sales, commission and resellers per point of contact, for any date range. */
export function TeamPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const me = useMe();
  const navigate = useNavigate();
  const everyone = can('commissions.manage') || can('reports.view');
  useDocumentTitle(everyone ? t('team.title') : t('team.mine'));
  const r = useDateRange('month');
  const team = useTeam(r.from, r.to);
  const data = team.data ?? [];
  const sum = (f: (m: (typeof data)[number]) => number) => data.reduce((a, m) => a + f(m), 0);

  return (
    <div className="grid gap-5">
      <PageHeader
        title={everyone ? t('team.title') : t('team.mine')}
        sub={everyone ? t('team.sub') : t('team.mineSub')}
        actions={can('commissions.manage') && <Link to="/admin/commissions" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium hover:bg-surface-2"><BadgeEuro className="size-4" /> {t('team.payouts')}</Link>}
      />
      <DateRangeBar r={r} />
      {team.error && <ErrorNote><ApiErrorMessage error={team.error} /></ErrorNote>}
      {team.isLoading ? <Skeleton className="h-72" /> : !data.length ? (
        <EmptyState icon={<Users className="size-5" />} title={t('team.empty')} body={t('team.emptyBody')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={t('team.kpi.sales')} value={eur(sum((m) => m.salesCents), lang)} sub={t('team.kpi.salesSub')} />
            <Kpi label={t('team.kpi.orders')} value={String(sum((m) => m.orders))} />
            <Kpi label={t('team.kpi.earned')} value={eur(sum((m) => m.earnedCents), lang)} sub={t('team.kpi.earnedSub')} />
            <Kpi label={t('team.kpi.payable')} value={eur(sum((m) => m.payableCents), lang)} sub={t('team.kpi.payableSub')} />
          </div>
          {everyone && data.length > 1 && (
            <Card className="grid gap-3 p-4">
              <h2 className="text-sm font-medium">{t('team.salesByMember')}</h2>
              <BarList items={data.map((m) => ({ key: m.id, label: m.fullName, value: m.salesCents }))} format={(v) => eur(v, lang)} onPick={(id) => navigate(`/admin/team/${id}?${new URLSearchParams(location.search)}`)} />
            </Card>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {data.map((m) => (
              <Link key={m.id} to={`/admin/team/${m.id}${location.search}`} className="group grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-1 transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-sm font-bold">{m.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                    <span><b className="font-medium">{m.fullName}</b>{m.id === me.data?.id && <span className="ml-1.5 text-xs text-muted">({t('staff.you')})</span>}<br /><span className="text-[13px] text-muted">{m.roleName} · {t('team.rate', { pct: m.commissionPct })}</span></span>
                  </div>
                  {!m.active ? <Pill tone="muted">{t('staff.inactive')}</Pill> : m.payableCents > 0 ? <Pill tone="warn">{t('team.toPay', { v: eur(m.payableCents, lang) })}</Pill> : null}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-[13px]">
                  <div><dt className="text-muted">{t('team.kpi.sales')}</dt><dd className="num font-medium">{eur(m.salesCents, lang)}</dd></div>
                  <div><dt className="text-muted">{t('team.kpi.orders')}</dt><dd className="num font-medium">{m.orders}</dd></div>
                  <div><dt className="text-muted">{t('team.kpi.earned')}</dt><dd className="num font-medium">{eur(m.earnedCents, lang)}</dd></div>
                </dl>
                <p className="flex items-center justify-between text-[13px] text-muted">
                  <span>{t('team.resellers', { count: m.resellers.length })}{m.resellers.length ? `: ${m.resellers.slice(0, 3).map((x) => x.businessName).join(', ')}${m.resellers.length > 3 ? '…' : ''}` : ''}</span>
                  <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = 'text-muted' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border border-line bg-surface p-4 shadow-1">
      <span className="text-[13px] text-muted">{label}</span>
      <b className="num text-[22px] font-bold tracking-tight">{value}</b>
      {sub && <small className={`text-xs ${tone}`}>{sub}</small>}
    </div>
  );
}
