import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartState {
  items: Record<string, number>; // productId → cases
  add: (productId: string, qty: number) => void;
  set: (productId: string, qty: number) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      add: (id, qty) => set((s) => ({ items: { ...s.items, [id]: (s.items[id] ?? 0) + qty } })),
      set: (id, qty) =>
        set((s) => {
          const items = { ...s.items };
          if (qty <= 0) delete items[id];
          else items[id] = qty;
          return { items };
        }),
      clear: () => set({ items: {} }),
    }),
    { name: 'afifa-cart' },
  ),
);

export const cartCount = (items: Record<string, number>) => Object.values(items).reduce((a, b) => a + b, 0);
