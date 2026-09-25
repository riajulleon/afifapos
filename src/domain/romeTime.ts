// Rome-time helpers (X-01). All instants are stored in UTC; business rules use Europe/Rome wall time.

export const ROME_TZ = 'Europe/Rome';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ROME_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function romeParts(instant: Date) {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Rome calendar date of an instant, as YYYY-MM-DD. */
export function romeDateKey(instant: Date = new Date()): string {
  const p = romeParts(instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Offset of Rome from UTC at an instant, in ms (+1h in winter, +2h in summer). */
function romeOffsetMs(instant: Date): number {
  const p = romeParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of a Rome wall-clock time. Correct across the DST changes in March and October (DEAL-05). */
export function romeWallTimeToUtc(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = wallAsUtc - romeOffsetMs(new Date(wallAsUtc));
  guess = wallAsUtc - romeOffsetMs(new Date(guess));
  return new Date(guess);
}

/** Adds whole days to a YYYY-MM-DD key. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export const DEAL_START = '08:00:00';
export const DEAL_END = '23:59:59';

export function dealWindow(dateKey: string) {
  return {
    start: romeWallTimeToUtc(dateKey, DEAL_START),
    // End is inclusive of 23:59:59, so the window closes at the next second.
    end: new Date(romeWallTimeToUtc(dateKey, DEAL_END).getTime() + 1000),
  };
}

export function formatRome(iso: string, lang: 'en' | 'it', withTime = true): string {
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
    timeZone: ROME_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));
}
