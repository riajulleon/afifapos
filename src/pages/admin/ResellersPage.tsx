import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminCities, useAdminOrders, useResellers } from '../../api/queries';
import { PageHeader, Pill, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { formatRome } from '../../domain/romeTime';
import { useDocumentTitle, useLang } from '../../lib/hooks';

export function ResellersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.resellers'));
  const users = useResellers();
  const orders = useAdminOrders();
  const cities = useAdminCities();
  const stats = useMemo(() => {
    const m = new Map<string, { total: number; count: number; last: string }>();
    for (const o of orders.data ?? []) {
      if (o.status === 'cancelled') continue;
      const s = m.get(o.userId) ?? { total: 0, count: 0, last: '' };
      s.total += o.subtotalCents;
      s.count += 1;
      if (o.placedAt > s.last) s.last = o.placedAt;
      m.set(o.userId, s);
    }
    return m;
  }, [orders.data]);
  if (users.isLoading) return <Skeleton className="h-96" />;
  const rows = [...(users.data ?? [])].sort((a, b) => (stats.get(b.id)?.total ?? 0) - (stats.get(a.id)?.total ?? 0));
  return (
    <div className="grid gap-5">
      <PageHeader title={t('admin.nav.resellers')} sub={t('admin.resellersSub', { count: rows.length })} />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-1">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="px-4 py-2.5 font-medium">{t('apply.businessName')}</th>
              <th className="px-4 py-2.5 font-medium">{t('apply.city')}</th>
              <th className="px-4 py-2.5 font-medium">{t('admin.stateCol')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('admin.kpi.orders')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('admin.lifetime')}</th>
              <th className="px-4 py-2.5 font-medium">{t('admin.lastOrder')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const s = stats.get(u.id);
              const city = cities.data?.find((c) => c.id === u.cityId);
              return (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2.5"><b className="font-medium">{u.businessName}</b><br /><span className="text-muted">{u.fullName} · {u.email}</span></td>
                  <td className="px-4 py-2.5 text-muted">{city?.name} › {city?.zones.find((z) => z.id === u.zoneId)?.name}</td>
                  <td className="px-4 py-2.5"><Pill tone={u.state === 'approved' ? 'ok' : u.state === 'rejected' || u.state === 'suspended' ? 'bad' : 'warn'}>{t(`admin.state.${u.state}`)}</Pill></td>
                  <td className="num px-4 py-2.5 text-right">{s?.count ?? 0}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{eur(s?.total ?? 0, lang)}</td>
                  <td className="px-4 py-2.5 text-muted">{s?.last ? formatRome(s.last, lang, false) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
