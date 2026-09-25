import clsx from 'clsx';
import { Minus, Moon, Plus, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/queries';
import { usePrefs } from '../store/prefs';

/** Theme button: 32px square, sun in light, moon in dark, icon rotates and cross-fades (spec §02). */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = usePrefs((s) => s.theme);
  const toggle = usePrefs((s) => s.toggleTheme);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={(e) => toggle({ x: e.clientX || e.currentTarget.getBoundingClientRect().left + 16, y: e.clientY || e.currentTarget.getBoundingClientRect().top + 16 })}
      aria-label={dark ? t('theme.toLight') : t('theme.toDark')}
      title={dark ? t('theme.dark') : t('theme.light')}
      className={clsx(
        'relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-line-strong bg-surface text-fg',
        'transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-[.94]',
        className,
      )}
    >
      <Sun className={clsx('absolute size-4 transition-[transform,opacity] duration-[450ms] ease-out-expo', dark ? 'rotate-90 scale-40 opacity-0' : 'opacity-100')} aria-hidden />
      <Moon className={clsx('absolute size-4 transition-[transform,opacity] duration-[450ms] ease-out-expo', dark ? 'opacity-100' : '-rotate-90 scale-40 opacity-0')} aria-hidden />
    </button>
  );
}

export function LangSwitch({ className }: { className?: string }) {
  const lang = usePrefs((s) => s.lang);
  const setLang = usePrefs((s) => s.setLang);
  return (
    <div className={clsx('inline-flex h-8 overflow-hidden rounded-lg border border-line-strong text-xs font-medium', className)} role="group" aria-label="Language / Lingua">
      {(['en', 'it'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => {
            setLang(l);
            void api.setMyLang(l);
          }}
          className={clsx('px-2.5 uppercase transition-colors', lang === l ? 'bg-primary text-primary-ink' : 'text-muted hover:text-fg')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 999, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-line-strong" role="group" aria-label={label}>
      <button type="button" className="grid h-full w-8 place-items-center bg-surface-2 transition-colors hover:bg-line disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="−">
        <Minus className="size-3.5" />
      </button>
      <input
        className="num h-full w-10 bg-transparent text-center text-sm font-medium outline-none"
        inputMode="numeric"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
      <button type="button" className="grid h-full w-8 place-items-center bg-surface-2 transition-colors hover:bg-line disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="+">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/** Countdown to a server instant. Digits slide in as they change (spec: motion). */
export function Countdown({ to, now, size = 'lg' }: { to: Date; now: Date; size?: 'lg' | 'inline' }) {
  const { t } = useTranslation();
  const s = Math.max(0, Math.floor((to.getTime() - now.getTime()) / 1000));
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0'));
  if (size === 'inline') return <b className="num font-bold tracking-wide">{parts.join(':')}</b>;
  const labels = [t('sale.hh'), t('sale.mm'), t('sale.ss')];
  return (
    <div className="flex gap-2" role="timer" aria-label={`${parts[0]}:${parts[1]}:${parts[2]}`}>
      {parts.map((p, i) => (
        <div key={i} className="grid min-w-16 justify-items-center overflow-hidden rounded-xl border border-line bg-surface-2 px-2 pb-1.5 pt-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.b key={p} className="num text-[28px] font-bold leading-tight" initial={{ y: -8, opacity: 0.2 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
              {p}
            </motion.b>
          </AnimatePresence>
          <small className="text-[10.5px] uppercase tracking-[.1em] text-muted">{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}
