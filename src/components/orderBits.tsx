import clsx from 'clsx';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { formatRome } from '../domain/romeTime';
import type { Order, OrderStatus, PaymentStatus } from '../domain/types';
import { useLang } from '../lib/hooks';
import { Pill } from './ui';

export const FLOW: OrderStatus[] = ['received', 'confirmed', 'shipped', 'delivered'];

export function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const tone = status === 'received' ? 'warn' : status === 'delivered' ? 'ok' : status === 'cancelled' ? 'bad' : 'info';
  return <Pill tone={tone}>{t(`status.${status}`)}</Pill>;
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  const tone = status === 'paid' ? 'ok' : status === 'awaiting' ? 'warn' : status === 'refunded' ? 'muted' : 'info';
  return <Pill tone={tone}>{t(`pay.${status}`)}</Pill>;
}

/** Four-step tracking bar (Received, Confirmed, Shipped, Completed); the fill animates to the current step (spec §08). */
export function TrackingBar({ order }: { order: Order }) {
  const { t } = useTranslation();
  const lang = useLang();
  const at = FLOW.indexOf(order.status);
  return (
    <ol className="relative grid grid-cols-4">
      <div className="absolute left-[12.5%] right-[12.5%] top-[13px] h-[3px] rounded bg-line" aria-hidden />
      <motion.div className="absolute left-[12.5%] top-[13px] h-[3px] rounded bg-primary" initial={{ width: 0 }} animate={{ width: `${(Math.max(0, at) / (FLOW.length - 1)) * 75}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} aria-hidden />
      {FLOW.map((s, i) => {
        const h = order.history.find((x) => x.status === s);
        const done = i < at || (i === at && s === 'delivered');
        const now = i === at && s !== 'delivered';
        return (
          <li key={s} className="relative grid justify-items-center gap-1.5 text-center" aria-current={now ? 'step' : undefined}>
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 380, damping: 22 }}
              className={clsx('num grid size-7 place-items-center rounded-full border-2 bg-surface text-[11px] font-medium', done && 'border-primary bg-primary text-primary-ink', now && 'border-primary text-fg ring-[5px] ring-primary-soft', !done && !now && 'border-line text-muted')}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </motion.span>
            <b className={clsx('text-[12.5px] font-medium', !done && !now && 'text-muted')}>{t(`status.${s}`)}</b>
            <small className="text-[11px] text-muted">{h ? formatRome(h.at, lang).split(', ').pop() : '—'}</small>
          </li>
        );
      })}
    </ol>
  );
}
