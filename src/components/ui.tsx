import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

/* ---------- Button ---------- */

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover border-transparent',
  ghost: 'bg-surface text-fg border-line-strong hover:bg-surface-2',
  quiet: 'bg-transparent text-fg border-transparent hover:bg-surface-2',
  danger: 'bg-surface text-bad border-line-strong hover:bg-bad-soft',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium',
        'transition-[background-color,border-color,transform,opacity] duration-150 active:scale-[.97]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        size === 'md' ? 'h-9 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        block && 'w-full',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/* ---------- Form fields ---------- */

const inputBase =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-fg placeholder:text-muted/70 ' +
  'transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--text)_30%,var(--line-strong))] ' +
  'focus:border-fg focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={clsx(inputBase, invalid && 'border-bad ring-[3px] ring-bad-soft', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputBase, 'appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: 'var(--chevron)' }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12.5px] text-bad">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** Euro amount input with an inline € prefix. Empty string = "inherit" where a placeholder explains it. */
export function EuroInput({ value, onChange, placeholder, id, invalid }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string; invalid?: boolean }) {
  return (
    <div className={clsx('flex h-9 w-32 items-center overflow-hidden rounded-lg border border-line-strong bg-surface focus-within:border-fg focus-within:ring-[3px] focus-within:ring-[var(--ring)]', invalid && 'border-bad')}>
      <span className="grid h-full place-items-center bg-surface-2 px-2 text-[13px] text-muted">€</span>
      <input id={id} inputMode="decimal" className="num h-full w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Status pill ---------- */

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const tones: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  muted: 'bg-surface-2 text-muted',
};

export function Pill({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', tones[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function OffBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('num inline-block rounded-md bg-inv-bg px-2 py-0.5 text-xs font-bold tracking-wide text-inv-fg', className)}>{children}</span>;
}

/* ---------- Surfaces ---------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-line bg-surface shadow-1', className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
        {sub && <p className="text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-surface-2', className)} aria-hidden />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-[46ch] text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-[11.5px] font-medium uppercase tracking-[.08em] text-muted">{children}</h2>;
}
