import { Download, Eye, FileText, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UploadedDoc } from '../domain/types';
import { getFile } from '../lib/fileStore';
import { formatBytes } from '../lib/validate';
import { Button } from './ui';

/**
 * A document chip with View and Download (APR-02). Images and PDFs open in an in-page viewer; other files download.
 * Sample documents in the demo have no file behind them, and say so.
 */
export function DocChip({ doc, label }: { doc: UploadedDoc; label?: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const viewable = /^image\/|application\/pdf/.test(doc.type);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const load = async () => {
    if (url) return url;
    const blob = doc.fileId ? await getFile(doc.fileId) : null;
    if (!blob) {
      setMissing(true);
      return null;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return u;
  };

  const download = async () => {
    const u = await load();
    if (!u) return;
    const a = document.createElement('a');
    a.href = u;
    a.download = doc.name;
    a.click();
  };

  return (
    <div className="grid gap-1">
      <div className="grid gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px]">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="min-w-0">
            {label && <b className="block font-medium">{label}</b>}
            <p className="truncate text-muted" title={doc.name}>{doc.name} · {formatBytes(doc.size)}{doc.uploadedBy === 'admin' ? ` · ${t('docs.byAdmin')}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {viewable && <Button size="sm" variant="quiet" onClick={async () => { if (await load()) setOpen(true); }}><Eye className="size-4" /> {t('docs.view')}</Button>}
          <Button size="sm" variant="quiet" onClick={download}><Download className="size-4" /> {t('docs.download')}</Button>
        </div>
      </div>
      {missing && <p className="text-xs text-muted">{t('docs.sample')}</p>}
      <AnimatePresence>
        {open && url && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={doc.name}>
            <motion.div className="grid h-[88vh] w-full max-w-4xl grid-rows-[auto_1fr] overflow-hidden rounded-xl bg-surface shadow-3" initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <b className="min-w-0 flex-1 truncate text-sm font-medium">{doc.name}</b>
                <Button size="sm" variant="ghost" onClick={download}><Download className="size-4" /> {t('docs.download')}</Button>
                <Button size="sm" variant="quiet" onClick={() => setOpen(false)} aria-label={t('common.close')}><X className="size-4" /></Button>
              </div>
              {doc.type.startsWith('image/') ? (
                <div className="grid place-items-center overflow-auto bg-canvas p-4"><img src={url} alt={doc.name} className="max-h-full max-w-full object-contain" /></div>
              ) : (
                <iframe src={url} title={doc.name} className="size-full bg-white" />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
