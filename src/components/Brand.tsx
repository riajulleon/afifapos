import clsx from 'clsx';
import { usePublicSettings } from '../api/queries';
import { usePrefs } from '../store/prefs';

/** Brand mark from Settings › Appearance. Falls back to a monogram when no logo is uploaded (BRAND-01). */
export function Brand({ className, sub }: { className?: string; sub?: string }) {
  const settings = usePublicSettings();
  const theme = usePrefs((s) => s.theme);
  const b = settings.data?.branding;
  const name = b?.brandName ?? 'Afifa Wholesale';
  const logo = theme === 'dark' ? b?.logoDark ?? b?.logoLight : b?.logoLight;
  if (logo) return <img src={logo} alt={name} className={clsx('h-7 w-auto max-w-40 object-contain', className)} />;
  return (
    <span className={clsx('flex items-center gap-2 font-bold tracking-tight', className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-[15px] text-primary-ink">{name.trim().charAt(0).toUpperCase()}</span>
      <span className="text-[17px] leading-none">{name.split(' ')[0]}</span>
      {sub && <span className="text-[10px] font-medium uppercase tracking-[.1em] text-muted">{sub}</span>}
    </span>
  );
}
