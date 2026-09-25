import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: 'default' | 'ok' | 'bad';
  action?: { label: string; to: string };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    // Max 3 on screen (spec: notifications).
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t);
