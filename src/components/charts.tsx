// Small SVG charts for the reports hub and dashboards. Colour is identity only: legends and tables carry the
// values, text stays in text colours, and series use the fixed --series-N order (see styles/index.css).
import clsx from 'clsx';
import { useId, useState, type ReactNode } from 'react';

export const seriesColor = (i: number) => `var(--series-${(i % 5) + 1})`;
export const OTHER = 'var(--series-other)';

/** Four equal steps of 1, 2, 2.5 or 5 × 10ⁿ covering the maximum. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  const raw = Math.max(max, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

/** Column with a 4px rounded data end and a square baseline. */
function colPath(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return '';
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} aria-hidden />
          <span className="text-fg">{it.label}</span>
          {it.value && <span className="num">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

interface ColumnsProps {
  buckets: string[];
  series: { key: string; label: string; values: number[] }[];
  stacked: boolean;
  format: (v: number) => string;
  /** Short axis label for a bucket; `full` is used in the tooltip. */
  bucketLabel: (b: string, full?: boolean) => string;
  height?: number;
  ariaLabel: string;
}

/** Vertical bars over time or categories: grouped or stacked, one y-axis from zero, per-column tooltip. */
export function ColumnChart({ buckets, series, stacked, format, bucketLabel, height = 240, ariaLabel }: ColumnsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 56, R = 8, T = 12, B = 28;
  const totals = buckets.map((_, i) => (stacked ? series.reduce((a, s) => a + Math.max(0, s.values[i]), 0) : Math.max(0, ...series.map((s) => s.values[i]))));
  const { top, ticks } = niceScale(Math.max(...totals, 0));
  const band = (W - L - R) / Math.max(1, buckets.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const groupW = Math.min(stacked ? 24 : 24 * series.length + 2 * (series.length - 1), band * 0.72);
  const barW = stacked ? groupW : Math.max(1, (groupW - 2 * (series.length - 1)) / series.length);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));
  const compact = (v: number) => {
    const s = format(v);
    return s.replace(/,00(?=\s?€)|\.00(?=$)/, '');
  };
  return (
    <div className="relative grid gap-3" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{compact(v)}</text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = L + band * i + band / 2;
          let acc = 0;
          return (
            <g key={b} opacity={hover === null || hover === i ? 1 : 0.45}>
              {series.map((s, j) => {
                const v = Math.max(0, s.values[i]);
                if (stacked) {
                  const y0 = y(acc), y1 = y(acc + v);
                  acc += v;
                  const isTop = series.slice(j + 1).every((n) => !(n.values[i] > 0));
                  // 2px surface gap between stacked segments.
                  const h = Math.max(0, y0 - y1 - (j > 0 && v > 0 ? 2 : 0));
                  return <path key={s.key} d={colPath(cx - barW / 2, y1, barW, h, isTop)} fill={seriesColor(j)} />;
                }
                const x = cx - groupW / 2 + j * (barW + 2);
                return <path key={s.key} d={colPath(x, y(v), barW, y(0) - y(v), true)} fill={seriesColor(j)} />;
              })}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{bucketLabel(b)}</text>
              )}
              <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 grid min-w-44 gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-2"
          style={{ left: `${Math.min(78, Math.max(2, ((L + band * hover + band / 2) / W) * 100 - 10))}%` }}
          role="status"
        >
          <b className="font-medium">{bucketLabel(buckets[hover], true)}</b>
          {series.map((s, j) => (
            <span key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-[2px]" style={{ background: seriesColor(j) }} />{s.label}</span>
              <span className="num">{format(s.values[hover])}</span>
            </span>
          ))}
          {stacked && series.length > 1 && <span className="flex justify-between gap-4 border-t border-line pt-1 font-medium"><span>Σ</span><span className="num">{format(totals[hover])}</span></span>}
        </div>
      )}
      {series.length > 1 && <Legend items={series.map((s, j) => ({ label: s.label, color: seriesColor(j) }))} />}
    </div>
  );
}

/** Ranked horizontal bars (one series): label, bar, value at the tip. */
export function BarList({ items, format, onPick }: { items: { label: string; value: number; key?: string }[]; format: (v: number) => string; onPick?: (key: string) => void }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">—</p>;
  return (
    <ul className="grid gap-2">
      {items.map((it) => {
        const row = (
          <>
            <span className="truncate" title={it.label}>{it.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden><span className="block h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: seriesColor(0) }} /></span>
            <span className="num text-right text-muted">{format(it.value)}</span>
          </>
        );
        const cls = 'grid grid-cols-[minmax(90px,38%)_1fr_auto] items-center gap-3 text-[13px]';
        return (
          <li key={it.key ?? it.label}>
            {onPick && it.key ? <button type="button" onClick={() => onPick(it.key!)} className={clsx(cls, 'w-full rounded-md text-left hover:bg-canvas')}>{row}</button> : <div className={cls}>{row}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Part-to-whole ring: four largest slices plus "Other", legend with shares. */
export function Donut({ items, format, otherLabel, center }: { items: { label: string; value: number }[]; format: (v: number) => string; otherLabel: string; center?: ReactNode }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const slices = sorted.length > 5 ? [...sorted.slice(0, 4), { label: otherLabel, value: sorted.slice(4).reduce((a, i) => a + i.value, 0) }] : sorted;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const colorOf = (i: number) => (slices[i].label === otherLabel && sorted.length > 5 ? OTHER : seriesColor(i));
  const R = 70, r = 46, C = 80;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const a = (s.value / (total || 1)) * Math.PI * 2;
    const gap = slices.length > 1 ? 0.025 : 0; // surface gap between slices
    const a0 = angle + gap / 2, a1 = angle + a - gap / 2;
    angle += a;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    const d = slices.length === 1
      ? `M${C - R},${C}A${R},${R} 0 1 1 ${C + R},${C}A${R},${R} 0 1 1 ${C - R},${C}M${C - r},${C}A${r},${r} 0 1 0 ${C + r},${C}A${r},${r} 0 1 0 ${C - r},${C}Z`
      : `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
    return { d, i };
  });
  if (!total) return <p className="py-6 text-center text-sm text-muted">—</p>;
  return (
    <div className="flex flex-wrap items-center gap-5" onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 160 160" className="size-40 shrink-0" role="img" aria-labelledby={gid}>
        {arcs.map(({ d, i }) => (
          <path key={i} d={d} fill={colorOf(i)} fillRule="evenodd" opacity={hover === null || hover === i ? 1 : 0.4} onMouseEnter={() => setHover(i)} />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)" className="num">{hover === null ? format(total) : `${Math.round((slices[hover].value / total) * 100)}%`}</text>
        <text x={C} y={C + 15} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{hover === null ? center : slices[hover].label.slice(0, 18)}</text>
      </svg>
      <ul id={gid} className="grid min-w-44 flex-1 gap-1.5 text-[13px]">
        {slices.map((s, i) => (
          <li key={s.label} className={clsx('grid grid-cols-[10px_1fr_auto_40px] items-center gap-2 rounded px-1', hover === i && 'bg-surface-2')} onMouseEnter={() => setHover(i)}>
            <span className="size-2.5 rounded-[3px]" style={{ background: colorOf(i) }} aria-hidden />
            <span className="truncate">{s.label}</span>
            <span className="num text-muted">{format(s.value)}</span>
            <span className="num text-right text-muted">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
