import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { romeDateKey } from '../domain/romeTime';
import type { Product } from '../domain/types';
import { daysUntil } from '../lib/image';
import { useLang } from '../lib/hooks';
import { ProductIcon } from './ProductIcon';
import { Pill } from './ui';

/** Product photo, or the category line icon when there is no photo yet. */
export function ProductImage({ product, className, iconClass = 'size-11' }: { product: Pick<Product, 'image' | 'icon' | 'name'>; className?: string; iconClass?: string }) {
  const lang = useLang();
  return (
    <div className={clsx('relative grid place-items-center overflow-hidden bg-surface-2', className)}>
      {product.image ? (
        <img src={product.image} alt={product.name[lang]} className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <ProductIcon name={product.icon} className={clsx('text-fg', iconClass)} />
      )}
    </div>
  );
}

export function formatDay(dateKey: string, lang: 'en' | 'it') {
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${dateKey}T12:00:00Z`));
}

/** Best-before date. Red when expired or within 30 days, amber within 90 days. */
export function ExpiryBadge({ date, long }: { date: string | null; long?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!date) return null;
  const days = daysUntil(date, romeDateKey());
  const tone = days < 0 || days <= 30 ? 'bad' : days <= 90 ? 'warn' : 'muted';
  const label = days < 0 ? t('product.expired', { date: formatDay(date, lang) }) : t('product.bestBefore', { date: formatDay(date, lang) });
  return (
    <Pill tone={tone}>
      {label}
      {long && days >= 0 && days <= 90 && ` · ${t('product.daysLeft', { count: days })}`}
    </Pill>
  );
}
