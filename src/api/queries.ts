// TanStack Query hooks over the API. Swap `./mockServer` for the HTTP client in Phase 3; hooks stay the same.
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './mockServer';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof api.ApiError) && n < 2, refetchOnWindowFocus: false },
  },
});

// Any server change (this tab or another) refreshes cached data.
api.subscribe((e) => {
  if (e.type === 'changed' || e.type === 'order-placed') queryClient.invalidateQueries();
});

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity });
export const usePublicSettings = () => useQuery({ queryKey: ['public-settings'], queryFn: api.publicSettings });
export const useCities = () => useQuery({ queryKey: ['cities'], queryFn: api.cities });
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: api.products });
export const useDeals = (date?: string) => useQuery({ queryKey: ['deals', date ?? 'today'], queryFn: () => api.deals(date), refetchInterval: 60_000 });
export const useTopSellers = () => useQuery({ queryKey: ['top-sellers'], queryFn: () => api.topSellers(30) });
export const useBoughtToday = () => useQuery({ queryKey: ['bought-today'], queryFn: api.boughtToday });
export const useMyOrders = () => useQuery({ queryKey: ['my-orders'], queryFn: api.myOrders });
export const useOrder = (id: string) => useQuery({ queryKey: ['order', id], queryFn: () => api.order(id) });
export const useSellerDetails = () => useQuery({ queryKey: ['seller'], queryFn: api.sellerDetails });

export const useAdminOrders = () => useQuery({ queryKey: ['admin', 'orders'], queryFn: api.adminOrders });
export const useApplications = () => useQuery({ queryKey: ['admin', 'applications'], queryFn: api.applications });
export const useResellers = () => useQuery({ queryKey: ['admin', 'resellers'], queryFn: api.resellers });
export const useAdminSettings = () => useQuery({ queryKey: ['admin', 'settings'], queryFn: api.adminSettings });
export const useAdminCities = () => useQuery({ queryKey: ['admin', 'cities'], queryFn: api.adminCities });
export const useAdminProducts = () => useQuery({ queryKey: ['admin', 'products'], queryFn: api.adminProducts });
export const useAllDeals = () => useQuery({ queryKey: ['admin', 'deals'], queryFn: api.allDeals });
export const useAudit = () => useQuery({ queryKey: ['admin', 'audit'], queryFn: api.auditLog });

/** Wraps an API call in a mutation that refreshes everything afterwards. */
export function useApi<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export { api };

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: api.categories });
export const useRoles = () => useQuery({ queryKey: ['admin', 'roles'], queryFn: api.roles });
export const useStaffUsers = () => useQuery({ queryKey: ['admin', 'staff'], queryFn: api.staffUsers });
export const useReseller = (id: string) => useQuery({ queryKey: ['admin', 'reseller', id], queryFn: () => api.reseller(id), enabled: !!id });
