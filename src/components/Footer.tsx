import clsx from 'clsx';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePublicSettings } from '../api/queries';
import type { FooterLink, FooterSettings } from '../domain/types';
import { useLang } from '../lib/hooks';
import { Brand } from './Brand';

const withYear = (s: string) => s.split('{year}').join(String(new Date().getFullYear()));

function FooterAnchor({ link, className }: { link: FooterLink; className?: string }) {
  const lang = useLang();
  const label = link.label[lang] || link.label.en;
  if (link.href.startsWith('/')) return <Link to={link.href} className={className}>{label}</Link>;
  const external = /^https?:/i.test(link.href);
  return <a href={link.href} className={className} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>;
}

/** Full footer for the reseller shop. Content comes from Settings › Footer. */
export function FooterView({ footer, variant }: { footer: FooterSettings; variant: 'shop' | 'admin' }) {
  const { t } = useTranslation();
  const lang = useLang();
  const linkCls = 'text-muted underline-offset-4 transition-colors hover:text-fg hover:underline';

  if (variant === 'admin') {
    return (
      <footer className="no-print border-t border-line bg-surface px-4 py-4 text-[12.5px] sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-muted">{withYear(footer.copyright[lang] || footer.copyright.en)}</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t('footer.links')}>
            {footer.links.map((l, i) => <FooterAnchor key={i} link={l} className={linkCls} />)}
            {footer.email && <a href={`mailto:${footer.email}`} className={linkCls}>{footer.email}</a>}
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="no-print border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <Brand />
          {(footer.about[lang] || footer.about.en) && <p className="max-w-[40ch] text-sm leading-relaxed text-muted">{footer.about[lang] || footer.about.en}</p>}
        </div>
        <div className="grid content-start gap-2.5 text-sm">
          <h2 className="text-[11.5px] font-medium uppercase tracking-[.08em] text-muted">{t('footer.contact')}</h2>
          {footer.email && <a href={`mailto:${footer.email}`} className="flex items-center gap-2 hover:underline"><Mail className="size-4 text-muted" /> {footer.email}</a>}
          {footer.phone && <a href={`tel:${footer.phone.replace(/\s/g, '')}`} className="num flex items-center gap-2 hover:underline"><Phone className="size-4 text-muted" /> {footer.phone}</a>}
          {footer.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" /> {footer.address}</p>}
          {(footer.hours[lang] || footer.hours.en) && <p className="flex items-center gap-2"><Clock className="size-4 text-muted" /> {footer.hours[lang] || footer.hours.en}</p>}
        </div>
        {footer.links.length > 0 && (
          <nav className="grid content-start gap-2.5 text-sm" aria-label={t('footer.links')}>
            <h2 className="text-[11.5px] font-medium uppercase tracking-[.08em] text-muted">{t('footer.links')}</h2>
            {footer.links.map((l, i) => <FooterAnchor key={i} link={l} className={linkCls} />)}
          </nav>
        )}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1280px] px-4 py-4 text-[12.5px] text-muted sm:px-6">{withYear(footer.copyright[lang] || footer.copyright.en)}</p>
      </div>
    </footer>
  );
}

/** Global footer: reads Settings › Footer and respects the per-area switch. */
export function Footer({ variant, className }: { variant: 'shop' | 'admin'; className?: string }) {
  const settings = usePublicSettings();
  const footer = settings.data?.footer;
  if (!footer || (variant === 'shop' ? !footer.showOnShop : !footer.showOnAdmin)) return null;
  return (
    <div className={clsx(className)}>
      <FooterView footer={footer} variant={variant} />
    </div>
  );
}
