import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { addDays, romeDateKey } from '../domain/romeTime';
import { Input } from './ui';

export const RANGE_PRESETS = ['7', '30', '90', 'month', 'lastMonth', 'year', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export function presetRange(p: RangePreset, today = romeDateKey()): { from: string; to: string } {
  switch (p) {
    case '7': return { from: addDays(today, -6), to: today };
    case '30': return { from: addDays(today, -29), to: today };
    case '90': return { from: addDays(today, -89), to: today };
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const end = addDays(`${today.slice(0, 7)}-01`, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end };
    }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return { from: addDays(today, -29), to: today };
  }
}

/** Date range kept in the URL (?range=30 or ?from=…&to=…), so a report link opens on the same period. */
export function useDateRange(defaultPreset: RangePreset = '30') {
  const [params, setParams] = useSearchParams();
  const preset = (params.get('range') as RangePreset) ?? (params.get('from') ? 'custom' : defaultPreset);
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(custom.from) && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) && custom.from <= custom.to;
  const range = preset === 'custom' ? (valid ? custom : presetRange('30')) : presetRange(preset);
  const set = (next: { preset: RangePreset; from?: string; to?: string }) => {
    const p = new URLSearchParams(params);
    p.delete('range'); p.delete('from'); p.delete('to');
    if (next.preset === 'custom') { p.set('from', next.from ?? range.from); p.set('to', next.to ?? range.to); }
    else p.set('range', next.preset);
    setParams(p, { replace: true });
  };
  return { preset, ...range, set };
}

export function DateRangeBar({ r }: { r: ReturnType<typeof useDateRange> }) {
  const { t } = useTranslation();
  const today = romeDateKey();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-0.5" role="group" aria-label={t('range.label')}>
        {RANGE_PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => r.set({ preset: p })} aria-pressed={r.preset === p}
            className={clsx('h-7 rounded-md px-2.5 text-[13px] transition-colors', r.preset === p ? 'bg-inv-bg font-medium text-inv-fg' : 'text-muted hover:text-fg')}>
            {t(`range.${p}`)}
          </button>
        ))}
      </div>
      {r.preset === 'custom' && (
        <span className="flex items-center gap-1.5 text-[13px]">
          <Input type="date" value={r.from} max={r.to} onChange={(e) => e.target.value && r.set({ preset: 'custom', from: e.target.value, to: r.to })} className="!h-8 !w-40 text-[13px]" aria-label={t('range.from')} />
          –
          <Input type="date" value={r.to} min={r.from} max={today} onChange={(e) => e.target.value && r.set({ preset: 'custom', from: r.from, to: e.target.value })} className="!h-8 !w-40 text-[13px]" aria-label={t('range.to')} />
        </span>
      )}
    </div>
  );
}

export function rangeLabel(from: string, to: string, lang: 'en' | 'it') {
  const f = new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${f.format(new Date(`${from}T12:00:00Z`))} – ${f.format(new Date(`${to}T12:00:00Z`))}`;
}
