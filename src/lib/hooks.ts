import { useEffect, useMemo } from 'react';
import { useBoughtToday, useDeals, useMe, useProducts, usePublicSettings } from '../api/queries';
import { isDealLive } from '../domain/pricing';
import { dealWindow, romeDateKey } from '../domain/romeTime';
import type { Deal, Product } from '../domain/types';
import { usePrefs } from '../store/prefs';
import { useNow } from './useNow';

/** Today's deals with live state, window and a product lookup. `now` ticks every second. */
export function useSale(tickMs = 1000) {
  const now = useNow(tickMs);
  const me = useMe();
  const approved = me.data?.state === 'approved';
  const deals = useDeals();
  const products = useProducts();
  const today = romeDateKey(now);
  const window = useMemo(() => dealWindow(today), [today]);
  const all = deals.data ?? [];
  const live = approved ? all.filter((d) => isDealLive(d, now)) : [];
  const byProduct = new Map<string, Deal>(live.map((d) => [d.productId, d]));
  const productById = new Map<string, Product>((products.data ?? []).map((p) => [p.id, p]));
  const beforeStart = now < window.start && all.length > 0;
  return { now, live, all, byProduct, productById, window, beforeStart, loading: deals.isLoading || products.isLoading };
}

export function useAllowanceLeft() {
  const bought = useBoughtToday();
  return (deal: Deal) => {
    const byLimit = Math.max(0, deal.perResellerLimit - (bought.data?.[deal.productId] ?? 0));
    const byStock = deal.stockCap === null ? Infinity : Math.max(0, deal.stockCap - deal.sold);
    return Math.min(byLimit, byStock);
  };
}

/** Keeps the browser tab title in sync with Settings › Appearance (BRAND-01). */
export function useDocumentTitle(page?: string) {
  const settings = usePublicSettings();
  const title = settings.data?.branding.siteTitle ?? 'Afifa Wholesale';
  useEffect(() => {
    document.title = page ? `${page} · ${title}` : title;
  }, [page, title]);
}

export const useLang = () => usePrefs((s) => s.lang);

export const discountPct = (regularCents: number, saleCents: number) => Math.round(((regularCents - saleCents) / regularCents) * 100);
