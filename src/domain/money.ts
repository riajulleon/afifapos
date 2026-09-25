import type { Lang } from './types';

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats integer cents as EUR in the reader's locale: €1,284.60 (en) · 1.284,60 € (it). */
export function eur(cents: number, lang: Lang = 'en'): string {
  const locale = lang === 'it' ? 'it-IT' : 'en-IE';
  let f = formatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
    formatters.set(locale, f);
  }
  return f.format(cents / 100);
}

/** Parses a user-typed euro amount ("12", "12.5", "12,50") into cents. Returns null when invalid. */
export function parseEuro(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** Round half up to an integer (used for VAT per rate, VAT-04). */
export function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + 1e-9);
}
