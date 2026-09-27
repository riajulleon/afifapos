import clsx from 'clsx';
import { ArrowLeft, Download, FileUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, useApi } from '../../api/queries';
import type { ImportRowResult, ResellerInput } from '../../api/mockServer';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { Button, Card, ErrorNote, PageHeader, Pill } from '../../components/ui';
import type { Lang } from '../../domain/types';
import { downloadCsv } from '../../lib/csv';
import { parseCsv } from '../../lib/csvParse';
import { useDocumentTitle } from '../../lib/hooks';
import { toast } from '../../store/toasts';

/** Column order of the template (RES-01). City and zone accept names ("Roma", "Ostia"). */
const COLUMNS = ['business_name', 'contact_name', 'email', 'mobile', 'address', 'city', 'zone', 'vat_number', 'fiscal_code', 'sdi_or_pec', 'language'] as const;

function toInput(cells: Record<string, string>): ResellerInput {
  return {
    businessName: cells.business_name ?? '', fullName: cells.contact_name ?? '', email: cells.email ?? '', mobile: cells.mobile ?? '',
    address: cells.address ?? '', cityId: cells.city ?? '', zoneId: cells.zone ?? '', vatNumber: cells.vat_number ?? '',
    fiscalCode: cells.fiscal_code ?? '', sdiOrPec: cells.sdi_or_pec ?? '', lang: (cells.language?.trim().toLowerCase() === 'en' ? 'en' : 'it') as Lang,
  };
}

export function ResellerImportPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('imp.title'));
  const run = useApi(api.importResellers);
  const [rows, setRows] = useState<ResellerInput[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportRowResult[] | null>(null);
  const [state, setState] = useState<'approved' | 'pending'>('approved');
  const [done, setDone] = useState<ImportRowResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setErr(null);
    setDone(null);
    const grid = parseCsv(await file.text());
    const header = (grid[0] ?? []).map((h) => h.trim().toLowerCase());
    const missing = COLUMNS.filter((c) => c !== 'language' && !header.includes(c));
    if (missing.length) return setErr(t('imp.missingCols', { cols: missing.join(', ') }));
    const data = grid.slice(1).map((r) => toInput(Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))));
    if (!data.length) return setErr(t('imp.empty'));
    setFileName(file.name);
    setRows(data);
    setPreview(await run.mutateAsync([data, { commit: false, state }]));
  };

  const counts = preview ? { ready: preview.filter((r) => r.status === 'ready').length, warning: preview.filter((r) => r.status === 'warning').length, error: preview.filter((r) => r.status === 'error').length } : null;

  return (
    <div className="grid gap-5">
      <Link to="/admin/resellers" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('admin.nav.resellers')}</Link>
      <PageHeader title={t('imp.title')} sub={t('imp.sub')} />
      <Card className="grid gap-4 p-5">
        <ol className="grid gap-3 text-sm">
          <li className="flex flex-wrap items-center gap-3"><b className="font-medium">1.</b> {t('imp.step1')}
            <Button size="sm" variant="ghost" onClick={() => downloadCsv('resellers-template.csv', [[...COLUMNS], ['Mini Market Esempio', 'Mario Rossi', 'mario@esempio.it', '347 000 1111', 'Via Roma 1, 00100 Roma', 'Roma', 'Esquilino', 'IT12345678901', '12345678901', 'ABC1234', 'it']])}><Download className="size-4" /> {t('imp.template')}</Button>
          </li>
          <li className="flex flex-wrap items-center gap-3"><b className="font-medium">2.</b> {t('imp.step2')}
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-2">
              <FileUp className="size-4" /> {fileName || t('imp.choose')}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
            </label>
          </li>
          <li><b className="font-medium">3.</b> {t('imp.step3')}</li>
        </ol>
        {err && <ErrorNote>{err}</ErrorNote>}
        {run.error && <ErrorNote><ApiErrorMessage error={run.error} /></ErrorNote>}
      </Card>

      {preview && counts && !done && (
        <Card className="grid gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Pill tone="ok">{t('imp.ready', { count: counts.ready })}</Pill>
            <Pill tone="warn">{t('imp.warning', { count: counts.warning })}</Pill>
            <Pill tone="bad">{t('imp.error', { count: counts.error })}</Pill>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-left text-[11px] uppercase tracking-[.06em] text-muted"><th className="px-3 py-2 font-medium">{t('imp.row')}</th><th className="px-3 py-2 font-medium">{t('apply.businessName')}</th><th className="px-3 py-2 font-medium">{t('apply.email')}</th><th className="px-3 py-2 font-medium">{t('imp.result')}</th></tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.row} className={clsx('border-t border-line', r.status === 'error' && 'bg-bad-soft/50')}>
                    <td className="num px-3 py-2 text-muted">{r.row}</td>
                    <td className="px-3 py-2">{r.input.businessName || '—'}</td>
                    <td className="px-3 py-2">{r.input.email || '—'}</td>
                    <td className="px-3 py-2"><Pill tone={r.status === 'ready' ? 'ok' : r.status === 'warning' ? 'warn' : 'bad'}>{t(`imp.status.${r.status}`)}</Pill> <span className="text-muted">{r.message}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="flex flex-wrap gap-5 text-sm">
            <legend className="mb-1.5 text-[13px] font-medium text-muted">{t('imp.createAs')}</legend>
            <label className="flex items-center gap-2"><input type="radio" name="imp-state" checked={state === 'approved'} onChange={() => setState('approved')} className="accent-[var(--primary)]" /> {t('admin.state.approved')}</label>
            <label className="flex items-center gap-2"><input type="radio" name="imp-state" checked={state === 'pending'} onChange={() => setState('pending')} className="accent-[var(--primary)]" /> {t('admin.state.pending')}</label>
          </fieldset>
          <div className="flex gap-2">
            <Button disabled={counts.ready + counts.warning === 0} loading={run.isPending} onClick={async () => { const res = await run.mutateAsync([rows!, { commit: true, state }]); setDone(res); toast({ title: t('imp.done', { count: counts.ready + counts.warning }), tone: 'ok' }); }}>
              {t('imp.import', { count: counts.ready + counts.warning })}
            </Button>
            <Button variant="quiet" onClick={() => { setPreview(null); setRows(null); setFileName(''); }}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}

      {done && (
        <Card className="grid gap-3 p-5 text-sm">
          <p>{t('imp.summary', { created: done.filter((r) => r.status !== 'error').length, skipped: done.filter((r) => r.status === 'error').length })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => downloadCsv('import-result.csv', [['row', 'business_name', 'email', 'result', 'message'], ...done.map((r) => [r.row, r.input.businessName, r.input.email, r.status === 'error' ? 'skipped' : 'created', r.message])])}><Download className="size-4" /> {t('imp.resultFile')}</Button>
            <Link to="/admin/resellers" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover">{t('admin.nav.resellers')}</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
