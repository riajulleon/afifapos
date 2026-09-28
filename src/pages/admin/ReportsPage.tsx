import { ArrowRight, BadgeEuro, Boxes, ClipboardList, Landmark, LineChart, Store, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../../components/ui';
import { REPORT_TYPES, type ReportType } from '../../domain/reports';
import { useDocumentTitle } from '../../lib/hooks';

export const REPORT_ICONS: Record<ReportType, typeof LineChart> = {
  sales: LineChart, revenue: Landmark, orders: ClipboardList, resellers: Store, team: UsersRound, commission: BadgeEuro, products: Boxes,
};

/** REP-01: one place for every report; each opens with a date range, charts, a table and exports. */
export function ReportsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('rep.title'));
  return (
    <div className="grid gap-5">
      <PageHeader title={t('rep.title')} sub={t('rep.sub')} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_TYPES.map((type) => {
          const Icon = REPORT_ICONS[type];
          return (
            <Link key={type} to={`/admin/reports/${type}`} className="group grid content-start gap-3 rounded-xl border border-line bg-surface p-5 shadow-1 transition-colors hover:border-line-strong">
              <span className="grid size-10 place-items-center rounded-lg bg-surface-2"><Icon className="size-5" /></span>
              <b className="flex items-center justify-between font-medium">{t(`rep.type.${type}`)} <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" /></b>
              <p className="text-[13px] text-muted">{t(`rep.desc.${type}`)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
