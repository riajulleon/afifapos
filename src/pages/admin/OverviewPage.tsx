import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAdminOrders, useApplications } from '../../api/queries';
import { PaymentPill, StatusPill } from '../../components/orderBits';
import { Card, PageHeader, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { addDays, romeDateKey } from '../../domain/romeTime';
import type { Order } from '../../domain/types';
import { useDocumentTitle, useLang } from '../../lib/hooks';

/** Weekly revenue, last 12 weeks, one line with an area fill and the endpoint marked. */
function RevenueChart({ orders }: { orders: Order[] }) {
  const lang = useLang();
  const today = romeDateKey();
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = addDays(today, -7 * (11 - i));
    const start = addDays(end, -6);
    const cents = orders.filter((o) => o.status !== 'cancelled' && o.romeDate >= start && o.romeDate <= end).reduce((a, o) => a + o.subtotalCents, 0);
    return { end, value: cents / 100 };
  });
  const W = 560, H = 200, L = 44, R = 16, T = 16, B = 26;
  // Round axis: four equal steps of 1, 2, 2.5 or 5 × 10ⁿ that cover the highest week.
  const rawStep = Math.max(250, Math.max(...weeks.map((w) => w.value)) / 4);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep)!;
  const top = step * 4;
  const x = (i: number) => L + (i * (W - L - R)) / 11;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const pts = weeks.map((w, i) => `${x(i)},${y(w.value)}`).join(' ');
  const last = weeks[11];
  const k = (v: number) => (v >= 1000 ? `€${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `€${v}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly revenue, last 12 weeks">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)" className="num">{k(v)}</text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${pts} ${x(11)},${y(0)}`} fill="var(--text)" fillOpacity="0.07" />
      <polyline points={pts} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(11)} cy={y(last.value)} r="4.5" fill="var(--text)" stroke="var(--surface)" strokeWidth="2" />
      <text x={x(11) - 8} y={y(last.value) - 10} textAnchor="end" fontSize="11" fontWeight="500" fill="var(--text)" className="num">{eur(Math.round(last.value * 100), lang)}</text>
      {weeks.map((w, i) => i % 2 === 1 && (
        <text key={w.end} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
          {new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${w.end}T12:00:00Z`))}
        </text>
      ))}
    </svg>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.overview'));
  const orders = useAdminOrders();
  const apps = useApplications();

  const stats = useMemo(() => {
    const all = (orders.data ?? []).filter((o) => o.status !== 'cancelled');
    const month = romeDateKey().slice(0, 7);
    const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
    const dayOfMonth = Number(romeDateKey().slice(8, 10));
    const mtd = all.filter((o) => o.romeDate.startsWith(month));
    const prev = all.filter((o) => o.romeDate.startsWith(prevMonth) && Number(o.romeDate.slice(8, 10)) <= dayOfMonth);
    const sum = (xs: Order[]) => xs.reduce((a, o) => a + o.subtotalCents, 0);
    const byCity = new Map<string, number>();
    mtd.forEach((o) => byCity.set(o.cityName, (byCity.get(o.cityName) ?? 0) + o.subtotalCents));
    const cityTotal = sum(mtd) || 1;
    return {
      revenue: sum(mtd),
      revenueDelta: sum(prev) ? (sum(mtd) - sum(prev)) / sum(prev) : null,
      count: mtd.length,
      avg: mtd.length ? Math.round(sum(mtd) / mtd.length) : 0,
      awaiting: all.filter((o) => o.paymentStatus === 'awaiting').length,
      cities: [...byCity.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, share: v / cityTotal, v })),
    };
  }, [orders.data]);

  if (orders.isLoading) return <div className="grid gap-4"><Skeleton className="h-10 w-60" /><Skeleton className="h-28" /><Skeleton className="h-72" /></div>;

  const kpis = [
    { label: t('admin.kpi.revenue'), value: eur(stats.revenue, lang), sub: stats.revenueDelta === null ? '' : t('admin.kpi.vsPrev', { pct: `${stats.revenueDelta >= 0 ? '▲' : '▼'} ${Math.abs(stats.revenueDelta * 100).toFixed(1)}%` }), tone: stats.revenueDelta !== null && stats.revenueDelta < 0 ? 'text-bad' : 'text-ok' },
    { label: t('admin.kpi.orders'), value: String(stats.count), sub: t('admin.kpi.monthToDate'), tone: 'text-muted' },
    { label: t('admin.kpi.avg'), value: eur(stats.avg, lang), sub: t('admin.kpi.exclVat'), tone: 'text-muted' },
    { label: t('admin.kpi.awaiting'), value: String(stats.awaiting), sub: t('admin.kpi.awaitingSub'), tone: stats.awaiting ? 'text-warn' : 'text-muted', to: '/admin/orders?pay=awaiting' },
    { label: t('admin.kpi.approvals'), value: String(apps.data?.length ?? 0), sub: t('admin.kpi.approvalsSub'), tone: apps.data?.length ? 'text-warn' : 'text-muted', to: '/admin/approvals' },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.overview')} sub={t('admin.overviewSub')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="text-[13px] text-muted">{k.label}</span>
              <b className="num text-[22px] font-bold tracking-tight">{k.value}</b>
              <small className={`text-xs font-medium ${k.tone}`}>{k.sub}</small>
            </>
          );
          return k.to ? (
            <Link key={k.label} to={k.to} className="grid gap-0.5 rounded-xl border border-line bg-surface p-4 shadow-1 transition-colors hover:border-line-strong">{body}</Link>
          ) : (
            <div key={k.label} className="grid gap-0.5 rounded-xl border border-line bg-surface p-4 shadow-1">{body}</div>
          );
        })}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card className="grid gap-2 p-4">
          <h2 className="flex items-baseline justify-between text-sm font-medium">{t('admin.weekly')} <small className="font-normal text-muted">{t('admin.weeklySub')}</small></h2>
          <RevenueChart orders={orders.data ?? []} />
        </Card>
        <Card className="grid content-start gap-3 p-4">
          <h2 className="flex items-baseline justify-between text-sm font-medium">{t('admin.byCity')} <small className="font-normal text-muted">{t('admin.kpi.monthToDate')}</small></h2>
          {stats.cities.map((c) => (
            <div key={c.name} className="grid grid-cols-[72px_1fr_48px] items-center gap-2 text-[13px]">
              <span className="truncate">{c.name}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-fg" style={{ width: `${c.share * 100}%` }} /></div>
              <span className="num text-right text-muted">{Math.round(c.share * 100)}%</span>
            </div>
          ))}
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-sm font-medium">{t('admin.latest')}</h2>
          <Link to="/admin/orders" className="text-[13px] underline underline-offset-4">{t('admin.allOrders')}</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <tbody>
              {(orders.data ?? []).slice(0, 6).map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-canvas">
                  <td className="num px-4 py-2.5"><Link to={`/admin/orders/${o.id}`} className="font-medium underline-offset-4 hover:underline">{o.number}</Link></td>
                  <td className="py-2.5 pr-3">{o.businessName}</td>
                  <td className="py-2.5 pr-3 text-muted">{o.cityName}</td>
                  <td className="py-2.5 pr-3"><StatusPill status={o.status} /></td>
                  <td className="py-2.5 pr-3"><PaymentPill status={o.paymentStatus} /></td>
                  <td className="num px-4 py-2.5 text-right font-medium">{eur(o.totalCents, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
