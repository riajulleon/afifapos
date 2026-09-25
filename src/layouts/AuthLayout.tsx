import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from '../components/Brand';
import { LangSwitch, ThemeToggle } from '../components/controls';

/** Split screen: black brand panel (desktop only) + form. Language and theme sit top right. */
export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="inv relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <Brand sub="Ingrosso" />
        <div className="grid gap-5">
          <h2 className="max-w-[15ch] text-[34px] font-bold leading-[1.1] tracking-tight">{t('auth.pitch')}</h2>
          <ul className="grid gap-2.5 text-[15px] text-muted">
            {['auth.b1', 'auth.b2', 'auth.b3'].map((k) => (
              <li key={k} className="flex gap-2.5"><span aria-hidden>→</span>{t(k)}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted">{t('auth.wholesaleOnly')}</p>
      </aside>
      <main className="flex flex-col px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <span className="lg:invisible"><Brand /></span>
          <div className="flex items-center gap-2">
            <LangSwitch />
            <ThemeToggle />
          </div>
        </div>
        <div className={`mx-auto flex w-full flex-1 flex-col justify-center py-10 ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>{children}</div>
      </main>
    </div>
  );
}
