import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAudit } from '../../api/queries';
import { Button, PageHeader, Skeleton } from '../../components/ui';
import { formatRome } from '../../domain/romeTime';
import { downloadCsv } from '../../lib/csv';
import { useDocumentTitle, useLang } from '../../lib/hooks';

/** Append-only log of admin changes (X-05). */
export function AuditPage() {
  const { t } = useTranslation();
  const lang = useLang();
  useDocumentTitle(t('admin.nav.audit'));
  const log = useAudit();
  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('admin.nav.audit')}
        sub={t('admin.auditSub')}
        actions={<Button variant="ghost" onClick={() => downloadCsv('audit-log.csv', [['When (Rome)', 'Who', 'Change'], ...(log.data ?? []).map((a) => [formatRome(a.at, 'en'), a.actor, a.action])])}><Download className="size-4" /> {t('admin.exportCsv')}</Button>}
      />
      {log.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <ol className="overflow-hidden rounded-xl border border-line bg-surface shadow-1">
          {log.data!.map((a) => (
            <li key={a.id} className="grid gap-1 border-b border-line px-4 py-3 text-[13px] last:border-0 sm:grid-cols-[170px_140px_1fr]">
              <span className="num text-muted">{formatRome(a.at, lang)}</span>
              <b className="font-medium">{a.actor}</b>
              <span>{a.action}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
