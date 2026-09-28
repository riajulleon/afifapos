import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { usePublicSettings, useReport } from '../../api/queries';
import { ApiErrorMessage } from '../../components/ApiErrorMessage';
import { BarList, ColumnChart, Donut } from '../../components/charts';
import { DateRangeBar, rangeLabel, useDateRange } from '../../components/DateRange';
import { useCategoryList } from '../../components/ProductIcon';
import { Button, Card, ErrorNote, Skeleton } from '../../components/ui';
import { eur } from '../../domain/money';
import { addDays, formatRome } from '../../domain/romeTime';
import { REPORT_TYPES, type Cell, type Chart, type Fmt, type Grain, type Report, type ReportType } from '../../domain/reports';
import { downloadCsv } from '../../lib/csv';
import { useDocumentTitle, useLang } from '../../lib/hooks';
import { downloadXlsx, type XlsxKind } from '../../lib/xlsx';

/** Where a row's first cell links to (the commission report links its order column instead). */
const LINK_BASE: Partial<Record<ReportType, string>> = { orders: '/admin/orders/', resellers: '/admin/resellers/', team: '/admin/team/', products: '/admin/products/' };

export function ReportPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { type = 'sales' } = useParams();
  const valid = (REPORT_TYPES as readonly string[]).includes(type);
  const kind = (valid ? type : 'sales') as ReportType;
  const r = useDateRange('30');
  const report = useReport(kind, r.from, r.to, lang);
  const cats = useCategoryList();
  const brand = usePublicSettings().data?.branding.brandName ?? '';
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  useDocumentTitle(t(`rep.type.${kind}`));

  const locale = lang === 'it' ? 'it-IT' : 'en-GB';
  const dateFmt = (d: string, grain: Grain, full = false) => {
    if (!d) return '';
    if (/^\d{4}-\d{2}$/.test(d)) return new Intl.DateTimeFormat(locale, { month: full ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}-15T12:00:00Z`));
    const f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(full ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    if (grain === 'week') return full ? t('rep.weekOf', { d: f.format(new Date(`${d}T12:00:00Z`)), e: f.format(new Date(`${addDays(d, 6)}T12:00:00Z`)) }) : f.format(new Date(`${d}T12:00:00Z`));
    return f.format(new Date(`${d}T12:00:00Z`));
  };
  const num = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  const fmt = (f: Fmt, v: Cell, grain: Grain): string => {
    if (v === null || v === '') return '';
    switch (f) {
      case 'eur': return eur(Number(v), lang);
      case 'int': return num(Number(v));
      case 'pct': return `${num(Number(v) * 100)}%`;
      case 'hours': return t('rep.hours', { h: num(Number(v)) });
      case 'date': return dateFmt(String(v), grain);
      case 'status': return t(`status.${v}`);
      case 'pay': return t(`pay.${v}`);
      case 'channel': return t(`rep.series.${v}`);
      case 'comm': return t(`com.status.${v}`);
      default: return String(v);
    }
  };
  const itemLabel = (label: string, i18n?: boolean) => (i18n ? t(label) : label.startsWith('cat:') ? cats.name(label.slice(4)) : label);
  const seriesLabel = (key: string) => (['online', 'pos', 'invoiced', 'collected', 'paid', 'payable', 'pending'].includes(key) ? t(`rep.series.${key}`) : key);

  const rows = useMemo(() => {
    const data = report.data;
    if (!data) return [] as { row: Cell[]; link: string | null }[];
    const out = data.rows.map((row, i) => ({ row, link: data.links?.[i] ?? null }));
    if (sort) out.sort((a, b) => {
      const x = a.row[sort.col], y = b.row[sort.col];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))) * sort.dir;
    });
    return out;
  }, [report.data, sort]);

  if (!valid) return <ErrorNote>{t('rep.unknown')}</ErrorNote>;

  const title = t(`rep.type.${kind}`);
  const file = `${kind}-report-${r.from}-to-${r.to}`;
  const headers = (d: Report) => d.columns.map((c) => t(`rep.col.${c.key}`));
  const exportCsv = (d: Report) => downloadCsv(`${file}.csv`, [
    headers(d),
    ...d.rows.map((row) => row.map((v, i) => (d.columns[i].fmt === 'eur' ? (Number(v) / 100).toFixed(2) : d.columns[i].fmt === 'pct' ? (Number(v) * 100).toFixed(1) : fmt(d.columns[i].fmt, v, d.grain)))),
    ...(d.totals ? [d.totals.map((v, i) => (v === null || v === '' ? (i === 0 ? t('rep.total') : '') : d.columns[i].fmt === 'eur' ? (Number(v) / 100).toFixed(2) : d.columns[i].fmt === 'pct' ? (Number(v) * 100).toFixed(1) : String(v)))] : []),
  ]);
  const exportXlsx = (d: Report) => {
    const kindOf = (f: Fmt): XlsxKind => (f === 'eur' ? 'money' : f === 'pct' ? 'pct' : f === 'int' ? 'num' : f === 'hours' ? 'num' : 'text');
    const val = (f: Fmt, v: Cell) => (v === null || v === '' ? null : f === 'eur' ? Number(v) / 100 : f === 'pct' || f === 'int' || f === 'hours' ? Number(v) : fmt(f, v, d.grain));
    downloadXlsx(`${file}.xlsx`, {
      name: title,
      title: `${brand} · ${title} · ${rangeLabel(d.from, d.to, lang)}`,
      columns: d.columns.map((c, i) => ({ label: headers(d)[i], kind: kindOf(c.fmt) })),
      rows: d.rows.map((row) => row.map((v, i) => val(d.columns[i].fmt, v))),
      totals: d.totals ? d.totals.map((v, i) => (i === 0 && (v === '' || v === null) ? t('rep.total') : val(d.columns[i].fmt, v))) : null,
    });
  };

  const renderChart = (c: Chart, d: Report) => {
    const f = (v: number) => fmt(c.fmt, v, d.grain);
    switch (c.kind) {
      case 'bar':
      case 'line':
        return <ColumnChart buckets={c.buckets} stacked={c.kind === 'bar' && c.stacked} series={c.series.map((s) => ({ key: s.key, label: seriesLabel(s.key), values: s.values }))} format={f} bucketLabel={(b, full) => (/^\d{4}-\d{2}(-\d{2})?$/.test(b) ? dateFmt(b, d.grain, full) : b)} ariaLabel={t(`rep.chart.${c.key}`)} />;
      case 'hbar':
        return <BarList items={c.items.map((it) => ({ label: itemLabel(it.label, it.i18n), value: it.value }))} format={f} />;
      case 'donut':
        return <Donut items={c.items.map((it) => ({ label: itemLabel(it.label, it.i18n), value: it.value }))} format={f} otherLabel={t('rep.other')} center={t('rep.total')} />;
    }
  };

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t('rep.title')}</Link>
        <select value={kind} onChange={(e) => navigate(`/admin/reports/${e.target.value}${location.search}`)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px]" aria-label={t('rep.switch')}>
          {REPORT_TYPES.map((x) => <option key={x} value={x}>{t(`rep.type.${x}`)}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="hidden text-sm print:block">{brand}</p>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
          <p className="text-muted">{rangeLabel(r.from, r.to, lang)} · {t('rep.exclVat')}<span className="hidden print:inline"> · {t('rep.generated', { when: formatRome(new Date().toISOString(), lang) })}</span></p>
        </div>
        {report.data && (
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => exportCsv(report.data!)}><FileDown className="size-4" /> CSV</Button>
            <Button variant="ghost" size="sm" onClick={() => exportXlsx(report.data!)}><FileSpreadsheet className="size-4" /> Excel</Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()} title={t('invoice.pdfHint')}><FileDown className="size-4" /> PDF</Button>
            <Button size="sm" onClick={() => window.print()}><Printer className="size-4" /> {t('invoice.print')}</Button>
          </div>
        )}
      </div>
      <div className="no-print"><DateRangeBar r={r} /></div>
      {report.error && <ErrorNote><ApiErrorMessage error={report.error} /></ErrorNote>}
      {report.isLoading || !report.data ? (!report.error && <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>) : (() => {
        const d = report.data;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 print:grid-cols-3">
              {d.kpis.map((k) => (
                <div key={k.key} className="grid gap-0.5 rounded-xl border border-line bg-surface p-4 shadow-1 print:shadow-none">
                  <span className="text-[13px] text-muted">{t(`rep.kpi.${k.key}`)}</span>
                  <b className="num text-[20px] font-bold tracking-tight">{fmt(k.fmt, k.value, d.grain)}</b>
                </div>
              ))}
            </div>
            <div className={clsx('grid gap-3', d.charts.length > 1 && 'lg:grid-cols-[1.5fr_1fr]', 'print:grid-cols-1')}>
              {d.charts.map((c, i) => (
                <Card key={c.key} className={clsx('grid content-start gap-3 p-4 print:break-inside-avoid print:shadow-none', d.charts.length === 3 && i === 0 && 'lg:col-span-2')}>
                  <h2 className="flex items-baseline justify-between text-sm font-medium">{t(`rep.chart.${c.key}`)} {c.kind === 'bar' && <small className="font-normal text-muted">{t(`rep.grain.${d.grain}`)}</small>}</h2>
                  {renderChart(c, d)}
                </Card>
              ))}
            </div>
            <Card className="overflow-hidden print:shadow-none">
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <h2 className="text-sm font-medium">{t('rep.table')}</h2>
                <span className="text-[12.5px] text-muted">{t('rep.rows', { count: d.rows.length })}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr className="bg-surface-2 text-[11px] uppercase tracking-[.06em] text-muted">
                      {d.columns.map((c, i) => {
                        const right = ['eur', 'int', 'pct', 'hours'].includes(c.fmt);
                        return (
                          <th key={c.key} className={clsx('px-4 py-2.5 font-medium', right ? 'text-right' : 'text-left')} aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                            <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-fg" onClick={() => setSort((s) => (s?.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: right ? -1 : 1 }))}>
                              {t(`rep.col.${c.key}`)} {sort?.col === i && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map(({ row, link }, ri) => (
                      <tr key={ri} className="border-t border-line hover:bg-canvas">
                        {row.map((v, i) => {
                          const c = d.columns[i];
                          const right = ['eur', 'int', 'pct', 'hours'].includes(c.fmt);
                          const text = fmt(c.fmt, v, d.grain);
                          return (
                            <td key={i} className={clsx('px-4 py-2', right && 'num text-right', i === 0 && 'font-medium')}>
                              {i === 0 && link && LINK_BASE[kind] ? <Link to={`${LINK_BASE[kind]}${link}`} className="underline-offset-4 hover:underline">{text}</Link> : i === 1 && kind === 'commission' && link ? <Link to={`/admin/orders/${link}`} className="underline-offset-4 hover:underline">{text}</Link> : text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={d.columns.length} className="px-4 py-10 text-center text-muted">{t('rep.noData')}</td></tr>}
                  </tbody>
                  {d.totals && rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-line-strong bg-surface-2 font-bold">
                        {d.totals.map((v, i) => <td key={i} className={clsx('px-4 py-2.5', ['eur', 'int', 'pct', 'hours'].includes(d.columns[i].fmt) && 'num text-right')}>{i === 0 && (v === '' || v === null) ? t('rep.total') : fmt(d.columns[i].fmt, v, d.grain)}</td>)}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {rows.length > 500 && <p className="px-4 py-3 text-[12.5px] text-muted">{t('rep.truncated', { n: 500 })}</p>}
            </Card>
          </>
        );
      })()}
    </div>
  );
}
