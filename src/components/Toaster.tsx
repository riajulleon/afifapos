import clsx from 'clsx';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';
import { useToasts } from '../store/toasts';

/** Toasts slide in from the right with a slight overshoot and a 6 s life bar (spec: notifications). */
export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="no-print pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top,0px)+64px)] z-50 grid w-[min(340px,calc(100vw-32px))] gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={clsx(
              'pointer-events-auto grid gap-1 overflow-hidden rounded-xl border border-line bg-surface px-4 pb-0 pt-3 shadow-3',
              t.tone === 'ok' && 'border-l-[3px] border-l-ok',
              t.tone === 'bad' && 'border-l-[3px] border-l-bad',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <b className="text-sm font-medium">{t.title}</b>
              <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
            {t.body && <p className="text-[13px] text-muted">{t.body}</p>}
            {t.action && (
              <Link to={t.action.to} onClick={() => dismiss(t.id)} className="justify-self-start text-[13px] font-medium underline underline-offset-4">
                {t.action.label}
              </Link>
            )}
            <div className="mt-2.5 h-0.5 bg-surface-2">
              <motion.div className="h-full bg-fg" initial={{ width: '100%' }} animate={{ width: 0 }} transition={{ duration: 6, ease: 'linear' }} />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
