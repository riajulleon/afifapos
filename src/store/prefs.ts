import { create } from 'zustand';
import type { Lang } from '../domain/types';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  return attr === 'dark' ? 'dark' : 'light';
}

function readLang(): Lang {
  try {
    const v = localStorage.getItem('afifa-lang');
    if (v === 'en' || v === 'it') return v;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
}

interface Prefs {
  theme: Theme;
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Switches theme with a circular reveal from the clicked point (spec §02). */
  toggleTheme: (origin?: { x: number; y: number }) => void;
}

export const usePrefs = create<Prefs>((set, get) => ({
  theme: readTheme(),
  lang: readLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem('afifa-lang', lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
  toggleTheme: (origin) => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = next;
      try {
        localStorage.setItem('afifa-theme', next);
      } catch {
        /* ignore */
      }
      set({ theme: next });
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return apply();
    if (!document.startViewTransition || !origin) {
      root.classList.add('theme-fade');
      apply();
      setTimeout(() => root.classList.remove('theme-fade'), 320);
      return;
    }
    const { x, y } = origin;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document
      .startViewTransition(apply)
      .ready.then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => {});
  },
}));
