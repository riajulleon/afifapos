import { code128Modules } from '../lib/code128';

/**
 * Code 128 barcode as vector SVG, with the number printed under it (DOC-04/05).
 * Printed at 38 × 13 mm minimum with a 10-module quiet zone each side, so any 1D scanner reads it.
 */
export function Barcode({ value, className, height = 44 }: { value: string; className?: string; height?: number }) {
  const modules = code128Modules(value);
  const quiet = 10;
  const total = modules.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  const bars: { x: number; w: number }[] = [];
  modules.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg viewBox={`0 0 ${total} ${height + 14}`} className={className} style={{ minWidth: '38mm' }} role="img" aria-label={`Barcode ${value}`}>
      <rect width={total} height={height + 14} fill="#fff" />
      {bars.map((b) => <rect key={b.x} x={b.x} y={0} width={b.w} height={height} fill="#000" />)}
      <text x={total / 2} y={height + 11} textAnchor="middle" fontSize="10" fontFamily="Roboto, Arial, sans-serif" letterSpacing="1" fill="#000">
        {value}
      </text>
    </svg>
  );
}
